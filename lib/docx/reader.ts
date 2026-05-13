/**
 * CV Document Reader
 * Extracts plain text from an uploaded .docx CV using mammoth.
 */

import mammoth from 'mammoth';
import { ParsedCV } from '../types';

export async function parseCV(buffer: Buffer): Promise<ParsedCV> {
  const result = await mammoth.extractRawText({ buffer });
  const rawText = result.value;

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

  return { rawText, name, department, title };
}
