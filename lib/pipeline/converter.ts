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

import { ParsedCV, ConversionResult, BioBibSections, BioBibGap, PublicationEntry } from '../types';
import { LITELLM_BASE_URL, LITELLM_MODEL } from '../constants';

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

UCSD BioBib reference:
${BIOBIB_INSTRUCTIONS_INLINE}`;

// ── Section slice definitions ────────────────────────────────────────────────

export type SliceKey =
  | 'meta_and_I'
  | 'II_service'
  | 'II_teaching'
  | 'II_grants'
  | 'II_external'
  | 'II_presentations_pre_2000'
  | 'II_presentations_2000_2010'
  | 'II_presentations_2011_2020'
  | 'II_presentations_post_2020'
  | 'II_diversity_other'
  | 'III_journals_pre_2000'
  | 'III_journals_2000_2010'
  | 'III_journals_late'
  | 'III_other_a'
  | 'III_other_proc'
  | 'III_abstracts_pre_2000'
  | 'III_abstracts_2000_2010'
  | 'III_abstracts_2011_2020'
  | 'III_abstracts_post_2020'
  | 'III_popular_products';

export const SLICE_KEYS: readonly SliceKey[] = [
  'meta_and_I',
  'II_service',
  'II_teaching',
  'II_grants',
  'II_external',
  'II_presentations_pre_2000',
  'II_presentations_2000_2010',
  'II_presentations_2011_2020',
  'II_presentations_post_2020',
  'II_diversity_other',
  'III_journals_pre_2000',
  'III_journals_2000_2010',
  'III_journals_late',
  'III_other_a',
  'III_other_proc',
  'III_abstracts_pre_2000',
  'III_abstracts_2000_2010',
  'III_abstracts_2011_2020',
  'III_abstracts_post_2020',
  'III_popular_products',
];

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
  sections: Partial<BioBibSections>;
  gaps?: BioBibGap[];
  metadata?: ConversionResult['metadata'];
}

const PRESENTATION_RULES = `
- Extract invited/keynote/plenary seminars, invited departmental seminars, named lectures, and selected national/international meeting presentations.
- Put items under CV headings like "Invited Lectures at National and International Meetings", "National and International Meetings", conference presentations, symposium presentations, workshop presentations, and society meeting presentations in "presentations".
- Put items under CV headings like "Invited Lectures at Institutions", "Invited Departmental Seminars", "Institutional Seminars", university seminars, departmental seminars, and named campus lectures in "invitedPresentations".
- Prefer presentations explicitly marked new or dated 7/2018-present when the CV indicates a review-period subset.
- Exclude posters, contributed talks, conference abstracts, co-author abstracts, and numbered abstract lists; those belong in Section III abstracts, not Section II.
- Exclude grant review panels, editorial boards, conference organization, and professional committee service; those belong in externalProfessionalActivities or reviewerActivities.
- Return concise presentation strings without leading source numbering such as "1." or "23.".
`.trim();

const SLICE_PROMPTS: Record<SliceKey, { fields: string; schema: string; rules?: string }> = {
  meta_and_I: {
    fields:
      'metadata (name in Last, First Middle format when inferable, department, title), Section I (employment, education, specialization)',
    rules: `
