/**
 * AI Conversion Pipeline
 *
 * Converts a parsed CV to a UCSD BioBib by issuing four scoped, parallel
 * AI calls — one per logical slice — and merging the partial results.
 *
 * Why chunked: a single call generating the full ConversionResult JSON
 * for a 150+ publication CV produces 30K+ output tokens, which takes
 * 5–10 minutes of wall time and exceeds Vercel's 300s function cap.
 * Splitting into four calls run in parallel keeps each call under
 * ~10K output tokens (~30–60s) and total wall time near max(durations).
 */

import { ParsedCV, ConversionResult, BioBibSections, BioBibGap } from '../types';
import { LITELLM_BASE_URL, LITELLM_MODEL } from '../constants';

// ── BioBib reference text shared by all section prompts ──────────────────────

const BIOBIB_INSTRUCTIONS_INLINE = `
Section I: Employment History and Education
- List all employment chronologically from first academic position to present
- Include all UC employment, part-time appointments, periods of non-employment
- Education: list schools, dates, location, major, degree, date received

Section II: Professional Data (9 categories, all required — indicate "none" if not applicable):
1. University Service (departmental, college, Academic Senate, campus, systemwide)
2. Public Service
3. Professional Activities (society memberships, editorial boards, conference roles)
4. Awards and Honors (with dates)
5. Teaching (courses taught, graduate students supervised, postdocs)
6. Research Support (current and past grants — title, funder, amount, period, role)
7. Outreach / Public Engagement
8. Clinical Activities
9. Other Activities

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
  - Abstracts
  - Popular Works
  - Additional Products (patents, software, datasets, etc.)
C. Work in Progress (optional — only if submitting material with file)
`.trim();

const BASE_SYSTEM = `You are an expert in UC San Diego academic affairs, specifically the Academic Biography and Bibliography (BioBib) form used for faculty academic reviews.

Your task is to extract part of a UCSD BioBib from a faculty CV. You must:
1. Extract ONLY the fields you are asked to extract in this call. Leave every other field as an empty array or empty string.
2. Preserve citation formatting exactly as it appears in the CV — do not reformat citations.
3. Identify gaps where required fields cannot be filled from the CV ONLY for the slice you were asked about.

UCSD BioBib reference:
${BIOBIB_INSTRUCTIONS_INLINE}`;

// ── Section slice definitions ────────────────────────────────────────────────

export type SliceKey =
  | 'meta_and_I'
  | 'II'
  | 'III_journals_early'
  | 'III_journals_late'
  | 'III_other_a'
  | 'III_other_b';

export const SLICE_KEYS: readonly SliceKey[] = [
  'meta_and_I',
  'II',
  'III_journals_early',
  'III_journals_late',
  'III_other_a',
  'III_other_b',
];

// Year boundary used to split peerReviewedJournals into two chunks of
// roughly comparable size for prolific faculty. Early career CVs will
// have an empty "late" or "early" slice — cheap, no harm.
const JOURNAL_SPLIT_YEAR = 2010;

export interface PartialResult {
  sections: Partial<BioBibSections>;
  gaps?: BioBibGap[];
  metadata?: ConversionResult['metadata'];
}

