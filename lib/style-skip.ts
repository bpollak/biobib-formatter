/**
 * Shared skip-style logic for body-paragraph rules (INDENT-001, SPACE-001).
 * Used by BOTH the validator (to decide what to flag) and the fixer (to
 * decide what to fix). Keeping them in sync prevents non-idempotent fix
 * runs where the validator flags a paragraph the fixer never touches.
 */
export const BODY_SKIP_PATTERNS = [
  'heading', 'caption', 'footnote', 'figure', 'table', 'toc', 'list', 'abstract', 'title',
];

export function isBodySkipStyle(styleName: string | undefined | null): boolean {
  if (!styleName) return false;
  const lower = styleName.toLowerCase();
  return BODY_SKIP_PATTERNS.some(s => lower.includes(s));
}
