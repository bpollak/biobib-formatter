/**
 * AI Conversion Pipeline
 *
 * Converts a parsed CV to a UCSD BioBib by issuing scoped, parallel
 * AI calls — one per logical slice — and merging the partial results.
 *
 * Why chunked: a single call generating the full ConversionResult JSON
 * for a 150+ publication CV produces 30K+ output tokens, which takes
 * 5–10 minutes of wall time and can exceed serverless function caps.
 * Splitting into smaller calls run in parallel keeps each call well under
 * the Vercel function cap and total wall time near max(durations).
 */

import {
  ParsedCV,
  ConversionResult,
  BioBibSections,
  BioBibGap,
  BioBibReviewNote,
  PublicationEntry,
} from '../types';
import { LITELLM_BASE_URL, LITELLM_ON_PREM_MODEL } from '../constants';
import { fetchWithRateLimitRetry } from './fetch-with-retry';
import { buildResponseSchema } from './response-schema';
import { SliceKey } from './slices';
import { sanitizePartialResult } from './sanitize';
import { batchSourceRecords, recordsForSlice, sourceRecords, isBibliographyRecord, type SourceRecord } from './source-records';
import { validateCoveredResult, combineCoveredParts, CoverageError, type SourceCoverage } from './coverage';
import {
  dedupeBy,
  dedupeComparableStrings,
  dedupeStrings,
  hasText,
  normalizeForDedupe,
  normalizeForComparison,
  normalizeServiceRecordForComparison,
  normalizeStudentGroupHeading,
  sortChronologically,
  stripStudentGroupPrefix,
} from '../text-utils';
import {
  cleanGeneratedRecord,
  sortByInitialDate,
  splitLeadingDate,
  stripLeadingSourceNumber,
} from '../date-utils';

// ── BioBib reference text shared by all section prompts ──────────────────────

const BIOBIB_INSTRUCTIONS_INLINE = `
Section I: Employment History and Education
- List all applicable employment chronologically from first academic or research position to present
- Preserve month-level date ranges when present in the CV
- Include teaching assistantships, research assistantships, visiting academic appointments, and UC employment when listed as appointments/employment
- Do not convert honors, fellowships, committee service, talks, or grant roles into employment unless the CV explicitly lists them as employment or appointments
- Education: list schools, dates, location, major, degree, date received

Section II: Professional Data (UCSD BioBib categories — preserve dates and labels):
1. University Service (departmental, college, Academic Senate, campus, systemwide)
2. Public Service
3. Memberships
4. Awards and Honors (with dates)
5. Contracts and Grants (title, agency, total award including indirect costs if available, time period, role, co-PI share)
6. External Professional Activities (committee service, conference organization, consulting, reviewing, funding agencies, journals, presentations)
7. Contributions to Promoting Diversity
8. Other Activities
9. Student Instructional Activities (doctoral students, postdocs, masters students, undergraduates, visitors, staff scientists)
10. External Reviews of Primary Creative Work

Section III – Bibliography
All citations must be numbered, chronological, discipline-appropriate format.

A. Primary Published Work or Creative Work:
  I. Refereed Journal Articles
  II. Review and Invited Articles
  III. Books and Book Chapters (separate subcategories)
  IV. Refereed Conference Proceedings (include acceptance rate if available)
  V. Other Articles
B. Other Work
  - Other Conference Proceedings
  - Abstracts of Non-Refereed Conference Proceedings
  - Popular Works
  - Additional Products (theses, patents/licenses, software, datasets, etc.)
C. Work in Progress (optional — only if submitting material with file)
`.trim();

const BASE_SYSTEM = `You are an expert in UC San Diego academic affairs, specifically the Academic Biography and Bibliography (BioBib) form used for faculty academic reviews.

Your task is to extract part of a UCSD BioBib from a faculty CV. You must:
1. Extract ONLY the fields you are asked to extract in this call. Leave every other field as an empty array or empty string.
2. Preserve citation formatting exactly as it appears in the CV — do not reformat citations.
3. Identify gaps sparingly. Only flag true missing data for fields in your slice when the BioBib explicitly requires manual completion. Do not create gaps for optional empty sections.
4. Prefer empty arrays over speculative entries. If the CV does not provide a section, leave the corresponding array empty.
5. Ignore generated conversion appendices such as "Conversion Review Summary", "Manual Completion Items", "Placement and Duplication Review Notes", document-link fields, and signature fields. They are reviewer instructions, not CV source content.

UCSD BioBib reference:
${BIOBIB_INSTRUCTIONS_INLINE}`;

// ── Section slice definitions ────────────────────────────────────────────────
// SliceKey / SLICE_KEYS live in ./slices so the client UI can share them.

// Year boundaries keep prolific CVs from producing >12K-token JSON slices.
const JOURNAL_PRE_2000_END = 1999;
const JOURNAL_MID_START = 2000;
const JOURNAL_MID_END = 2010;
const ABSTRACT_PRE_2000_END = 1999;
const ABSTRACT_MID_START = 2000;
const ABSTRACT_MID_END = 2010;
const ABSTRACT_LATE_START = 2011;
const ABSTRACT_LATE_END = 2020;
const ABSTRACT_POST_2020_START = 2021;
const PRESENTATION_PRE_2000_END = 1999;
const PRESENTATION_MID_START = 2000;
const PRESENTATION_MID_END = 2010;
const PRESENTATION_LATE_START = 2011;
const PRESENTATION_LATE_END = 2020;
const PRESENTATION_POST_2020_START = 2021;

export interface PartialResult {
  coverage?: SourceCoverage;
  sections: Partial<BioBibSections>;
  gaps?: BioBibGap[];
  reviewNotes?: BioBibReviewNote[];
  metadata?: ConversionResult['metadata'];
}

export type ModelProvider = 'cloud' | 'onPrem';

export interface ModelCredentials {
  cloudApiKey?: string;
  onPremApiKey?: string;
}

export interface SliceModelCandidate {
  provider: ModelProvider;
  model: string;
  maxTokens: number;
  reasoningEffort?: 'low' | 'high';
}

const ON_PREM_MAX_TOKENS = Number(process.env.LITELLM_ON_PREM_MAX_TOKENS || 32768);

export function modelCandidatesForSlice(
  _slice: SliceKey,
  available: Partial<Record<ModelProvider, boolean>> = { cloud: true, onPrem: true },
): SliceModelCandidate[] {
  // Use the selected on-prem model for every section, even if a legacy cloud
  // credential remains configured in the deployment environment.
  return available.onPrem === false ? [] : [
    {
      provider: 'onPrem', model: LITELLM_ON_PREM_MODEL, maxTokens: ON_PREM_MAX_TOKENS,
      // GLM 5.3 defaults to maximum reasoning, which can consume the budget
      // before a long extraction's JSON is complete. Other models may not
      // support this parameter, so only send it to the verified GLM family.
      ...(/^(?:api-)?glm-5\.3(?:-flash)?$/i.test(LITELLM_ON_PREM_MODEL)
        ? { reasoningEffort: 'high' as const } : {}),
    },
  ];
}

const PRESENTATION_RULES = `
- Extract invited/keynote/plenary seminars, invited departmental seminars, named lectures, and selected national/international meeting presentations.
- Put items under CV headings like "Invited Lectures at National and International Meetings", "National and International Meetings", conference presentations, symposium presentations, workshop presentations, and society meeting presentations in "presentations".
- Put items under CV headings like "Invited Lectures at Institutions", "Invited Departmental Seminars", "Institutional Seminars", university seminars, departmental seminars, and named campus lectures in "invitedPresentations".
- Extract every eligible presentation in this slice's requested date range. A source "New" marker or last-review divider labels records; it does not authorize dropping older records. Apply a narrower review period only when the user-provided review-period restriction below explicitly requires it.
- Exclude posters, contributed talks, conference abstracts, co-author abstracts, and numbered abstract lists; those belong in Section III abstracts, not Section II.
- Exclude grant review panels, editorial boards, conference organization, and professional committee service; those belong in externalProfessionalActivities or reviewerActivities.
- Return concise presentation strings without leading source numbering such as "1." or "23.".
- If a source presentation starts with a date, move that date to the end of the returned record.
- Preserve the source date at its original precision when moving it. For example, "May 20, 1995" must remain "May 20, 1995" at the end, not be shortened to "1995".
- Copy the source date wording literally, including month abbreviations; do not expand an abbreviated month or substitute a different date format.
`.trim();

const SERVICE_RULES = `
- Extract University Service and Public Service only. Do not extract professional society service, external reviewing, memberships, honors, awards, grants, teaching, or presentations.
- Retain administrative leadership of grant-funded training programs when the CV lists those roles under university service. A director or co-director service appointment is distinct from the grant funding record; preserve each separate service period without copying grant amounts or funding details.
- Keep service entries concise: description in "description", bare year/range in "dates" without surrounding parentheses.
- Do not prefix service descriptions with their category name; use "Graduate Recruitment Committee", not "Departmental Graduate Recruitment Committee".
- Chronological order means oldest first by the initial date of service; for date ranges, use the first date in the range.
- Put dates in the "dates" field when a structured service record has one. For string-only public-service records, put the date at the end.
`.trim();

// Journal and review slices must agree on ownership, or each can exclude the
// same record as belonging to the other and it silently leaves the document.
const JOURNAL_RULES = `
- The source heading decides ownership. Every record in this date window listed under a journal-article or research-paper heading (for example "Peer-reviewed Research Papers", "Journal Articles", "Refereed Publications") belongs in peerReviewedJournals, even when its content is a review, synthesis, perspective, or commentary. Set articleKind to "review" when the record is evidently a review; do not exclude it.
- Leave records to the Review and Invited Articles task only when the source lists them under a separate review or invited-article heading.
`.trim();

const SERVICE_SCHEMA = `{
  "sections": {
    "universityService": [{"description": "", "dates": "", "category": "departmental|college|campus|university|senate|systemwide|other"}],
    "publicService": [""]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`;

