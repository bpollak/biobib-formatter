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

import { ParsedCV, ConversionResult, BioBibSections, BioBibGap } from '../types';
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

Section III: Bibliography
All citations must be numbered, chronological, discipline-appropriate format.

A. Primary Published or Creative Work:
  I. Original Peer-Reviewed Work:
    a. Refereed Journal Articles
    b. Review and Invited Articles
    c. Books and Book Chapters (separate subcategories)
    d. Refereed Conference Proceedings (include acceptance rate if available)
B. Other Work:
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

const SLICE_PROMPTS: Record<SliceKey, { fields: string; schema: string }> = {
  meta_and_I: {
    fields:
      'metadata (name in Last, First Middle format when inferable, department, title), Section I (employment, education, specialization)',
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
      'Section II subset: teaching and studentInstructionalActivities only. Include courses, doctoral students, masters students, postdocs, undergraduates, visitors, staff scientists, and mentoring entries. Do not extract grants.',
    schema: `{
  "sections": {
    "teaching": [""],
    "studentInstructionalActivities": [""]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  II_grants: {
    fields:
      'Section II subset: contracts/grants only. Extract current and past support with title, funder/agency, amount or totalAward including indirect costs when available, period, role, and co-PI/corresponding share when available.',
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
    fields: `Section III peerReviewedJournals ONLY — refereed journal articles published in ${JOURNAL_PRE_2000_END} or earlier. Skip articles published in ${JOURNAL_MID_START} or later. Number the articles you extract sequentially starting from 1 (numbering will be re-done at merge). Include optional articleKind, contributionNote, previouslyListedAs, reviewMaterialUrl, and isNewSinceLastReview ONLY when the CV explicitly provides that information.`,
    schema: `{
  "sections": {
    "peerReviewedJournals": [{"number": 1, "citation": "", "type": "journal"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_journals_2000_2010: {
    fields: `Section III peerReviewedJournals ONLY — refereed journal articles published from ${JOURNAL_MID_START} through ${JOURNAL_MID_END}, inclusive. Skip articles outside that date range. Number the articles you extract sequentially starting from 1 (numbering will be re-done at merge). Include optional articleKind, contributionNote, previouslyListedAs, reviewMaterialUrl, and isNewSinceLastReview ONLY when the CV explicitly provides that information.`,
    schema: `{
  "sections": {
    "peerReviewedJournals": [{"number": 1, "citation": "", "type": "journal"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_journals_late: {
    fields: `Section III peerReviewedJournals ONLY — refereed journal articles published AFTER ${JOURNAL_MID_END}. Skip articles published in ${JOURNAL_MID_END} or earlier. Number the articles you extract sequentially starting from 1 (numbering will be re-done at merge). Include optional articleKind, contributionNote, previouslyListedAs, reviewMaterialUrl, and isNewSinceLastReview ONLY when the CV explicitly provides that information.`,
    schema: `{
  "sections": {
    "peerReviewedJournals": [{"number": 1, "citation": "", "type": "journal"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_other_a: {
    fields:
      'Section III subset A: reviewAndInvited (review and invited articles), books, chapters. Number sequentially within each subsection starting at 1. Include optional articleKind, contributionNote, previouslyListedAs, reviewMaterialUrl, and isNewSinceLastReview ONLY when the CV explicitly provides that information.',
    schema: `{
  "sections": {
    "reviewAndInvited": [{"number": 1, "citation": "", "type": "review"}],
    "books": [{"number": 1, "citation": "", "type": "book"}],
    "chapters": [{"number": 1, "citation": "", "type": "chapter"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_other_proc: {
    fields:
      'Section III subset proceedings: refereedProceedings and otherProceedings. Number sequentially within each subsection starting at 1. Refereed proceedings belong under Primary Published Work; non-refereed conference proceedings belong under Other Work.',
    schema: `{
  "sections": {
    "refereedProceedings": [{"number": 1, "citation": "", "type": "proceedings"}],
    "otherProceedings": [{"number": 1, "citation": "", "type": "proceedings"}]
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
  const { fields, schema } = SLICE_PROMPTS[slice];
  return `Extract from this faculty CV the following BioBib fields ONLY: ${fields}.

CV TEXT:
${cv.rawText}

Return ONE raw JSON object with this schema. Include every key shown; use empty arrays/strings for items you do not extract. You may add optional publication fields (articleKind, isNewSinceLastReview, previouslyListedAs, contributionNote, reviewMaterialUrl, bioBibSection, originalNumber) only when the CV explicitly provides that information:
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

async function callSliceOnce(
  cv: ParsedCV,
  slice: SliceKey,
  apiKey: string,
  options: CallSliceOptions = {},
): Promise<PartialResult> {
  const response = await fetch(`${LITELLM_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: options.signal,
    body: JSON.stringify({
      model: LITELLM_MODEL,
      messages: [
        { role: 'system', content: BASE_SYSTEM },
        { role: 'user', content: buildSliceUserPrompt(cv, slice) },
      ],
      temperature: 0.1,
      // 12K caps each slice's output while preserving large bibliography slices.
      // Going larger
      // causes the model to keep generating and time out before
      // returning anything we can parse.
      max_tokens: 12000,
      response_format: { type: 'json_object' },
    }),
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

  // Several publication categories are fed by multiple bounded slices, each
  // starting at number=1. Renumber sequentially across the merged list.
  sections.peerReviewedJournals = renumberPublications(sections.peerReviewedJournals);
  sections.abstracts = renumberPublications(sections.abstracts);
  sections.reviewAndInvited = renumberPublications(sections.reviewAndInvited);
  sections.books = renumberPublications(sections.books);
  sections.chapters = renumberPublications(sections.chapters);
  sections.refereedProceedings = renumberPublications(sections.refereedProceedings);
  sections.otherProceedings = renumberPublications(sections.otherProceedings);
  sections.popularWorks = renumberPublications(sections.popularWorks);
  sections.additionalProducts = renumberPublications(sections.additionalProducts);
  sections.theses = renumberPublications(sections.theses);
  sections.patents = renumberPublications(sections.patents);
  sections.workInProgress = renumberPublications(sections.workInProgress);

  return { sections, gaps, metadata };
}

function renumberPublications<T extends { number: number }>(items: T[]): T[] {
  return items.map((c, i) => ({ ...c, number: i + 1 }));
}

// The orchestration (Promise.all over slices + merge) now lives in the
// async fan-out workers under app/api/slice/* and app/api/finalize/*.
