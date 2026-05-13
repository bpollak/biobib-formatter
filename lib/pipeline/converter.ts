/**
 * AI Conversion Pipeline
 * Sends parsed CV text to LiteLLM and returns structured BioBib sections + gaps.
 */

import { ParsedCV, ConversionResult } from '../types';
import { LITELLM_BASE_URL, LITELLM_MODEL } from '../constants';

// Inline BioBib instructions — kept here so no file I/O required at runtime
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

const SYSTEM_PROMPT = `You are an expert in UC San Diego academic affairs, specifically the Academic Biography and Bibliography (BioBib) form used for faculty academic reviews.

Your task is to convert a faculty CV into the UCSD BioBib format. You will:
1. Extract and classify all content from the CV into the correct BioBib sections
2. Preserve citation formatting exactly as it appears in the CV — do not reformat citations
3. Identify gaps where required BioBib fields cannot be filled from the CV, and generate specific, actionable instructions for each gap

UCSD BioBib Requirements:
${BIOBIB_INSTRUCTIONS_INLINE}`;

const buildUserPrompt = (cv: ParsedCV) => `Convert this faculty CV to BioBib format.

CV TEXT:
${cv.rawText}

Return a JSON object with this exact schema:
{
  "sections": {
    "employment": [{"from": "", "to": "", "institution": "", "location": "", "rank": ""}],
    "education": [{"school": "", "datesFrom": "", "datesTo": "", "location": "", "major": "", "degree": "", "dateReceived": ""}],
    "specialization": "",
    "universityService": [{"description": "", "dates": "", "category": "departmental|university|senate|systemwide|other"}],
    "publicService": [""],
    "professionalActivities": [""],
    "awards": [""],
    "teaching": [""],
    "grants": [{"title": "", "funder": "", "amount": "", "period": "", "status": "current|past", "role": ""}],
    "outreach": [""],
    "clinicalActivities": [""],
    "otherActivities": [""],
    "peerReviewedJournals": [{"number": 1, "citation": "", "type": "journal"}],
    "reviewAndInvited": [{"number": 1, "citation": "", "type": "review"}],
    "books": [{"number": 1, "citation": "", "type": "book"}],
    "chapters": [{"number": 1, "citation": "", "type": "chapter"}],
    "refereedProceedings": [{"number": 1, "citation": "", "type": "proceedings"}],
    "otherProceedings": [{"number": 1, "citation": "", "type": "proceedings"}],
    "abstracts": [{"number": 1, "citation": "", "type": "abstract"}],
    "popularWorks": [{"number": 1, "citation": "", "type": "popular"}],
    "additionalProducts": [{"number": 1, "citation": "", "type": "other"}],
    "workInProgress": []
  },
  "gaps": [
    {
      "section": "Section II — Teaching",
      "field": "Graduate students supervised",
      "instruction": "Add names, degree type (PhD/MS), and graduation year for each graduate student you have advised.",
      "severity": "required|recommended|optional"
    }
  ],
  "metadata": {
    "name": "",
    "department": "",
    "title": "",
    "processedAt": "${new Date().toISOString()}"
  }
}

Rules:
- Employment entries must be in chronological order (oldest first)
- Publications must be numbered sequentially within each subsection, chronological order
- Preserve citation text exactly — do not reformat or standardize
- For gaps, be specific: name the exact field and give actionable instructions
- If a section has no content and it is optional, omit from gaps
- workInProgress should always be empty (cannot be auto-filled)
- severity: "required" = BioBib cannot be submitted without it, "recommended" = strongly advised, "optional" = at faculty discretion`;

export async function convertCVtoBioBib(cv: ParsedCV): Promise<ConversionResult> {
  const apiKey = process.env.LITELLM_API_KEY;
  if (!apiKey) throw new Error('LITELLM_API_KEY not configured');

  const response = await fetch(`${LITELLM_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: LITELLM_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(cv) },
      ],
      temperature: 0.1,
      max_tokens: 32000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LiteLLM API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const finishReason = data.choices?.[0]?.finish_reason;
  if (!content) throw new Error('Empty response from AI');

  try {
    return JSON.parse(content) as ConversionResult;
  } catch (e) {
    const hint = finishReason === 'length'
      ? ' (response was truncated at max_tokens — CV is too large for current output cap)'
      : '';
    throw new Error(`AI returned invalid JSON${hint}: ${(e as Error).message}`);
  }
}