function serviceSlicePrompt(periodRule: string): {
  fields: string;
  schema: string;
  rules: string;
} {
  return {
    fields: `Section II subset: universityService and publicService whose initial date matches this period: ${periodRule}`,
    rules: `${SERVICE_RULES}
- Include only records whose initial date matches this slice's period. For a date range, classify the record by its first date.`,
    schema: SERVICE_SCHEMA,
  };
}

const SLICE_PROMPTS: Record<SliceKey, { fields: string; schema: string; rules?: string }> = {
  meta_and_I: {
    fields:
      'metadata (name in Last, First Middle format when inferable, department, title), Section I (employment, education, specialization)',
    rules: `
- Employment: use only true employment, academic appointments, and research/teaching assistantships from the CV's employment/appointments history.
- Include Teaching Assistant and Research Assistant roles when listed in the CV, with their exact intermittent/month-level dates.
- Preserve separate UCSD professor rank/step periods instead of collapsing them into one long Professor row.
- Preserve Distinguished Professor appointments as their own employment rows, including the complete title, institution, and date range; do not shorten them to Professor or merge them into a concurrent Professor appointment.
- Exclude honors/fellowships/scholar designations, sabbaticals, visiting lecture/fellow titles, committee/service roles, Academic Senate offices, grant roles, and future chair designations unless the CV explicitly lists them in employment history.
- Do not put Professore Visitatore, Wilsmore Fellow, Aarhus University Faculty Fellow, Kurt Shuler Scholar, Academic Senate Chair, Department Chair, Senior Associate Vice Chancellor, or Distinguished Chair in employment unless the CV's employment section says they are employment appointments.
- Education: preserve exact attendance ranges, locations, major fields, degree names, and date received exactly as shown; do not reduce "9/79 - 5/83" to just "1983".
`.trim(),
    schema: `{
  "metadata": { "name": "", "department": "", "title": "" },
  "sections": {
    "employment": [{"from": "", "to": "", "institution": "", "location": "", "rank": ""}],
    "education": [{"school": "", "datesFrom": "", "datesTo": "", "location": "", "major": "", "degree": "", "dateReceived": ""}],
    "specialization": ""
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  II_service_pre_2010: serviceSlicePrompt('2010 or earlier'),
  II_service_2011_2020: serviceSlicePrompt('2011 through 2020, inclusive'),
  II_service_post_2020: serviceSlicePrompt('2021 or later'),
  II_memberships_awards: {
    fields: 'Section II subset: memberships and awards only',
    rules: `
- Memberships must include scholarly societies, professional boards, civic/professional organizations, elected fellow memberships, and honor societies when listed.
- Do not omit general society memberships such as AGU, RSC, AAAS, APS, ACS, or Phi Beta Kappa when present.
- Honors and awards should include fellowships, awards, named honors, elected fellow distinctions, and honorific or short-term visiting appointments with dates.
- Include academic and graduation honors listed under Education, preserving the associated degree year when explicitly provided.
- Include Distinguished Professor distinctions with their complete title, institution, and date range, including when listed under Appointments. Retain this honor even when the same appointment also belongs in employment history; do not confuse it with an ordinary Professor rank.
- When the CV lists appointment-like honors under an "Appointments" heading, classify Visiting Scientist, Professore Visitatore, named Scholar, named Fellow, visiting faculty fellow, and sabbatical/short-term honorific appointments as Honors and Awards unless the CV clearly presents them as ordinary employment.
- Retain EVERY record explicitly listed under the source CV's Honors and Awards headings in awards, even if it also describes a society membership. Do not move an honor out of awards solely because its organization also appears in memberships.
- Elected fellow distinctions and honor-society elections belong in awards with their source dates as well as memberships when both uses are supported. Their membership entry does not replace the dated award entry.
- Do not extract university service, public service, external professional activities, grants, teaching, or presentations.
- Sort memberships and awards chronologically by their initial date and put dates at the end of each string record.
`.trim(),
    schema: `{
  "sections": {
    "memberships": [""],
    "awards": [""]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  II_teaching: {
    fields:
      'Section II subset: teaching, studentInstructionalActivities, and studentInstructionalGroups only. Include doctoral students, masters students, postdocs, undergraduates, visitors, staff scientists, thesis committee service, and mentoring entries. Do not extract grants.',
    rules: `
- Prefer studentInstructionalGroups over a flat studentInstructionalActivities list. Use grouped headings when possible: "Current Doctoral Research Students", "Former Ph.D. Students", "Former Masters Students", "Current Postdoctoral Associates", "Former Postdoctoral Associates", "Current Staff Scientists", "Visiting Faculty/Students", and "Undergraduate Research Students".
- If the CV lists thesis or dissertation committees, create appropriate studentInstructionalGroups such as "Ph.D. Thesis Committees - Chair", "Ph.D. Thesis Committees - Member", "M.F.A. Thesis Committees - Chair", "M.F.A. Thesis Committees - Member", "M.S. Thesis Committees - Chair", and "M.S. Thesis Committees - Member".
- Entries within each studentInstructionalGroups group should be chronological when dates are available.
- Do not prefix each entry with the group heading; put the category only in the group's "heading" field.
- Include advisee theses and dissertation supervision here, not in Section III theses.
- Do not extract regular course lists into the BioBib unless they document student direction or mentoring. Regular classes taught generally do not belong in the BioBib.
- Do not extract contracts, grants, publications, abstracts, or presentation lists into teaching/studentInstructionalActivities.
`.trim(),
    schema: `{
  "sections": {
    "teaching": [""],
    "studentInstructionalActivities": [""],
    "studentInstructionalGroups": [{"heading": "", "entries": [""]}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  II_grants: {
    fields:
      'Section II subset: contracts/grants only. Extract current and past support with title, funder/agency, amount or totalAward including indirect costs when available, period, role, and co-PI/corresponding share when available.',
    rules: `
- Current grants are active or future-ending awards; past grants are completed awards.
- Preserve the CV's title, agency, total-cost wording, dates, PI/co-PI role, and co-PI share when available.
- Do not include fellowships or awards unless they are explicitly listed as research support/contracts/grants.
- Sort current and past grants chronologically by the initial date in the grant period when the CV provides one. Sparse dates are still useful; preserve them.
`.trim(),
    schema: `{
  "sections": {
    "grants": [{"title": "", "funder": "", "amount": "", "totalAward": "", "period": "", "status": "current|past", "role": "", "coPIsShare": ""}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  II_external: {
    fields:
      'Section II subset: professionalActivities, consulting, reviewerActivities, and externalReviews only. externalProfessionalActivities is a legacy compatibility field and must remain empty. Do not extract presentations or teaching.',
    rules: `
- professionalActivities: committee service, conference organization, advisory boards, editorial roles, review panels, external program reviews, and society service.
- Leave externalProfessionalActivities empty. Do not place the same activity in more than one array.
- reviewerActivities: journal/editorial reviewing, funding-agency panels, manuscript/proposal reviewing, and external academic file reviews.
- externalReviews: significant independent reviews of the faculty member's own work only; do not include reviews performed by the faculty member.
- Do not extract presentation lists, posters, abstracts, teaching, mentoring, or grants in this slice.
- Sort records chronologically by initial date when dates are present, and put dates at the end of string records rather than the beginning.
`.trim(),
    schema: `{
  "sections": {
    "professionalActivities": [""],
    "externalProfessionalActivities": [""],
    "consulting": [""],
    "reviewerActivities": [""],
    "externalReviews": [""]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  II_presentations_pre_2000: {
    fields:
      `Section II subset: presentations and invitedPresentations ONLY for items dated ${PRESENTATION_PRE_2000_END} or earlier. Skip presentations dated ${PRESENTATION_MID_START} or later. Do not extract diversity, outreach, professional committee service, reviewing, teaching, or grants.`,
    rules: PRESENTATION_RULES,
    schema: `{
  "sections": {
    "presentations": [""],
    "invitedPresentations": [""]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  II_presentations_2000_2010: {
    fields:
      `Section II subset: presentations and invitedPresentations ONLY for items dated from ${PRESENTATION_MID_START} through ${PRESENTATION_MID_END}, inclusive. Skip presentations outside that date range. Do not extract diversity, outreach, professional committee service, reviewing, teaching, or grants.`,
    rules: PRESENTATION_RULES,
    schema: `{
  "sections": {
    "presentations": [""],
    "invitedPresentations": [""]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  II_presentations_2011_2020: {
    fields:
      `Section II subset: presentations and invitedPresentations ONLY for items dated from ${PRESENTATION_LATE_START} through ${PRESENTATION_LATE_END}, inclusive. Skip presentations outside that date range. Do not extract diversity, outreach, professional committee service, reviewing, teaching, or grants.`,
    rules: PRESENTATION_RULES,
    schema: `{
  "sections": {
    "presentations": [""],
    "invitedPresentations": [""]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  II_presentations_post_2020: {
    fields:
      `Section II subset: presentations and invitedPresentations ONLY for items dated ${PRESENTATION_POST_2020_START} or later. Skip presentations dated before ${PRESENTATION_POST_2020_START}. Do not extract diversity, outreach, professional committee service, reviewing, teaching, or grants.`,
    rules: PRESENTATION_RULES,
    schema: `{
  "sections": {
    "presentations": [""],
    "invitedPresentations": [""]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  II_diversity_other: {
    fields:
      'Section II subset: diversityContributions, outreach, clinicalActivities, and otherActivities only. Do not extract presentations, professional committee service, reviewing, teaching, or grants.',
    rules: `
- diversityContributions should contain substantive diversity-related leadership, programs, service, training grants, mentoring, and access/equity work.
- otherActivities should contain sabbaticals, outreach, public engagement, and activities that do not fit Section II categories a-f.
- Do not extract presentations, publications, grants, or professional committee service in this slice.
- Preserve short diversity narratives when present, not only bullet-like entries. Sort dated entries chronologically and put dates at the end of string records.
`.trim(),
    schema: `{
  "sections": {
    "diversityContributions": [""],
    "outreach": [""],
    "clinicalActivities": [""],
    "otherActivities": [""]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_journals_pre_2000: {
    fields: `Section III peerReviewedJournals ONLY — refereed journal articles published in ${JOURNAL_PRE_2000_END} or earlier. Skip articles published in ${JOURNAL_MID_START} or later. Put submitted, in-progress, under-review, in-review, or undated journal items in workInProgress instead of peerReviewedJournals. Number the articles you extract sequentially starting from 1 (numbering will be re-done at merge). Include optional articleKind, contributionNote, previouslyListedAs, reviewMaterialUrl, and isNewSinceLastReview ONLY when the CV explicitly provides that information.`,
    rules: JOURNAL_RULES,
    schema: `{
  "sections": {
    "peerReviewedJournals": [{"number": 1, "citation": "", "type": "journal"}],
    "workInProgress": [{"number": 1, "citation": "", "type": "journal"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_journals_2000_2010: {
    fields: `Section III peerReviewedJournals ONLY — refereed journal articles published from ${JOURNAL_MID_START} through ${JOURNAL_MID_END}, inclusive. Skip articles outside that date range. Put submitted, in-progress, under-review, in-review, or undated journal items in workInProgress instead of peerReviewedJournals. Number the articles you extract sequentially starting from 1 (numbering will be re-done at merge). Include optional articleKind, contributionNote, previouslyListedAs, reviewMaterialUrl, and isNewSinceLastReview ONLY when the CV explicitly provides that information.`,
    rules: JOURNAL_RULES,
    schema: `{
  "sections": {
    "peerReviewedJournals": [{"number": 1, "citation": "", "type": "journal"}],
    "workInProgress": [{"number": 1, "citation": "", "type": "journal"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_journals_late: {
    fields: `Section III peerReviewedJournals ONLY — refereed journal articles published AFTER ${JOURNAL_MID_END}. Skip articles published in ${JOURNAL_MID_END} or earlier. Put submitted, in-progress, under-review, in-review, or undated journal items in workInProgress instead of peerReviewedJournals. Number the articles you extract sequentially starting from 1 (numbering will be re-done at merge). Include optional articleKind, contributionNote, previouslyListedAs, reviewMaterialUrl, and isNewSinceLastReview ONLY when the CV explicitly provides that information.`,
    rules: JOURNAL_RULES,
    schema: `{
  "sections": {
    "peerReviewedJournals": [{"number": 1, "citation": "", "type": "journal"}],
    "workInProgress": [{"number": 1, "citation": "", "type": "journal"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_other_a: {
    fields:
      'Section III subset A: reviewAndInvited (review and invited articles), books, chapters, and otherArticles. Put submitted, in-progress, under-review, in-review, or undated items in workInProgress instead of published categories. Number sequentially within each subsection starting at 1. Include optional articleKind, contributionNote, previouslyListedAs, reviewMaterialUrl, and isNewSinceLastReview ONLY when the CV explicitly provides that information.',
    rules: '- Include reviewAndInvited only for records listed under a review or invited-article heading, or explicitly labeled as review/invited within a general publications list without a separate journal-article heading. Records under a journal-article or research-paper heading belong to the journal task; exclude them here with that reason.',
    schema: `{
  "sections": {
    "reviewAndInvited": [{"number": 1, "citation": "", "type": "review"}],
    "books": [{"number": 1, "citation": "", "type": "book"}],
    "chapters": [{"number": 1, "citation": "", "type": "chapter"}],
    "otherArticles": [{"number": 1, "citation": "", "type": "other"}],
    "workInProgress": [{"number": 1, "citation": "", "type": "other"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_other_proc: {
    fields:
      'Section III subset proceedings: refereedProceedings and otherProceedings. Put submitted, in-progress, under-review, in-review, or undated refereed proceedings in workInProgress instead of published categories. Number sequentially within each subsection starting at 1. Refereed proceedings belong under Primary Published Work; non-refereed conference proceedings belong under Other Work.',
    schema: `{
  "sections": {
    "refereedProceedings": [{"number": 1, "citation": "", "type": "proceedings"}],
    "otherProceedings": [{"number": 1, "citation": "", "type": "proceedings"}],
    "workInProgress": [{"number": 1, "citation": "", "type": "proceedings"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_abstracts_pre_2000: {
    fields: `Section III abstracts ONLY — abstracts published in ${ABSTRACT_PRE_2000_END} or earlier. Skip abstracts published in ${ABSTRACT_MID_START} or later. Number sequentially starting at 1 (numbering will be re-done at merge).`,
    rules: '- Do not preserve source ordering placeholders such as "(22)" or "20."; return the abstract citation text only. Sort abstracts chronologically oldest first.',
    schema: `{
  "sections": {
    "abstracts": [{"number": 1, "citation": "", "type": "abstract"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_abstracts_2000_2010: {
    fields: `Section III abstracts ONLY — abstracts published from ${ABSTRACT_MID_START} through ${ABSTRACT_MID_END}, inclusive. Skip abstracts outside that date range. Number sequentially starting at 1 (numbering will be re-done at merge).`,
    rules: '- Do not preserve source ordering placeholders such as "(22)" or "20."; return the abstract citation text only. Sort abstracts chronologically oldest first.',
    schema: `{
  "sections": {
    "abstracts": [{"number": 1, "citation": "", "type": "abstract"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_abstracts_2011_2020: {
    fields: `Section III abstracts ONLY — abstracts published from ${ABSTRACT_LATE_START} through ${ABSTRACT_LATE_END}, inclusive. Skip abstracts outside that date range. Number sequentially starting at 1 (numbering will be re-done at merge).`,
    rules: '- Do not preserve source ordering placeholders such as "(22)" or "20."; return the abstract citation text only. Sort abstracts chronologically oldest first.',
    schema: `{
  "sections": {
    "abstracts": [{"number": 1, "citation": "", "type": "abstract"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_abstracts_post_2020: {
    fields: `Section III abstracts ONLY — abstracts published in ${ABSTRACT_POST_2020_START} or later. Skip abstracts published before ${ABSTRACT_POST_2020_START}. Number sequentially starting at 1 (numbering will be re-done at merge).`,
    rules: '- Do not preserve source ordering placeholders such as "(22)" or "20."; return the abstract citation text only. Sort abstracts chronologically oldest first.',
    schema: `{
  "sections": {
    "abstracts": [{"number": 1, "citation": "", "type": "abstract"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_popular_products: {
    fields:
      'Section III subset miscellaneous: popularWorks, additionalProducts, theses, patents, and workInProgress only. Number sequentially within each subsection starting at 1. Put dissertations/theses in theses and patent or patent-license material in patents.',
    rules: `
- "theses" means the faculty member's own thesis or dissertation only. Do not list advisee/student theses here; those belong in Section II Student Instructional Activities.
- Set isFacultyThesis=true when the CV heading or degree context identifies the record as the faculty member's own thesis or dissertation. Set it false for an explicitly identified advisee/student thesis and do not place that record in theses.
- "patents" should include patents and patent licenses.
- "additionalProducts" should include software, datasets, instruments, formal products, or other major research products, not ordinary publications already captured elsewhere.
- workInProgress should be empty unless the CV explicitly lists work in progress material for review.
`.trim(),
    schema: `{
  "sections": {
    "popularWorks": [{"number": 1, "citation": "", "type": "popular"}],
    "additionalProducts": [{"number": 1, "citation": "", "type": "other"}],
    "theses": [{"number": 1, "citation": "", "type": "other", "isFacultyThesis": true}],
    "patents": [{"number": 1, "citation": "", "type": "other"}],
    "workInProgress": [{"number": 1, "citation": "", "type": "other"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
};

// Slices that honor the user-selected review period (Section II activity
// history). Section I and the Section III bibliography stay cumulative —
// the BioBib requires the full record there.
const REVIEW_PERIOD_SLICES = new Set<SliceKey>([
  'II_service_pre_2010',
  'II_service_2011_2020',
  'II_service_post_2020',
  'II_memberships_awards',
  'II_grants',
  'II_external',
  'II_diversity_other',
  'II_presentations_pre_2000',
  'II_presentations_2000_2010',
  'II_presentations_2011_2020',
  'II_presentations_post_2020',
]);

function reviewPeriodRule(slice: SliceKey, sinceYear?: number): string {
  if (!sinceYear || !REVIEW_PERIOD_SLICES.has(slice)) return '';
  return `

Review period restriction — IMPORTANT:
- The faculty member requested this BioBib cover ${sinceYear} to the present for Section II activities.
- Include ONLY items dated ${sinceYear} or later.
- Include ongoing or spanning items whose date range extends into ${sinceYear} or later (e.g., "2018 - present", "${sinceYear - 2} - ${sinceYear + 1}").
- Include undated items only when context indicates they are current or ongoing.
- Exclude items that ended before ${sinceYear}.`;
}

const buildSliceUserPrompt = (
  cv: ParsedCV,
  slice: SliceKey,
  provider: ModelProvider = 'onPrem',
  sinceYear?: number,
): string => {
  const { fields, schema, rules } = SLICE_PROMPTS[slice];
  const cvText = provider === 'onPrem' ? compactCvTextForSlice(cv.rawText, slice) : cv.rawText;
  const reviewPeriodRules = cv.reviewPeriodStart
    ? `Review-period delimiter:
- The user provided ${cv.reviewPeriodStart} as the "new since last review" date.
- When a record is dated on or after ${cv.reviewPeriodStart}, set isNewSinceLastReview=true for publication records when that field is available.
- For non-publication records, preserve enough date text for the final BioBib generator to insert the review-period divider.

`
    : '';
  return `Extract from this faculty CV the following BioBib fields ONLY: ${fields}.

CV TEXT:
${cvText}

${reviewPeriodRules}
${rules ? `Slice-specific rules:
${rules}

` : ''}Return ONE raw JSON object with this schema. Include every key shown; use empty arrays/strings for items you do not extract. You may add optional publication fields (articleKind, isNewSinceLastReview, isFacultyThesis, previouslyListedAs, contributionNote, reviewMaterialUrl, bioBibSection, originalNumber) only when the CV explicitly provides that information:
${schema}

Output rules — IMPORTANT:
- Respond with raw JSON only. Do NOT wrap the JSON in markdown code fences (no \`\`\`json or \`\`\`). Do NOT prefix or suffix with any prose.
- The first character of your response must be "{" and the last character must be "}".

Content rules:
- Only populate the fields listed above. Do not include keys for other sections.
- Extract EVERY eligible record in the requested section and date window, including records before source "New" markers or last-review dividers. Do not sample, summarize a list, select only recent records, or stop partway through the source. Section III remains cumulative; source review markers are labels, not exclusion rules.
- Preserve citation text exactly — do not reformat or standardize.
- Retain the complete citation, including trailing editorial distinctions such as "Featured in", cover selections, highlighted articles, and linked notes. Do not stop copying at the publication year or DOI when the source citation continues.
- Employment must be chronological (oldest first), preserve month-level dates, and include academic assistantships/appointments when the CV lists them.
- Publications must be chronological oldest first by initial date and numbered sequentially within each subsection. Keep labels such as "New", asterisks, "RESEARCH ARTICLE", "REVIEW ARTICLE", "previously B.1", contribution notes, and URLs if present.
- Section II string records should put dates at the end of the record, not at the beginning.
- Do not preserve source ordering placeholders such as "71.", "(22)", "(21)", or "(20)" in returned strings or citations; generated BioBib numbering will be applied later.
- For Section II categories with no evidence in the CV, return an empty array. Do not add a gap unless the missing item is truly required for BioBib submission.
- For gaps, only flag fields that belong to the slice above. Be specific and actionable.
- severity: "required" = BioBib cannot be submitted without it, "recommended" = strongly advised, "optional" = at faculty discretion.${reviewPeriodRule(slice, sinceYear)}`;
};

export function compactCvTextForSlice(rawText: string, slice: SliceKey): string {
  return recordsForSlice(rawText, slice).map(record => record.text).join('\n\n');
}

// ── Single-slice fetch ───────────────────────────────────────────────────────

// Some upstream models wrap their JSON in markdown code fences despite
// response_format: { type: 'json_object' }. Strip them defensively.
function stripJsonFences(s: string): string {
  const trimmed = s.trim();
  const fence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return (fence ? fence[1] : trimmed).trim();
}

interface CallSliceOptions {
  signal?: AbortSignal;
  /** Earliest year to include for Section II activity slices (inclusive). */
  sinceYear?: number;
}

function supportsCustomTemperature(model: string): boolean {
  return !model.startsWith('gpt-5');
}

async function callSliceOnce(
  cv: ParsedCV,
  slice: SliceKey,
  candidate: SliceModelCandidate,
  apiKey: string,
  options: CallSliceOptions = {},
  records?: SourceRecord[],
  repairHint?: string,
): Promise<PartialResult> {
  const requestBody = {
    model: candidate.model,
    messages: [
      { role: 'system', content: BASE_SYSTEM },
      { role: 'user', content: records ? buildCoveredPrompt(cv, slice, records, options.sinceYear, repairHint) : buildSliceUserPrompt(cv, slice, candidate.provider, options.sinceYear) },
    ],
    // Allow enough room for long on-prem extraction responses and reasoning.
    max_tokens: candidate.maxTokens,
    ...(candidate.reasoningEffort ? { reasoning_effort: candidate.reasoningEffort } : {}),
    response_format: records ? {
      type: 'json_schema',
      json_schema: { name: `biobib_${slice}`, strict: true,
        schema: buildResponseSchema(coveredResponseExample(slice), records.map(record => record.id)) },
    } : { type: 'json_object' },
    ...(supportsCustomTemperature(candidate.model) ? { temperature: 0.1 } : {}),
  };

  const response = await fetchWithRateLimitRetry(`${LITELLM_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: options.signal,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(
      `LiteLLM API error ${response.status} on slice "${slice}" with model "${candidate.model}": ${err}`,
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const finishReason = data.choices?.[0]?.finish_reason;
  if (!content) {
    throw new Error(`Empty response from AI on slice "${slice}" with model "${candidate.model}"`);
  }

  if (finishReason !== 'stop') {
    throw new CoverageError(`Incomplete model response (${finishReason ?? 'unknown finish reason'}) for ${slice}.`, records?.map(record => record.id) ?? []);
  }
  const cleaned = stripJsonFences(content);
  try {
    // Sanitize so a single malformed entry degrades to a dropped item
    // instead of crashing finalize after every slice has finished.
    const raw = JSON.parse(cleaned);
    return records ? validateCoveredResult(raw, records, Object.keys(JSON.parse(SLICE_PROMPTS[slice].schema).sections)) : sanitizePartialResult(raw);
  } catch (e) {
    if (e instanceof CoverageError) throw e;
    const hint =
      finishReason === 'length'
        ? ` (response was truncated at max_tokens — slice "${slice}" is too large for the current output cap)`
        : '';
    throw new Error(
      `AI returned invalid JSON on slice "${slice}" with model "${candidate.model}"${hint}: ${(e as Error).message}`,
    );
  }
}

function coveredResponseExample(slice: SliceKey) {
  const schema = JSON.parse(SLICE_PROMPTS[slice].schema);
  for (const [key, value] of Object.entries(schema.sections)) {
    if (Array.isArray(value)) schema.sections[key] = value.map(entry => typeof entry === 'string'
      ? { text: entry, sourceIds: [] } : { ...entry, sourceIds: [] });
    else schema.sections[key] = { text: value, sourceIds: [] };
  }
  if (schema.metadata) schema.metadata.sourceIds = [];
  schema.excluded = [{ id: 'source ID', reason: 'specific exclusion reason' }];
  return schema;
}

function buildCoveredPrompt(cv: ParsedCV, slice: SliceKey, records: SourceRecord[], sinceYear?: number, repairHint?: string): string {
  const definition = SLICE_PROMPTS[slice];
  const schema = coveredResponseExample(slice);
  return `Extract and classify ONLY these fields: ${definition.fields}.
${definition.rules ?? ''}
${reviewPeriodRule(slice, sinceYear)}
${cv.reviewPeriodStart ? `Mark new-since-review records from ${cv.reviewPeriodStart}; do not exclude older bibliography.` : ''}
${repairHint ? `REPAIR REQUIRED: The previous response failed validation: ${repairHint.slice(0, 500)}. Correct that error for the supplied records. Keep gaps and reviewNotes outside sections. Every output entry must carry its own sourceIds array, including grouped student entries, metadata, and specialization.` : ''}

SOURCE RECORDS (immutable IDs; heading context is evidence, not another record):
${JSON.stringify(records.map(({ id, text, context, heading }) => ({ id, text, context, heading })))}

Use this exact response schema (put source IDs directly on each entry): ${JSON.stringify(schema)}
Every supplied source ID must either support an output entry via sourceIds or appear ONCE in "excluded" with a specific reason (heading, outside requested field/date window, or not faculty CV content). Never silently skip a record or invent an ID. Do not return a separate sources object. Empty output arrays remain empty.
For string-valued lists return objects with text and sourceIds. For structured entries add sourceIds alongside their fields. Example: {"sections":{"awards":[{"text":"Teaching Award (2020)","sourceIds":["s100"]}]},"excluded":[{"id":"s0","reason":"Heading only"}]}.
For studentInstructionalGroups, each group carries sourceIds for ALL student evidence it includes. Example: {"heading":"Doctoral Students","entries":["Student A","Student B"],"sourceIds":["s100","s200"]}. Preserve every student; splitting a long group into several groups with the same heading is allowed.
Metadata and specialization each carry their own sourceIds. Only the identity slice may return metadata. Evidence used for an output must not also be excluded. Multiple distinct facts may cite the same source, but do not duplicate a fact within a field.
For publications, return category/type and optional source-supported metadata, with citation="". The application reconstructs the COMPLETE citation from source IDs; reference only that citation and its continuation/annotation records. Do not include headings in citation references. Retain every eligible publication, including methods/protocol papers, before and after New markers. Do not exclude a peer-reviewed methods paper merely because it is a protocol.
Numbered, citation-formatted records in a Conference Presentations bibliography belong in abstracts, including invited conference contributions. For abstracts slices, include these records within the requested year window even when no published abstract volume is stated. Separate institutional lectures and unnumbered talk lists remain Section II presentations. Never exclude a numbered conference citation merely because it says presentation or invited talk.
For other fields, preserve complete source wording, dates and qualifications. Use neighboring records and heading context to join continuations/table rows. Include every item of grouped student lists, not a summary.
Classify by the activity performed and explicit source heading: service outside UC to the public belongs in publicService; outreach and public education belong in outreach; professional society/editorial/conference service belongs in professionalActivities; consulting requires advisory/consulting work, not every external activity. Preserve a source's explicit category when compatible. Do not relabel public service as outreach solely because both benefit the public.
Return ONE raw JSON object, without fences. No speculative facts or optional gaps. The task is exhaustive extraction, not summarization.`;
}

async function callCoveredSlice(cv: ParsedCV, slice: SliceKey, candidate: SliceModelCandidate, apiKey: string, options: CallSliceOptions): Promise<PartialResult> {
  const records = recordsForSlice(cv.rawText, slice);
  const parts: PartialResult[] = [];
  // Sequential bounded batches within each independently scheduled slice avoid
  // multiplying the gateway concurrency limit. Never retry completed batches.
  async function extract(batch: SourceRecord[], depth = 0, repairHint?: string): Promise<void> {
    try {
      parts.push(await callSliceOnce(cv, slice, candidate, apiKey, options, batch, repairHint));
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) throw error;
      if (depth >= 2) throw error;
      if (error instanceof CoverageError && error.partial) {
        parts.push(error.partial);
        await extract(batch.filter(record => error.unresolvedIds.includes(record.id)), depth + 1, error.message);
        return;
      }
      // Smaller evidence sets also repair truncation and invalid JSON. No record
      // is dropped, and failed batches do not contribute partial outputs.
      const size = Math.max(1, Math.ceil(batch.length / 2));
      for (let offset = 0; offset < batch.length; offset += size) {
        await extract(batch.slice(offset, offset + size), depth + 1, (error as Error).message);
      }
    }
  }
  for (const batch of batchSourceRecords(records)) await extract(batch);
  const result = combineCoveredParts(parts);
  result.coverage!.required = sourceRecords(cv.rawText).filter(isBibliographyRecord).map(record => record.id);
  return result;
}

function apiKeyForCandidate(candidate: SliceModelCandidate, credentials: ModelCredentials): string | undefined {
  return candidate.provider === 'cloud' ? credentials.cloudApiKey : credentials.onPremApiKey;
}

async function callSliceWithModelFallbacks(
  cv: ParsedCV,
  slice: SliceKey,
  credentials: ModelCredentials,
  options: CallSliceOptions = {},
): Promise<PartialResult> {
  const available = {
    cloud: Boolean(credentials.cloudApiKey),
    onPrem: Boolean(credentials.onPremApiKey),
  };
  const candidates = modelCandidatesForSlice(slice, available);
  if (candidates.length === 0) {
    throw new Error('No LiteLLM API key configured for available model providers.');
  }

  const failures: string[] = [];
  for (const candidate of candidates) {
    const apiKey = apiKeyForCandidate(candidate, credentials);
    if (!apiKey) continue;
    const attempts = 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await callCoveredSlice(cv, slice, candidate, apiKey, options);
      } catch (e) {
        if (isAbortError(e)) throw e;
        const message = (e as Error).message;
        failures.push(`${candidate.model}${attempts > 1 ? ` attempt ${attempt}` : ''}: ${message}`);
        console.warn(
          `[converter] slice "${slice}" failed with "${candidate.model}" attempt ${attempt}, trying fallback if available:`,
          message,
        );
      }
    }
  }

  throw new Error(`All model attempts failed for slice "${slice}": ${failures.join(' | ')}`);
}

export async function callSliceWithSignal(
  cv: ParsedCV,
  slice: SliceKey,
  credentials: ModelCredentials,
  signal: AbortSignal,
  sinceYear?: number,
): Promise<PartialResult> {
  return callSliceWithModelFallbacks(cv, slice, credentials, { signal, sinceYear });
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

// ── Merge partial results into the final ConversionResult ────────────────────

function emptySections(): BioBibSections {
  return {
    employment: [],
    education: [],
    specialization: '',
    universityService: [],
    publicService: [],
    professionalActivities: [],
    memberships: [],
    awards: [],
    teaching: [],
    studentInstructionalActivities: [],
    studentInstructionalGroups: [],
    grants: [],
    externalProfessionalActivities: [],
    consulting: [],
    reviewerActivities: [],
    presentations: [],
    invitedPresentations: [],
    diversityContributions: [],
    outreach: [],
    clinicalActivities: [],
    otherActivities: [],
    externalReviews: [],
    peerReviewedJournals: [],
    reviewAndInvited: [],
    books: [],
    chapters: [],
    refereedProceedings: [],
    otherArticles: [],
    otherProceedings: [],
    abstracts: [],
    popularWorks: [],
    additionalProducts: [],
    theses: [],
    patents: [],
    workInProgress: [],
  };
}

export function mergeSlices(parts: PartialResult[]): ConversionResult {
  const sections = emptySections();
  const gaps: BioBibGap[] = [];
  const reviewNotes: BioBibReviewNote[] = [];
  let metadata: ConversionResult['metadata'] = {
    name: '',
    department: '',
    title: '',
    processedAt: new Date().toISOString(),
  };

  for (const part of parts) {
    if (part.metadata) {
      metadata = { ...metadata, ...part.metadata, processedAt: metadata.processedAt };
    }
    if (part.gaps) gaps.push(...part.gaps);
    if (part.reviewNotes) reviewNotes.push(...part.reviewNotes);
    if (!part.sections) continue;
    // Merge: array fields concat, scalar fields take first non-empty value.
    for (const key of Object.keys(part.sections) as (keyof BioBibSections)[]) {
      const incoming = part.sections[key];
      if (incoming === undefined) continue;
      if (Array.isArray(incoming)) {
        const existing = sections[key];
        if (Array.isArray(existing)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (sections[key] as any[]) = existing.concat(incoming as any[]);
        }
      } else if (typeof incoming === 'string' && incoming && !sections[key]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sections[key] as any) = incoming;
      }
    }
  }

  moveWorkInProgressPublications(sections);
  preserveKnownJournalVenues(sections);
  preservePublishedProceedings(sections);
  moveHonorificAppointmentsToAwards(sections);
  reclassifyOtherPublications(sections);
  normalizeSectionIIRecords(sections);
  normalizePublicationRecords(sections);
  reconcileSectionIIActivityBuckets(sections, reviewNotes);
  dedupePublicationRecords(sections);
  reconcileSourcePublicationPlacements(sections, reviewNotes);
  recoverDeclinedBibliography(sections, reviewNotes, parts);

  // Several publication categories are fed by multiple bounded slices, each
  // starting at number=1. Renumber sequentially across the merged list.
  const numberedKeys = [
    'peerReviewedJournals', 'abstracts', 'reviewAndInvited', 'books', 'chapters',
    'refereedProceedings', 'otherArticles', 'otherProceedings', 'popularWorks',
    'additionalProducts', 'theses', 'patents', 'workInProgress',
  ] as const;
  for (const key of numberedKeys) {
    sections[key] = renumberPublications(sections[key]);
  }
  sections.employment = filterLikelyApplicableEmployment(sections.employment);
  sections.universityService = dedupeBy(
    sections.universityService,
    s => `${s.category}|${normalizeForDedupe(s.description)}|${normalizeForDedupe(s.dates)}`,
  );
  sections.grants = dedupeBy(
    sections.grants,
    g => `${normalizeForDedupe(g.title)}|${normalizeForDedupe(g.funder)}|${normalizeForDedupe(g.period)}`,
  );
  sections.publicService = dedupeStrings(sections.publicService);
  sections.professionalActivities = dedupeComparableStrings(sections.professionalActivities);
  sections.memberships = dedupeStrings(sections.memberships);
  sections.awards = dedupeStrings(sections.awards);
  sections.teaching = dedupeStrings(sections.teaching);
  sections.studentInstructionalActivities = dedupeStrings(sections.studentInstructionalActivities);
  sections.studentInstructionalGroups = mergeStudentInstructionalGroups(sections.studentInstructionalGroups);
  sections.externalProfessionalActivities = dedupeComparableStrings(sections.externalProfessionalActivities);
  sections.consulting = dedupeStrings(sections.consulting);
  sections.reviewerActivities = dedupeStrings(sections.reviewerActivities);
  sections.presentations = dedupeStrings(sections.presentations);
  sections.invitedPresentations = dedupeStrings(sections.invitedPresentations);
  normalizePresentationBuckets(sections);
  removeAbstractDuplicatesFromPresentations(sections);
  sections.diversityContributions = dedupeStrings(sections.diversityContributions);
  sections.outreach = dedupeStrings(sections.outreach);
  sections.clinicalActivities = dedupeStrings(sections.clinicalActivities);
  sections.otherActivities = dedupeStrings(sections.otherActivities);
  sections.externalReviews = dedupeStrings(sections.externalReviews);
  sortSectionIIRecords(sections);
  addDuplicatePlacementReviewNotes(sections, reviewNotes);
  addStructuralReviewGaps(sections, gaps);

  const required = new Set(parts.flatMap(part => part.coverage?.required ?? []));
  if (required.size) {
    const preserved = bibliographySourceIds(sections);
    const missing = [...required].filter(id => !preserved.has(id));
    if (missing.length) throw new Error(`Bibliography coverage incomplete after assembly: ${missing.length} source records (${missing.join(', ')}). Retry conversion or review the source; an incomplete document was not marked complete.`);
    metadata.extractionCoverage = {
      required: required.size, preserved: [...required].filter(id => preserved.has(id)).length,
      sourceRecords: new Set(parts.flatMap(part => [...(part.coverage?.included ?? []), ...(part.coverage?.excluded ?? []).map(item => item.id)])).size,
    };
  }

  return { sections, gaps, reviewNotes: dedupeReviewNotes(reviewNotes), metadata };
}

function bibliographySourceIds(sections: BioBibSections): Set<string> {
  return new Set(Object.values(sections).flatMap(value => Array.isArray(value)
    ? value.flatMap(entry => typeof entry === 'object' && 'citation' in entry ? entry.sourceIds ?? [] : []) : []));
}

/**
 * Each bibliography task can decline a record as another task's category, so
 * a record can be excluded everywhere. Keep its source wording under other
 * articles with a placement note instead of losing it or failing the document.
 * Records no task accounted for still fail the coverage check below.
 */
function recoverDeclinedBibliography(sections: BioBibSections, reviewNotes: BioBibReviewNote[], parts: PartialResult[]): void {
  const required = new Set(parts.flatMap(part => part.coverage?.required ?? []));
  const preserved = bibliographySourceIds(sections);
  const declined = new Map<string, string>();
  for (const item of parts.flatMap(part => part.coverage?.excluded ?? [])) {
    if (item.text && required.has(item.id) && !preserved.has(item.id)) declined.set(item.id, item.text);
  }
  for (const [id, citation] of declined) {
    sections.otherArticles.push({ number: 0, citation, type: 'other', sourceIds: [id] });
    reviewNotes.push({ section: 'Section III: Bibliography', topic: 'Publication placement',
      instruction: `Choose the correct category for this source bibliography record; the automated review did not assign one, so it is listed under other articles: ${citation}` });
  }
}

/** Repeated extraction of identical source evidence must not create two publications. */
function reconcileSourcePublicationPlacements(sections: BioBibSections, reviewNotes: BioBibReviewNote[]): void {
  const priority = ['abstracts', 'refereedProceedings', 'chapters', 'books', 'reviewAndInvited',
    'patents', 'theses', 'peerReviewedJournals', 'otherProceedings', 'popularWorks',
    'otherArticles', 'additionalProducts', 'workInProgress'] as const;
  const seen = new Map<string, { entry: PublicationEntry; key: string }>();
  for (const key of priority) {
    sections[key] = sections[key].filter(entry => {
      if (!entry.sourceIds?.length) return true; // legacy snapshots keep their established behavior
      const fingerprint = `${[...entry.sourceIds].sort().join('|')}|${normalizePublicationCitation(entry.citation)}`;
      const previous = seen.get(fingerprint);
      if (!previous) { seen.set(fingerprint, { entry, key }); return true; }
      Object.assign(previous.entry, mergeDuplicatePublication(previous.entry, entry, false));
      if (previous.key !== key) {
        const label = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
        reviewNotes.push({ section: 'Section III: Bibliography', topic: 'Publication placement',
          instruction: `Confirm placement under ${label(previous.key)}; this record was also identified as ${label(key)}: ${entry.citation}` });
      }
      return false;
    });
  }
}

function preserveKnownJournalVenues(sections: BioBibSections): void {
  // RSC identifies these current/historical titles as journals, despite their
  // associated meetings: https://www.rsc.org/publishing/journals/faraday-discussions
  const faradayJournal = /\b(?:Faraday\s+(?:Disc\.|Discussions)(?:\s+(?:Chem\.?|Chemical)\s+Soc(?:iety)?\.?)?|Discussions\s+of\s+(?:the\s+)?Faraday\s+Society)\s*,?\s*(?:No\.?\s*)?\d{1,3}\b/i;
  for (const key of ['refereedProceedings', 'otherProceedings', 'otherArticles', 'abstracts'] as const) {
    sections[key] = sections[key].filter(entry => {
      if (!faradayJournal.test(entry.citation)) return true;
      sections.peerReviewedJournals.push({ ...entry, type: 'journal' });
      return false;
    });
  }
}

function preservePublishedProceedings(sections: BioBibSections): void {
  sections.abstracts = sections.abstracts.filter(entry => {
    // Published proceedings with explicit pages or a proceedings-series venue
    // are full bibliography records, even if another slice calls them abstracts.
    if (!looksLikeRefereedProceeding(entry.citation)
      || !/\bpp?\.\s*\d+|\bj\.?\s*phys\.?\s*b\.?\s*conf\.?\s*proc\.?|\brarefied\s+gas\s+dynamics\b/i.test(entry.citation)) return true;
    sections.refereedProceedings.push({ ...entry, type: 'proceedings' });
    return false;
  });
}

function moveHonorificAppointmentsToAwards(sections: BioBibSections): void {
  const awardCandidates = sections.employment
    .filter(entry => isHonorificAppointment(entry))
    .map(formatHonorificAppointmentAward)
    .filter(Boolean);
  const awards: string[] = [];
  for (const candidate of [...sections.awards, ...awardCandidates]) {
    if (!awards.some(existing => sameHonorificAward(existing, candidate))) {
      awards.push(candidate);
    }
  }
  sections.awards = awards;
}

function sameHonorificAward(left: string, right: string): boolean {
  const canonical = (value: string) => normalizeForComparison(
    value.replace(/\bnat[’']?l\b/gi, 'national')
      .replace(/\[new\s+since\s+[^\]]+\]/gi, '')
      .replace(/^\s*new\s*:\s*/i, '')
      .replace(/\btenure\b/gi, ''),
  );
  const a = canonical(left);
  const b = canonical(right);
  if (a === b) return true;
  // Location suffixes may differ, but a distinct year or appointment period
  // must never disappear just because most of the title matches.
  const dates = (value: string) => value.match(/\b(?:\d{4}|present|current)\b/g)?.join('|') ?? '';
  if (!dates(a) || dates(a) !== dates(b)) return false;
  const aTokens = new Set(a.split(' '));
  const bTokens = new Set(b.split(' '));
  const [smaller, larger] = aTokens.size <= bTokens.size ? [aTokens, bTokens] : [bTokens, aTokens];
  // Repeating an institution already present in a short fellowship title does
  // not create a new honor (the token sets are then exactly the same).
  return (smaller.size === larger.size || smaller.size >= 6) &&
    [...smaller].every(token => larger.has(token));
}

function isHonorificAppointment(entry: BioBibSections['employment'][number]): boolean {
  const text = `${entry.rank} ${entry.institution}`.toLowerCase();
  if (/\bdistinguished professor\b/i.test(text)) return true;
  if (!/\b(visiting scientist|professore visitatore|visiting professor|visiting scholar|scholar|fellow)\b/i.test(text)) {
    return false;
  }
  return !/\b(postdoctoral|research assistant|assistant professor|associate professor|professor, department|chemist|scientist, gas|staff scientist)\b/i
    .test(text);
}

function formatHonorificAppointmentAward(entry: BioBibSections['employment'][number]): string {
  const title = [entry.rank, entry.institution].filter(hasText).join(', ');
  const period = formatAwardPeriod(entry.from, entry.to);
  return [title, period].filter(Boolean).join(' ');
}

function formatAwardPeriod(from?: string, to?: string): string {
  const cleanFrom = from?.trim() ?? '';
  const cleanTo = to?.trim() ?? '';
  if (cleanFrom && cleanTo && cleanFrom !== cleanTo) return `${cleanFrom} – ${cleanTo}`;
  return cleanFrom || cleanTo;
}

function reclassifyOtherPublications(sections: BioBibSections): void {
  const remainingOtherArticles: PublicationEntry[] = [];

  for (const item of sections.otherArticles) {
    if (isBookReviewCitation(item.citation)) {
      sections.popularWorks.push({ ...item, type: 'popular' });
    } else if (looksLikeRefereedProceeding(item.citation)) {
      sections.refereedProceedings.push({ ...item, type: 'proceedings' });
    } else if (looksLikeConferenceProceeding(item.citation)) {
      sections.otherProceedings.push({ ...item, type: 'proceedings' });
    } else {
      remainingOtherArticles.push(item);
    }
  }

  sections.otherArticles = remainingOtherArticles;
  const remainingOtherProceedings: PublicationEntry[] = [];
  for (const item of sections.otherProceedings) {
    if (looksLikeRefereedProceeding(item.citation)) {
      sections.refereedProceedings.push({ ...item, type: 'proceedings' });
    } else {
      remainingOtherProceedings.push(item);
    }
  }
  sections.otherProceedings = remainingOtherProceedings;

  const primaryProceedingKeys = new Set(sections.refereedProceedings.map(item => normalizePublicationCitation(item.citation)));
  sections.otherProceedings = sections.otherProceedings.filter(item => !primaryProceedingKeys.has(normalizePublicationCitation(item.citation)));
}

function normalizeSectionIIRecords(sections: BioBibSections): void {
  sections.universityService = sections.universityService.map(cleanServiceEntry);
  sections.publicService = sections.publicService.map(cleanGeneratedRecord);
  sections.professionalActivities = sections.professionalActivities.map(cleanGeneratedRecord);
  sections.memberships = sections.memberships.map(cleanGeneratedRecord);
  sections.awards = sections.awards.map(cleanGeneratedRecord);
  sections.teaching = sections.teaching.map(cleanGeneratedRecord);
  sections.studentInstructionalActivities = sections.studentInstructionalActivities.map(cleanGeneratedRecord);
  sections.studentInstructionalGroups = sections.studentInstructionalGroups.map(group => ({
    ...group,
    entries: group.entries.map(cleanGeneratedRecord),
  }));
  sections.externalProfessionalActivities = sections.externalProfessionalActivities.map(cleanGeneratedRecord);
  sections.consulting = sections.consulting.map(cleanGeneratedRecord);
  sections.reviewerActivities = sections.reviewerActivities.map(cleanGeneratedRecord);
  sections.presentations = sections.presentations.map(cleanGeneratedRecord);
  sections.invitedPresentations = sections.invitedPresentations.map(cleanGeneratedRecord);
  sections.diversityContributions = sections.diversityContributions.map(cleanGeneratedRecord);
  sections.outreach = sections.outreach.map(cleanGeneratedRecord);
  sections.clinicalActivities = sections.clinicalActivities.map(cleanGeneratedRecord);
  sections.otherActivities = sections.otherActivities.map(cleanGeneratedRecord);
  sections.externalReviews = sections.externalReviews.map(cleanGeneratedRecord);
}

function sortSectionIIRecords(sections: BioBibSections): void {
  sections.universityService = sortByInitialDate(sections.universityService, serviceDateText);
  sections.publicService = sortByInitialDate(sections.publicService, item => item);
  sections.professionalActivities = sortByInitialDate(sections.professionalActivities, item => item);
  sections.memberships = sortByInitialDate(sections.memberships, item => item);
  sections.awards = sortByInitialDate(sections.awards, item => item);
  sections.teaching = sortByInitialDate(sections.teaching, item => item);
  sections.studentInstructionalActivities = sortByInitialDate(sections.studentInstructionalActivities, item => item);
  sections.studentInstructionalGroups = sections.studentInstructionalGroups.map(group => ({
    ...group,
    entries: sortByInitialDate(group.entries, item => item),
  }));
  sections.grants = sortByInitialDate(sections.grants, grantDateText);
  sections.externalProfessionalActivities = sortByInitialDate(sections.externalProfessionalActivities, item => item);
  sections.consulting = sortByInitialDate(sections.consulting, item => item);
  sections.reviewerActivities = sortByInitialDate(sections.reviewerActivities, item => item);
  sections.presentations = sortByInitialDate(sections.presentations, item => item);
  sections.invitedPresentations = sortByInitialDate(sections.invitedPresentations, item => item);
  sections.diversityContributions = sortByInitialDate(sections.diversityContributions, item => item);
  sections.outreach = sortByInitialDate(sections.outreach, item => item);
  sections.clinicalActivities = sortByInitialDate(sections.clinicalActivities, item => item);
  sections.otherActivities = sortByInitialDate(sections.otherActivities, item => item);
  sections.externalReviews = sortByInitialDate(sections.externalReviews, item => item);
}

function cleanServiceEntry(entry: BioBibSections['universityService'][number]): BioBibSections['universityService'][number] {
  const description = stripLeadingSourceNumber(entry.description).replace(/\s+/g, ' ').trim();
  const split = splitLeadingDate(description);
  if (!split) {
    return {
      ...entry,
      description,
      dates: cleanServiceDate(entry.dates),
    };
  }

  return {
    ...entry,
    description: split.rest,
    dates: cleanServiceDate(entry.dates || split.dateLabel),
  };
}

function cleanServiceDate(value: string): string {
  return value.trim().replace(/^\((.*)\)$/, '$1').trim();
}

function serviceDateText(entry: BioBibSections['universityService'][number]): string {
  return `${entry.dates} ${entry.description}`;
}

function grantDateText(entry: BioBibSections['grants'][number]): string {
  return `${entry.period} ${entry.title}`;
}

function normalizePublicationRecords(sections: BioBibSections): void {
  const publicationKeys: (keyof Pick<
    BioBibSections,
    | 'peerReviewedJournals'
    | 'reviewAndInvited'
    | 'books'
    | 'chapters'
    | 'refereedProceedings'
    | 'otherArticles'
    | 'otherProceedings'
    | 'abstracts'
    | 'popularWorks'
    | 'additionalProducts'
    | 'theses'
    | 'patents'
    | 'workInProgress'
  >)[] = [
    'peerReviewedJournals',
    'reviewAndInvited',
    'books',
    'chapters',
    'refereedProceedings',
    'otherArticles',
    'otherProceedings',
    'abstracts',
    'popularWorks',
    'additionalProducts',
    'theses',
    'patents',
    'workInProgress',
  ];

  for (const key of publicationKeys) {
    const cleaned = sections[key].map(item => ({
      ...item,
      citation: stripLeadingSourceNumber(item.citation).replace(/\s+/g, ' ').trim(),
    }));
    sections[key] = sortByInitialDate(cleaned, item => item.citation) as BioBibSections[typeof key];
  }
}

function reconcileSectionIIActivityBuckets(
  sections: BioBibSections,
  reviewNotes: BioBibReviewNote[],
): void {
  const serviceKeys = new Set(
    sections.universityService.map(entry =>
      normalizeServiceRecordForComparison(entry.description, entry.dates),
    ),
  );
  const serviceByCore = new Map(
    sections.universityService.map(entry => [
      activityCoreFingerprint(entry.description),
      entry,
    ]),
  );
  const combinedActivities = dedupeComparableStrings([
    ...sections.professionalActivities,
    ...sections.externalProfessionalActivities,
  ]);
  const retainedActivities: string[] = [];

  for (const item of combinedActivities) {
    const key = normalizeServiceRecordForComparison(item);
    if (serviceKeys.has(key)) continue;

    const service = serviceByCore.get(activityCoreFingerprint(item));
    if (service) {
      reviewNotes.push({
        section: 'Section II: University Service; Section II: External Professional Activities',
        topic: 'Potential duplicate placement',
        instruction:
          `Review the differing date or wording before choosing one placement: ` +
          `${service.description} (${service.dates}) / ${stripLeadingSourceNumber(item)}`,
      });
    }
    retainedActivities.push(item);
  }

  // Both legacy fields render under the same BioBib subsection. Keep one
  // canonical bucket so the JSON result and the generated document agree.
  sections.professionalActivities = retainedActivities;
  sections.externalProfessionalActivities = [];
}

function activityCoreFingerprint(value: string): string {
  return normalizeServiceRecordForComparison(
    stripLeadingSourceNumber(value)
      .replace(
        /\b(?:19|20)\d{2}\b(?:\s*(?:-|–|—|to)\s*(?:present|current|(?:19|20)\d{2}))?/gi,
        ' ',
      )
      .replace(/\b(?:present|current)\b/gi, ' '),
  );
}

const PUBLICATION_DEDUPE_KEYS = [
  'peerReviewedJournals',
  'reviewAndInvited',
  'books',
  'chapters',
  'refereedProceedings',
  'otherArticles',
  'otherProceedings',
  'abstracts',
  'popularWorks',
  'additionalProducts',
  'theses',
  'patents',
] as const;

function dedupePublicationRecords(sections: BioBibSections): void {
  for (const key of PUBLICATION_DEDUPE_KEYS) {
    sections[key] = dedupePublicationList(sections[key]) as BioBibSections[typeof key];
  }
  sections.workInProgress = dedupePublicationList(sections.workInProgress, true);
}

function dedupePublicationList(
  items: PublicationEntry[],
  preferSpecificType = false,
): PublicationEntry[] {
  const byCitation = new Map<string, PublicationEntry>();
  for (const item of items) {
    const key = publicationFingerprint(item.citation);
    if (!key) continue;
    const existing = byCitation.get(key);
    byCitation.set(
      key,
      existing
        ? mergeDuplicatePublication(existing, item, preferSpecificType)
        : normalizePublicationContribution(item),
    );
  }
  return [...byCitation.values()];
}

function publicationFingerprint(citation: string): string {
  return normalizePublicationCitation(splitTrailingContribution(citation).citation);
}

function normalizePublicationContribution(item: PublicationEntry): PublicationEntry {
  // Source-backed citations already contain the authoritative annotation text.
  // Keep it intact rather than allowing model metadata to replace that wording.
  if (item.sourceIds?.length) return item;
  const split = splitTrailingContribution(item.citation);
  if (!split.contributionNote || item.contributionNote) return item;
  return {
    ...item,
    citation: split.citation,
    contributionNote: split.contributionNote,
  };
}

function splitTrailingContribution(citation: string): {
  citation: string;
  contributionNote?: string;
} {
  const match = citation.match(
    /^(.*?)(?:\s+)(\*{1,2}\s*(?:co[- ]author|co[- ]corresponding author|corresponding author|senior author)[^.]*\.?)$/i,
  );
  if (!match) return { citation: citation.trim() };
  return {
    citation: match[1].trim(),
    contributionNote: match[2].trim(),
  };
}

function mergeDuplicatePublication(
  first: PublicationEntry,
  second: PublicationEntry,
  preferSpecificType: boolean,
): PublicationEntry {
  const left = normalizePublicationContribution(first);
  const right = normalizePublicationContribution(second);
  const sourceBacked = Boolean(left.sourceIds?.length || right.sourceIds?.length);
  const citation = (sourceBacked ? left.citation.length >= right.citation.length : left.citation.length <= right.citation.length)
    ? left.citation : right.citation;
  const type = preferSpecificType
    ? preferredPublicationType(left.type, right.type)
    : left.type;

  return {
    ...left,
    ...((left.sourceIds || right.sourceIds) ? { sourceIds: [...new Set([...(left.sourceIds ?? []), ...(right.sourceIds ?? [])])] } : {}),
    citation,
    type,
    articleKind: left.articleKind ?? right.articleKind,
    bioBibSection: left.bioBibSection ?? right.bioBibSection,
    originalNumber: left.originalNumber ?? right.originalNumber,
    previouslyListedAs: left.previouslyListedAs ?? right.previouslyListedAs,
    contributionNote: left.contributionNote ?? right.contributionNote,
    reviewMaterialUrl: left.reviewMaterialUrl ?? right.reviewMaterialUrl,
    isFacultyThesis:
      left.isFacultyThesis === true || right.isFacultyThesis === true
        ? true
        : left.isFacultyThesis ?? right.isFacultyThesis,
    isNewSinceLastReview:
      left.isNewSinceLastReview === true || right.isNewSinceLastReview === true
        ? true
        : left.isNewSinceLastReview ?? right.isNewSinceLastReview,
  };
}

function preferredPublicationType(
  first: PublicationEntry['type'],
  second: PublicationEntry['type'],
): PublicationEntry['type'] {
  const priority: PublicationEntry['type'][] = [
    'journal',
    'review',
    'book',
    'chapter',
    'proceedings',
    'abstract',
    'popular',
    'other',
  ];
  return priority.indexOf(first) <= priority.indexOf(second) ? first : second;
}

function isBookReviewCitation(citation: string): boolean {
  return /\breview of\b/i.test(citation) && /\b(book|ed\.|eds\.|john wiley|press|volume|vol\.)\b/i.test(citation);
}

function looksLikeRefereedProceeding(citation: string): boolean {
  return /(?:\bproceedings\b|\bproc\.|\bconference proceedings\b|\bconf\.?\s+proc\.?|\bspie conference\b|\brarefied gas dynamics\b|\binternational\b.{0,80}\bsymposium\b|\bintl\.?\s+conf\.?|\bj\.?\s*phys\.?\s*b\.?\s*conf\.?\s*proc\.?|\bradiocarbon\s+\d+\b)/i
    .test(citation);
}

function looksLikeConferenceProceeding(citation: string): boolean {
  return /\b(conference|symposium|meeting|workshop|proceedings|proc\.)\b/i.test(citation);
}

function normalizePublicationCitation(citation: string): string {
  return normalizeForDedupe(citation)
    .replace(/^\d+\s*[.)]\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function moveWorkInProgressPublications(sections: BioBibSections): void {
  const targets: (keyof Pick<
    BioBibSections,
    | 'peerReviewedJournals'
    | 'reviewAndInvited'
    | 'books'
    | 'chapters'
    | 'refereedProceedings'
    | 'otherArticles'
  >)[] = [
    'peerReviewedJournals',
    'reviewAndInvited',
    'books',
    'chapters',
    'refereedProceedings',
    'otherArticles',
  ];

  for (const key of targets) {
    const published: PublicationEntry[] = [];
    for (const item of sections[key]) {
      if (isWorkInProgressPublication(item)) {
        sections.workInProgress.push(item);
      } else {
        published.push(item);
      }
    }
    sections[key] = published as BioBibSections[typeof key];
  }
}

function isWorkInProgressPublication(item: PublicationEntry): boolean {
  const citation = item.citation.toLowerCase();
  if (/\b(submitted|in progress|under review|in review|under revision|in preparation|forthcoming)\b/i.test(citation)) {
    return true;
  }
  return !/\b(19|20)\d{2}\b/.test(item.citation);
}

function mergeStudentInstructionalGroups(
  groups: BioBibSections['studentInstructionalGroups'],
): BioBibSections['studentInstructionalGroups'] {
  const byHeading = new Map<string, string[]>();
  for (const group of groups) {
    const heading = normalizeStudentGroupHeading(group.heading);
    if (!heading) continue;
    const entries = byHeading.get(heading) ?? [];
    entries.push(...group.entries.map(entry => stripStudentGroupPrefix(entry, heading)));
    byHeading.set(heading, dedupeStrings(entries.filter(Boolean)));
  }

  return [...byHeading.entries()].map(([heading, entries]) => ({
    heading,
    entries: sortChronologically(entries),
  }));
}

function renumberPublications<T extends { number: number }>(items: T[]): T[] {
  return items.map((c, i) => ({ ...c, number: i + 1 }));
}

function normalizePresentationBuckets(sections: BioBibSections): void {
  const presentations = [...sections.presentations];
  const invitedPresentations: string[] = [];

  for (const item of sections.invitedPresentations) {
    if (looksLikeNationalOrInternationalPresentation(item)) {
      presentations.push(item);
    } else {
      invitedPresentations.push(item);
    }
  }

  sections.presentations = dedupeStrings(presentations);
  sections.invitedPresentations = dedupeStrings(invitedPresentations);
}

function removeAbstractDuplicatesFromPresentations(sections: BioBibSections): void {
  const abstracts = sections.abstracts.map(item => item.citation);
  if (abstracts.length === 0) return;

  const belongsOnlyInAbstracts = (item: string) =>
    /\b(?:19|20)\d{2}\b/.test(item) &&
    abstracts.some(abstract => likelySameCitation(item, abstract));

  sections.presentations = sections.presentations.filter(item => !belongsOnlyInAbstracts(item));
  sections.invitedPresentations = sections.invitedPresentations.filter(item => !belongsOnlyInAbstracts(item));
}

function likelySameCitation(left: string, right: string): boolean {
  const leftTokens = new Set(normalizeForComparison(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeForComparison(right).split(' ').filter(Boolean));
  const smallerSize = Math.min(leftTokens.size, rightTokens.size);
  if (smallerSize < 8) return false;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / smallerSize >= 0.9;
}

function looksLikeNationalOrInternationalPresentation(value: string): boolean {
  return /\b(conference|congress|symposium|workshop|meeting|colloquium|gordon|faraday|acs|aps|aiche|international|national|world|society|division)\b/i
    .test(value);
}

function addDuplicatePlacementReviewNotes(sections: BioBibSections, reviewNotes: BioBibReviewNote[]): void {
  const sectionIIBuckets = [
    { section: 'Section II: Professional Activities', items: sections.professionalActivities },
    { section: 'Section II: External Professional Activities', items: sections.externalProfessionalActivities },
    { section: 'Section II: Reviewer Activities', items: sections.reviewerActivities },
    { section: 'Section II: Presentations at National and International Meetings', items: sections.presentations },
    { section: 'Section II: Other Invited Presentations', items: sections.invitedPresentations },
    {
      section: 'Section II: Student Instructional Activities',
      items: sections.studentInstructionalGroups.flatMap(group => group.entries).concat(sections.studentInstructionalActivities),
    },
  ];

  addDuplicateStringNotes(sectionIIBuckets, reviewNotes);

  const publicationBuckets = [
    { section: 'Section III.A.I Refereed Journal Articles', items: sections.peerReviewedJournals },
    { section: 'Section III.A.II Review and Invited Articles', items: sections.reviewAndInvited },
    { section: 'Section III.A.III Books', items: sections.books },
    { section: 'Section III.A.III Book Chapters', items: sections.chapters },
    { section: 'Section III.A.IV Refereed Conference Proceedings', items: sections.refereedProceedings },
    { section: 'Section III.A.V Other Articles', items: sections.otherArticles },
    { section: 'Section III.B.I Other Conference Proceedings', items: sections.otherProceedings },
    { section: 'Section III.B.II Abstracts', items: sections.abstracts },
    { section: 'Section III.B.III Popular Works', items: sections.popularWorks },
  ];
  addDuplicatePublicationNotes(publicationBuckets, reviewNotes);
}

function addDuplicateStringNotes(
  buckets: { section: string; items: string[] }[],
  reviewNotes: BioBibReviewNote[],
): void {
  const seen = new Map<string, { section: string; item: string }>();
  for (const bucket of buckets) {
    for (const item of bucket.items) {
      const key = normalizeReviewItem(item);
      if (!key) continue;
      const previous = seen.get(key);
      if (previous && previous.section !== bucket.section) {
        reviewNotes.push({
          section: `${previous.section}; ${bucket.section}`,
          topic: 'Potential duplicate placement',
          instruction: `Review whether this item should appear in both sections or only one: ${stripLeadingSourceNumber(item)}`,
        });
      } else if (!previous) {
        seen.set(key, { section: bucket.section, item });
      }
    }
  }
}

function addDuplicatePublicationNotes(
  buckets: { section: string; items: PublicationEntry[] }[],
  reviewNotes: BioBibReviewNote[],
): void {
  const seen = new Map<string, { section: string; item: PublicationEntry }>();
  for (const bucket of buckets) {
    for (const item of bucket.items) {
      const key = normalizePublicationCitation(item.citation);
      if (!key) continue;
      const previous = seen.get(key);
      if (previous && previous.section !== bucket.section) {
        reviewNotes.push({
          section: `${previous.section}; ${bucket.section}`,
          topic: 'Potential duplicate bibliography placement',
          instruction: `Review whether this citation should appear in both sections or only one: ${stripLeadingSourceNumber(item.citation)}`,
        });
      } else if (!previous) {
        seen.set(key, { section: bucket.section, item });
      }
    }
  }
}

function normalizeReviewItem(value: string): string {
  const normalized = normalizeForDedupe(stripLeadingSourceNumber(value))
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return normalized.length >= 24 ? normalized : '';
}

function dedupeReviewNotes(notes: BioBibReviewNote[]): BioBibReviewNote[] {
  return dedupeBy(notes, note => `${normalizeForDedupe(note.section)}|${normalizeForDedupe(note.topic)}|${normalizeForDedupe(note.instruction)}`);
}

function addStructuralReviewGaps(sections: BioBibSections, gaps: BioBibGap[]): void {
  if (sections.employment.some(e => !hasText(e.location))) {
    addGapOnce(gaps, {
      section: 'Section I: Employment History',
      field: 'Employment location',
      instruction: 'Review employment rows marked "Not listed" and add locations when available.',
      severity: 'recommended',
    });
  }

  if (sections.education.some(e => !hasText(e.datesFrom) && !hasText(e.datesTo))) {
    addGapOnce(gaps, {
      section: 'Section I: Education',
      field: 'Attendance dates',
      instruction: 'Review education rows marked "Not listed" and add attendance dates when available.',
      severity: 'recommended',
    });
  }

  if (sections.education.some(e => !hasText(e.location))) {
    addGapOnce(gaps, {
      section: 'Section I: Education',
      field: 'School location',
      instruction: 'Review education rows marked "Not listed" and add school locations when available.',
      severity: 'recommended',
    });
  }

  if (sections.grants.some(g => !hasText(g.role) || !hasText(g.coPIsShare))) {
    addGapOnce(gaps, {
      section: 'Section II: Contracts and Grants',
      field: 'Role and co-PI/share',
      instruction: 'Review grant rows marked "Not listed" and add role or co-PI/share details when available.',
      severity: 'recommended',
    });
  }
}

function addGapOnce(gaps: BioBibGap[], gap: BioBibGap): void {
  const key = `${gap.section}|${gap.field}|${gap.instruction}`.toLowerCase();
  if (gaps.some(existing => `${existing.section}|${existing.field}|${existing.instruction}`.toLowerCase() === key)) return;
  gaps.push(gap);
}

function filterLikelyApplicableEmployment(
  items: BioBibSections['employment'],
): BioBibSections['employment'] {
  const nonEmploymentRank =
    /\b(visiting|visitatore|fellow|scholar|chair|vice chancellor|senate|council|committee)\b/i;
  const academicRank =
    /\b(assistant professor|associate professor|professor|postdoctoral|research assistant|chemist|lecturer|instructor|scientist)\b/i;

  return items.filter(item => {
    const rank = item.rank.trim();
    if (!rank) return true;
    if (nonEmploymentRank.test(rank)) return false;
    return academicRank.test(rank) || !nonEmploymentRank.test(`${rank} ${item.institution}`);
  });
}

// The orchestration (Promise.all over slices + merge) now lives in the
// async fan-out workers under app/api/slice/* and app/api/finalize/*.