- Employment: use only true employment, academic appointments, and research/teaching assistantships from the CV's employment/appointments history.
- Include Teaching Assistant and Research Assistant roles when listed in the CV, with their exact intermittent/month-level dates.
- Preserve separate UCSD professor rank/step periods instead of collapsing them into one long Professor row.
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
  II_service: {
    fields:
      'Section II subset: universityService, publicService, memberships, awards',
    rules: `
- Memberships must include scholarly societies, professional boards, civic/professional organizations, elected fellow memberships, and honor societies when listed.
- Do not omit general society memberships such as AGU, RSC, AAAS, APS, ACS, or Phi Beta Kappa when present.
- Honors and awards should include fellowships, awards, named honors, and elected fellow distinctions with dates.
- It is acceptable for an elected fellow distinction to appear both as a membership and as an honor/award when the CV supports both uses.
- Keep service entries concise: description in "description", bare year/range in "dates" without surrounding parentheses.
- Do not prefix service descriptions with their category name; use "Graduate Recruitment Committee", not "Departmental Graduate Recruitment Committee".
`.trim(),
    schema: `{
  "sections": {
    "universityService": [{"description": "", "dates": "", "category": "departmental|college|campus|university|senate|systemwide|other"}],
    "publicService": [""],
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
      'Section II subset: professionalActivities, externalProfessionalActivities, consulting, reviewerActivities, and externalReviews only. Do not extract presentations or teaching.',
    rules: `
- professionalActivities/externalProfessionalActivities: committee service, conference organization, advisory boards, editorial roles, review panels, external program reviews, and society service.
- reviewerActivities: journal/editorial reviewing, funding-agency panels, manuscript/proposal reviewing, and external academic file reviews.
- externalReviews: significant independent reviews of the faculty member's own work only; do not include reviews performed by the faculty member.
- Do not extract presentation lists, posters, abstracts, teaching, mentoring, or grants in this slice.
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
    schema: `{
  "sections": {
    "abstracts": [{"number": 1, "citation": "", "type": "abstract"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_abstracts_2000_2010: {
    fields: `Section III abstracts ONLY — abstracts published from ${ABSTRACT_MID_START} through ${ABSTRACT_MID_END}, inclusive. Skip abstracts outside that date range. Number sequentially starting at 1 (numbering will be re-done at merge).`,
    schema: `{
  "sections": {
    "abstracts": [{"number": 1, "citation": "", "type": "abstract"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_abstracts_2011_2020: {
    fields: `Section III abstracts ONLY — abstracts published from ${ABSTRACT_LATE_START} through ${ABSTRACT_LATE_END}, inclusive. Skip abstracts outside that date range. Number sequentially starting at 1 (numbering will be re-done at merge).`,
    schema: `{
  "sections": {
    "abstracts": [{"number": 1, "citation": "", "type": "abstract"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_abstracts_post_2020: {
    fields: `Section III abstracts ONLY — abstracts published in ${ABSTRACT_POST_2020_START} or later. Skip abstracts published before ${ABSTRACT_POST_2020_START}. Number sequentially starting at 1 (numbering will be re-done at merge).`,
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
- "patents" should include patents and patent licenses.
- "additionalProducts" should include software, datasets, instruments, formal products, or other major research products, not ordinary publications already captured elsewhere.
- workInProgress should be empty unless the CV explicitly lists work in progress material for review.
`.trim(),
    schema: `{
  "sections": {
    "popularWorks": [{"number": 1, "citation": "", "type": "popular"}],
    "additionalProducts": [{"number": 1, "citation": "", "type": "other"}],
    "theses": [{"number": 1, "citation": "", "type": "other"}],
    "patents": [{"number": 1, "citation": "", "type": "other"}],
    "workInProgress": [{"number": 1, "citation": "", "type": "other"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
};

const buildSliceUserPrompt = (cv: ParsedCV, slice: SliceKey): string => {
  const { fields, schema, rules } = SLICE_PROMPTS[slice];
  return `Extract from this faculty CV the following BioBib fields ONLY: ${fields}.

CV TEXT:
${cv.rawText}

${rules ? `Slice-specific rules:
${rules}

` : ''}Return ONE raw JSON object with this schema. Include every key shown; use empty arrays/strings for items you do not extract. You may add optional publication fields (articleKind, isNewSinceLastReview, previouslyListedAs, contributionNote, reviewMaterialUrl, bioBibSection, originalNumber) only when the CV explicitly provides that information:
${schema}

Output rules — IMPORTANT:
- Respond with raw JSON only. Do NOT wrap the JSON in markdown code fences (no \`\`\`json or \`\`\`). Do NOT prefix or suffix with any prose.
- The first character of your response must be "{" and the last character must be "}".

Content rules:
- Only populate the fields listed above. Do not include keys for other sections.
- Preserve citation text exactly — do not reformat or standardize.
- Employment must be chronological (oldest first), preserve month-level dates, and include academic assistantships/appointments when the CV lists them.
- Publications must be chronological and numbered sequentially within each subsection. Keep labels such as "New", asterisks, "RESEARCH ARTICLE", "REVIEW ARTICLE", "previously B.1", contribution notes, and URLs if present.
- For Section II categories with no evidence in the CV, return an empty array. Do not add a gap unless the missing item is truly required for BioBib submission.
- For gaps, only flag fields that belong to the slice above. Be specific and actionable.
- severity: "required" = BioBib cannot be submitted without it, "recommended" = strongly advised, "optional" = at faculty discretion.`;
};

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
}

function supportsCustomTemperature(model: string): boolean {
  return !model.startsWith('gpt-5');
}

async function callSliceOnce(
  cv: ParsedCV,
  slice: SliceKey,
  apiKey: string,
  options: CallSliceOptions = {},
): Promise<PartialResult> {
  const requestBody = {
    model: LITELLM_MODEL,
    messages: [
      { role: 'system', content: BASE_SYSTEM },
      { role: 'user', content: buildSliceUserPrompt(cv, slice) },
    ],
    // 12K caps each slice's output while preserving large bibliography slices.
    // Going larger causes the model to keep generating and time out before
    // returning anything we can parse.
    max_tokens: 12000,
    response_format: { type: 'json_object' },
    ...(supportsCustomTemperature(LITELLM_MODEL) ? { temperature: 0.1 } : {}),
  };

  const response = await fetch(`${LITELLM_BASE_URL}/v1/chat/completions`, {
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
    throw new Error(`LiteLLM API error ${response.status} on slice "${slice}": ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const finishReason = data.choices?.[0]?.finish_reason;
  if (!content) throw new Error(`Empty response from AI on slice "${slice}"`);

  const cleaned = stripJsonFences(content);
  try {
    return JSON.parse(cleaned) as PartialResult;
  } catch (e) {
    const hint =
      finishReason === 'length'
        ? ` (response was truncated at max_tokens — slice "${slice}" is too large for the current output cap)`
        : '';
    throw new Error(`AI returned invalid JSON on slice "${slice}"${hint}: ${(e as Error).message}`);
  }
}

export async function callSlice(cv: ParsedCV, slice: SliceKey, apiKey: string): Promise<PartialResult> {
  // One retry on transient failures — slice calls are cheap and parse errors
  // can come from rare formatting blips.
  try {
    return await callSliceOnce(cv, slice, apiKey);
  } catch (e) {
    if (isAbortError(e)) throw e;
    console.warn(`[converter] slice "${slice}" failed, retrying once:`, (e as Error).message);
    return await callSliceOnce(cv, slice, apiKey);
  }
}

export async function callSliceWithSignal(
  cv: ParsedCV,
  slice: SliceKey,
  apiKey: string,
  signal: AbortSignal,
): Promise<PartialResult> {
  try {
    return await callSliceOnce(cv, slice, apiKey, { signal });
  } catch (e) {
    if (isAbortError(e)) throw e;
    console.warn(`[converter] slice "${slice}" failed, retrying once:`, (e as Error).message);
    return await callSliceOnce(cv, slice, apiKey, { signal });
  }
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

  // Several publication categories are fed by multiple bounded slices, each
  // starting at number=1. Renumber sequentially across the merged list.
  sections.peerReviewedJournals = renumberPublications(sections.peerReviewedJournals);
  sections.abstracts = renumberPublications(sections.abstracts);
  sections.reviewAndInvited = renumberPublications(sections.reviewAndInvited);
  sections.books = renumberPublications(sections.books);
  sections.chapters = renumberPublications(sections.chapters);
  sections.refereedProceedings = renumberPublications(sections.refereedProceedings);
  sections.otherArticles = renumberPublications(sections.otherArticles);
  sections.otherProceedings = renumberPublications(sections.otherProceedings);
  sections.popularWorks = renumberPublications(sections.popularWorks);
  sections.additionalProducts = renumberPublications(sections.additionalProducts);
  sections.theses = renumberPublications(sections.theses);
  sections.patents = renumberPublications(sections.patents);
  sections.workInProgress = renumberPublications(sections.workInProgress);
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
  sections.professionalActivities = dedupeStrings(sections.professionalActivities);
  sections.memberships = dedupeStrings(sections.memberships);
  sections.awards = dedupeStrings(sections.awards);
  sections.teaching = dedupeStrings(sections.teaching);
  sections.studentInstructionalActivities = dedupeStrings(sections.studentInstructionalActivities);
  sections.studentInstructionalGroups = mergeStudentInstructionalGroups(sections.studentInstructionalGroups);
  sections.externalProfessionalActivities = dedupeStrings(sections.externalProfessionalActivities);
  sections.consulting = dedupeStrings(sections.consulting);
  sections.reviewerActivities = dedupeStrings(sections.reviewerActivities);
  sections.presentations = dedupeStrings(sections.presentations);
  sections.invitedPresentations = dedupeStrings(sections.invitedPresentations);
  normalizePresentationBuckets(sections);
  sections.diversityContributions = dedupeStrings(sections.diversityContributions);
  sections.outreach = dedupeStrings(sections.outreach);
  sections.clinicalActivities = dedupeStrings(sections.clinicalActivities);
  sections.otherActivities = dedupeStrings(sections.otherActivities);
  sections.externalReviews = dedupeStrings(sections.externalReviews);
  addStructuralReviewGaps(sections, gaps);

  return { sections, gaps, metadata };
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

function normalizeStudentGroupHeading(value: string): string {
  const cleaned = value.replace(/:$/, '').trim();
  if (!cleaned) return '';
  const lower = cleaned.toLowerCase();
  if (lower.includes('postdoctoral fellow') && lower.includes('current')) return 'Current Postdoctoral Associates';
  if (lower.includes('undergraduate') && lower.includes('former')) return 'Former Undergraduate Research Students';
  if (lower.includes('undergraduate')) return 'Undergraduate Research Students';
  if (lower.includes('ph.d') && lower.includes('student')) return 'Former Ph.D. Students';
  if (lower.includes('master') && lower.includes('student')) return 'Former Masters Students';
  if (lower.includes('staff scientist')) return 'Current Staff Scientists';
  if (lower.includes('visiting')) return 'Visiting Faculty/Students';
  return cleaned;
}

function stripStudentGroupPrefix(entry: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return entry
    .replace(/^\s*\d+\s*[.)]\s*/, '')
    .replace(new RegExp(`^\\s*${escaped}\\s*:?\\s*`, 'i'), '')
    .replace(/^\s*(Current|Former)\s+(Ph\.?D\.?|Masters?|Postdoctoral|Staff|Undergraduate|Visiting)[^:]{0,80}:\s*/i, '')
    .trim();
}

function sortChronologically(items: string[]): string[] {
  return [...items].sort((a, b) => chronologicalYear(a) - chronologicalYear(b));
}

function chronologicalYear(value: string): number {
  const years = [...value.matchAll(/\b(19|20)\d{2}\b/g)].map(match => Number(match[0]));
  return years.length > 0 ? Math.max(...years) : Number.MAX_SAFE_INTEGER;
}

function renumberPublications<T extends { number: number }>(items: T[]): T[] {
  return items.map((c, i) => ({ ...c, number: i + 1 }));
}

function dedupeStrings(items: string[]): string[] {
  return dedupeBy(items, normalizeForDedupe);
}

function dedupeBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
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

function looksLikeNationalOrInternationalPresentation(value: string): boolean {
  return /\b(conference|congress|symposium|workshop|meeting|colloquium|gordon|faraday|acs|aps|aiche|international|national|world|society|division)\b/i
    .test(value);
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

function hasText(value?: string): boolean {
  return !!value?.trim();
}

function normalizeForDedupe(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
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
