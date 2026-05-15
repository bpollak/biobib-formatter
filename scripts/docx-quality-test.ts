import JSZip from 'jszip';
import { generateBioBibDocx } from '../lib/docx/writer';
import { mergeSlices, PartialResult } from '../lib/pipeline/converter';
import { ConversionResult, PublicationEntry } from '../lib/types';

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

const checks: Check[] = [];

function record(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const merged = mergeSlices([buildPartialResult()]);

  record(
    'Conference-style invited presentation is moved to national/international presentations',
    merged.sections.presentations.some(item => item.includes('Gordon Research Conference')),
  );
  record(
    'Institutional seminar remains in other invited presentations',
    merged.sections.invitedPresentations.some(item => item.includes('Department of Chemistry Seminar')),
  );
  record(
    'Structural gaps are added for reviewable blank table fields',
    merged.gaps.some(g => g.field === 'Employment location') &&
      merged.gaps.some(g => g.field === 'Attendance dates') &&
      merged.gaps.some(g => g.field === 'School location') &&
      merged.gaps.some(g => g.field === 'Role and co-PI/share'),
  );

  const buffer = await generateBioBibDocx(buildConversionResult(merged));
  const text = await docxText(buffer);

  record('DOCX does not expose source-number metadata', !/\bsource\s+no\.?\b/i.test(text));
  record('DOCX does not expose BioBib section metadata', !/\bBioBib section:/i.test(text));
  record('DOCX does not expose review-material metadata', !/\breview material:/i.test(text));
  record('DOCX does not render duplicate article labels', !/\bARTICLE\s+ARTICLE\b/i.test(text));
  record('DOCX replaces blank table cells with explicit review text', (text.match(/Not listed/g) ?? []).length >= 5);
  record('DOCX removes contribution notes already present in the citation', countOccurrences(text, 'Featured in Virtual Journal') === 1);

  const failed = checks.filter(check => !check.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length) process.exit(1);
}

function buildPartialResult(): PartialResult {
  return {
    metadata: {
      name: 'Test, Faculty',
      department: 'Department of Chemistry and Biochemistry',
      title: 'Professor',
      processedAt: new Date().toISOString(),
    },
    sections: {
      employment: [
        {
          from: '1999',
          to: 'present',
          institution: 'University of California San Diego',
          location: '',
          rank: 'Professor',
        },
      ],
      education: [
        {
          school: 'University of California, Berkeley',
          datesFrom: '',
          datesTo: '',
          location: '',
          major: 'Physical Chemistry',
          degree: 'Ph.D.',
          dateReceived: '1989',
        },
      ],
      grants: [
        {
          title: 'Dynamics and Energetics',
          funder: 'National Science Foundation',
          amount: '',
          totalAward: '',
          period: '2024-2027',
          status: 'current',
          role: '',
          coPIsShare: '',
        },
      ],
      presentations: [],
      invitedPresentations: [
        'Gordon Research Conference on Molecular Beams, 2024.',
        'Department of Chemistry Seminar, Example University, 2025.',
      ],
      peerReviewedJournals: [
        publication({
          citation: 'A. Scholar, "Example result," Journal 1, 1-2 (2025). Featured in Virtual Journal.',
          articleKind: 'COVER ARTICLE' as PublicationEntry['articleKind'],
          contributionNote: 'Featured in Virtual Journal.',
          originalNumber: '123',
          bioBibSection: 'A.I.a',
          reviewMaterialUrl: 'https://example.invalid/review',
        }),
      ],
    },
    gaps: [],
  };
}

function publication(overrides: Partial<PublicationEntry>): PublicationEntry {
  return {
    number: 1,
    citation: '',
    type: 'journal',
    ...overrides,
  } as PublicationEntry;
}

function buildConversionResult(merged: ConversionResult): ConversionResult {
  return {
    ...merged,
    sections: {
      ...merged.sections,
      specialization: 'Chemical dynamics.',
    },
  };
}

async function docxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('word/document.xml missing from generated DOCX');

  return documentXml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+\n/g, '\n')
    .trim();
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
