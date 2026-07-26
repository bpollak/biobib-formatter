/**
 * CV Document Reader
 * Extracts plain text from an uploaded .docx CV using mammoth.
 */

import mammoth from 'mammoth';
import JSZip from 'jszip';
import { ParsedCV, RichTextParagraph, RichTextRun } from '../types';
import {
  BIOBIB_SNAPSHOT_PROPERTY,
  decodeBioBibSnapshot,
  snapshotMatchesDocument,
} from './snapshot';

const GENERATED_REVIEW_SUMMARY_INTRO =
  'This page lists items the automated conversion could not complete or was unsure how to place.';

/**
 * A generated review appendix repeats complete source records for the human
 * reviewer. Never feed those repetitions back into the extraction pipeline.
 */
export function stripGeneratedReviewSummary(value: string): string {
  const heading = /(?:^|\n)\s*Conversion Review Summary\s*(?:\n|$)/g;
  for (const match of value.matchAll(heading)) {
    const index = match.index ?? -1;
    if (index < 0) continue;
    const followingText = value.slice(index, index + 600).replace(/\s+/g, ' ');
    if (followingText.includes(GENERATED_REVIEW_SUMMARY_INTRO)) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value;
}

export async function parseCV(buffer: Buffer): Promise<ParsedCV> {
  const result = await mammoth.extractRawText({ buffer });
  const rawText = stripGeneratedReviewSummary(result.value);
  const zip = JSZip.loadAsync(buffer);
  const [richTextParagraphs, embeddedSnapshot] = await Promise.all([
    extractRichTextParagraphs(zip).catch(err => {
      console.warn('[docx reader] rich text extraction failed:', (err as Error).message);
      return [] as RichTextParagraph[];
    }),
    extractEmbeddedSnapshot(zip).catch(err => {
      console.warn('[docx reader] embedded result extraction failed:', (err as Error).message);
      return undefined;
    }),
  ]);

  // Attempt to extract name from first non-empty line
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const name = lines[0] || '';

  // Heuristically find department and title
  let department = '';
  let title = '';
  for (const line of lines.slice(0, 20)) {
    const lower = line.toLowerCase();
    if (!department && (lower.includes('department') || lower.includes('dept'))) {
      department = line;
    }
    if (!title && (lower.includes('professor') || lower.includes('lecturer') || lower.includes('associate') || lower.includes('assistant'))) {
      title = line;
    }
    if (department && title) break;
  }

  return {
    rawText,
    richTextParagraphs,
    embeddedResult: embeddedSnapshot?.result,
    embeddedSinceYear: embeddedSnapshot?.sinceYear,
    name,
    department,
    title,
  };
}

async function extractEmbeddedSnapshot(zipPromise: Promise<JSZip>) {
  const zip = await zipPromise;
  const xml = await zip.file('docProps/custom.xml')?.async('string');
  if (!xml) return undefined;

  for (const match of xml.matchAll(/<property\b([^>]*)>([\s\S]*?)<\/property>/g)) {
    const name = match[1].match(/\bname="([^"]*)"/)?.[1];
    if (!name || decodeXml(name) !== BIOBIB_SNAPSHOT_PROPERTY) continue;
    const value = match[2].match(/<vt:lpwstr(?:\s[^>]*)?>([\s\S]*?)<\/vt:lpwstr>/)?.[1];
    const snapshot = decodeBioBibSnapshot(value === undefined ? undefined : decodeXml(value));
    if (!snapshot || !await snapshotMatchesDocument(snapshot, zip)) return undefined;
    return snapshot;
  }

  return undefined;
}

async function extractRichTextParagraphs(zipPromise: Promise<JSZip>): Promise<RichTextParagraph[]> {
  const zip = await zipPromise;
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) return [];

  const paragraphs: RichTextParagraph[] = [];
  for (const paragraphXml of xml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? []) {
    const runs = extractRuns(paragraphXml);
    if (!runs.some(run => run.verticalAlign)) continue;

    const text = runs.map(run => run.text).join('').replace(/\s+/g, ' ').trim();
    if (text.length < 12) continue;
    paragraphs.push({ text, runs: coalesceRuns(runs) });
  }
  return paragraphs;
}

function extractRuns(paragraphXml: string): RichTextRun[] {
  const runs: RichTextRun[] = [];
  for (const runXml of paragraphXml.match(/<w:r[\s\S]*?<\/w:r>/g) ?? []) {
    const text = extractRunText(runXml);
    if (!text) continue;
    const verticalMatch = runXml.match(/<w:vertAlign\b[^>]*w:val="(subscript|superscript)"[^>]*\/>/);
    runs.push({
      text,
      verticalAlign: verticalMatch?.[1] as RichTextRun['verticalAlign'],
    });
  }
  return runs;
}

function extractRunText(runXml: string): string {
  const parts: string[] = [];
  for (const match of runXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)) {
    if (match[1] !== undefined) {
      parts.push(decodeXml(match[1]));
    } else {
      parts.push(' ');
    }
  }
  return parts.join('');
}

function coalesceRuns(runs: RichTextRun[]): RichTextRun[] {
  const out: RichTextRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const previous = out[out.length - 1];
    if (previous && previous.verticalAlign === run.verticalAlign) {
      previous.text += run.text;
    } else {
      out.push({ ...run });
    }
  }
  return out;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
