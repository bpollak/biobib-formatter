/**
 * CV Document Reader
 * Extracts plain text from an uploaded .docx CV using mammoth.
 */

import mammoth from 'mammoth';
import JSZip from 'jszip';
import { ParsedCV, RichTextParagraph, RichTextRun } from '../types';

export async function parseCV(buffer: Buffer): Promise<ParsedCV> {
  const result = await mammoth.extractRawText({ buffer });
  const rawText = result.value;
  const richTextParagraphs = await extractRichTextParagraphs(buffer).catch(err => {
    console.warn('[docx reader] rich text extraction failed:', (err as Error).message);
    return [] as RichTextParagraph[];
  });

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

  return { rawText, richTextParagraphs, name, department, title };
}

async function extractRichTextParagraphs(buffer: Buffer): Promise<RichTextParagraph[]> {
  const zip = await JSZip.loadAsync(buffer);
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
