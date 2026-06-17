/**
 * Shared text helpers used by both the AI merge pipeline (lib/pipeline/converter.ts)
 * and the docx writer (lib/docx/writer.ts). Keep these in one place so dedupe and
 * student-group normalization behave identically at merge time and at render time.
 */

import { extractInitialDateInfo } from './date-utils';

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function hasText(value?: string): boolean {
  return !!value?.trim();
}

/** Lowercase + collapse whitespace. Key for exact-ish dedupe. */
export function normalizeForDedupe(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Lowercase + strip punctuation. Key for fuzzy comparison. */
export function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function dedupeBy<T>(items: T[], keyFn: (item: T) => string): T[] {
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

export function dedupeStrings(items: string[]): string[] {
  return dedupeBy(items, normalizeForDedupe);
}

/** Initial date mentioned in the string; undated items sort last. */
export function chronologicalYear(value: string): number {
  return extractInitialDateInfo(value)?.sortKey ?? Number.MAX_SAFE_INTEGER;
}

export function sortChronologically(items: string[]): string[] {
  return [...items].sort((a, b) => chronologicalYear(a) - chronologicalYear(b));
}

/** Canonicalize student instructional group headings so slices merge cleanly. */
export function normalizeStudentGroupHeading(value: string): string {
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

/** Remove a leading source number and redundant group-heading prefix from an entry. */
export function stripStudentGroupPrefix(entry: string, heading: string): string {
  const escaped = escapeRegex(heading);
  return entry
    .replace(/^\s*\d+\s*[.)]\s*/, '')
    .replace(new RegExp(`^\\s*${escaped}\\s*:?\\s*`, 'i'), '')
    .replace(/^\s*(Current|Former)\s+(Ph\.?D\.?|Masters?|Postdoctoral|Staff|Undergraduate|Visiting)[^:]{0,80}:\s*/i, '')
    .trim();
}