const SLICE_PROMPTS: Record<SliceKey, { fields: string; schema: string }> = {
  meta_and_I: {
    fields:
      'metadata (name, department, title), Section I (employment, education, specialization)',
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
  II: {
    fields:
      'Section II only: universityService, publicService, professionalActivities, awards, teaching, grants, outreach, clinicalActivities, otherActivities',
    schema: `{
  "sections": {
    "universityService": [{"description": "", "dates": "", "category": "departmental|university|senate|systemwide|other"}],
    "publicService": [""],
    "professionalActivities": [""],
    "awards": [""],
    "teaching": [""],
    "grants": [{"title": "", "funder": "", "amount": "", "period": "", "status": "current|past", "role": ""}],
    "outreach": [""],
    "clinicalActivities": [""],
    "otherActivities": [""]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_journals_early: {
    fields: `Section III peerReviewedJournals ONLY — refereed journal articles published in ${JOURNAL_SPLIT_YEAR} or earlier. Skip articles published after ${JOURNAL_SPLIT_YEAR}. Number the articles you extract sequentially starting from 1 (numbering will be re-done at merge).`,
    schema: `{
  "sections": {
    "peerReviewedJournals": [{"number": 1, "citation": "", "type": "journal"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_journals_late: {
    fields: `Section III peerReviewedJournals ONLY — refereed journal articles published AFTER ${JOURNAL_SPLIT_YEAR}. Skip articles published in ${JOURNAL_SPLIT_YEAR} or earlier. Number the articles you extract sequentially starting from 1 (numbering will be re-done at merge).`,
    schema: `{
  "sections": {
    "peerReviewedJournals": [{"number": 1, "citation": "", "type": "journal"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_other_a: {
    fields:
      'Section III subset A: reviewAndInvited (review and invited articles), books, chapters. Number sequentially within each subsection starting at 1.',
    schema: `{
  "sections": {
    "reviewAndInvited": [{"number": 1, "citation": "", "type": "review"}],
    "books": [{"number": 1, "citation": "", "type": "book"}],
    "chapters": [{"number": 1, "citation": "", "type": "chapter"}]
  },
  "gaps": [{"section": "", "field": "", "instruction": "", "severity": "required|recommended|optional"}]
}`,
  },
  III_other_b: {
    fields:
      'Section III subset B: refereedProceedings, otherProceedings, abstracts, popularWorks, additionalProducts. Number sequentially within each subsection starting at 1.',
    schema: `{
  "sections": {
    "refereedProceedings": [{"number": 1, "citation": "", "type": "proceedings"}],
    "otherProceedings": [{"number": 1, "citation": "", "type": "proceedings"}],
    "abstracts": [{"number": 1, "citation": "", "type": "abstract"}],
    "popularWorks": [{"number": 1, "citation": "", "type": "popular"}],
    "additionalProducts": [{"number": 1, "citation": "", "type": "other"}]
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

Return ONE raw JSON object with EXACTLY this schema. Include every key shown; use empty arrays/strings for items you do not extract:
${schema}

Output rules — IMPORTANT:
- Respond with raw JSON only. Do NOT wrap the JSON in markdown code fences (no \`\`\`json or \`\`\`). Do NOT prefix or suffix with any prose.
- The first character of your response must be "{" and the last character must be "}".

Content rules:
- Only populate the fields listed above. Do not include keys for other sections.
- Preserve citation text exactly — do not reformat or standardize.
- Employment must be chronological (oldest first). Publications must be chronological and numbered sequentially within each subsection.
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

async function callSliceOnce(cv: ParsedCV, slice: SliceKey, apiKey: string): Promise<PartialResult> {
  const response = await fetch(`${LITELLM_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: LITELLM_MODEL,
      messages: [
        { role: 'system', content: BASE_SYSTEM },
        { role: 'user', content: buildSliceUserPrompt(cv, slice) },
      ],
      temperature: 0.1,
      max_tokens: 16000,
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
    console.warn(`[converter] slice "${slice}" failed, retrying once:`, (e as Error).message);
    return await callSliceOnce(cv, slice, apiKey);
  }
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
    awards: [],
    teaching: [],
    grants: [],
    outreach: [],
    clinicalActivities: [],
    otherActivities: [],
    peerReviewedJournals: [],
    reviewAndInvited: [],
    books: [],
    chapters: [],
    refereedProceedings: [],
    otherProceedings: [],
    abstracts: [],
    popularWorks: [],
    additionalProducts: [],
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

  // peerReviewedJournals is fed by two slices (early/late), each starting
  // at number=1. Renumber sequentially across the merged list.
  sections.peerReviewedJournals = sections.peerReviewedJournals.map((c, i) => ({ ...c, number: i + 1 }));

  return { sections, gaps, metadata };
}

// The orchestration (Promise.all over slices + merge) now lives in the
// async fan-out workers under app/api/slice/* and app/api/finalize/*.
