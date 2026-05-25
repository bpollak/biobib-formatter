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

  record(
    'Likely submitted or in-review primary work moves to Work in Progress',
    merged.sections.workInProgress.some(item => /under review/i.test(item.citation)) &&
      !merged.sections.peerReviewedJournals.some(item => /under review/i.test(item.citation)),
  );

  const buffer = await generateBioBibDocx(buildConversionResult(merged), buildRichTextParagraphs());
  const xml = await docxXml(buffer);
  const text = docxXmlToText(xml);

  record('DOCX does not expose source-number metadata', !/\bsource\s+no\.?\b/i.test(text));
  record('DOCX does not expose BioBib section metadata', !/\bBioBib section:/i.test(text));
  record('DOCX does not expose review-material metadata', !/\breview material:/i.test(text));
  record('DOCX does not render duplicate article labels', !/\bARTICLE\s+ARTICLE\b/i.test(text));
  record('DOCX replaces blank table cells with explicit review text', (text.match(/Not listed/g) ?? []).length >= 5);
  record('DOCX removes contribution notes already present in the citation', countOccurrences(text, 'Featured in Virtual Journal') === 1);
  record('DOCX declares Arial run fonts', /w:rFonts\b[^>]*w:ascii="Arial"/.test(xml));
  record(
    'Requested Section I and II headings are underlined semantic headings',
    paragraphHasStyleAndUnderline(xml, 'Section I: Employment History and Education', 'Heading1') &&
      paragraphHasStyleAndUnderline(xml, 'Section II: Professional Data', 'Heading1') &&
      paragraphHasStyleAndUnderline(xml, '(a) University Service', 'Heading2'),
  );
  record(
    'Education table headers use requested order',
    orderedText(text, [
      'Dates of attendance',
      'School, college, university, or hospital',
      'Location',
      'Major subject or field',
      'Degrees or certificates',
      'Date received',
    ]),
  );
  record(
    'Presentation subsections restart numbering at 1',
    /Presentations at National and International Meetings\s+1\.\s+Gordon Research Conference[\s\S]*Other Invited Presentations\s+1\.\s+Department of Chemistry Seminar/.test(text),
  );
  record(
    'Student instructional activities render grouped numbered lists without repeated group labels',
    /Former Ph\.D\. Students\s+1\.\s+Alice Example[\s\S]*2\.\s+Brian Example/.test(text) &&
      countOccurrences(text, 'Former Ph.D. Students') === 1 &&
      !/\b1\.\s+1\.\s+Alice Example/.test(text),
  );
  record(
    'Section III headings match requested labels',
    text.includes('Section III – Bibliography') &&
      text.includes('A. Primary Published Work or Creative Work:') &&
      text.includes('I. Refereed Journal Articles') &&
      text.includes('II. Review and Invited Articles') &&
      text.includes('III. Books and Book Chapters') &&
      text.includes('IV. Refereed Conference Proceedings') &&
      text.includes('V. Other Articles') &&
      text.includes('B. Other Work') &&
      text.includes('II. Abstracts') &&
      !text.includes('II. Abstracts of Non-Refereed Conference Proceedings'),
  );
  record(
    'Section III bibliography subheaders are not italicized',
    paragraphHasStyleWithoutItalics(xml, 'I. Refereed Journal Articles', 'Heading3') &&
      paragraphHasStyleWithoutItalics(xml, 'II. Review and Invited Articles', 'Heading3'),
  );
  record(
    'Other Articles and Work in Progress sections are present when empty or sparse',
    text.includes('V. Other Articles') && text.includes('C. Work in Progress'),
  );
  record(
    'Bibliography preserves representative subscript and superscript runs',
    /w:vertAlign w:val="subscript"/.test(xml) && /w:vertAlign w:val="superscript"/.test(xml),
  );

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
      studentInstructionalGroups: [
        {
          heading: 'Former Ph.D. Students',
          entries: [
            '2. Former Ph.D. Students: Brian Example, B.S. 2016; Ph.D. 2021.',
            '1. Alice Example, B.S. 2014; Ph.D. 2019.',
          ],
        },
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
        publication({
          citation: 'B. Chemist, "Vibrationally excited H2O+ dynamics," Journal of Chemical Physics 10, 11-12 (2026).',
          type: 'journal',
        }),
        publication({
          citation: 'C. Research, "Submitted discovery," Journal of Chemical Physics, under review.',
          type: 'journal',
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

function buildRichTextParagraphs() {
  return [
    {
      text: 'B. Chemist, "Vibrationally excited H2O+ dynamics," Journal of Chemical Physics 10, 11-12 (2026).',
      runs: [
        { text: '2. B. Chemist, "Vibrationally excited H' },
        { text: '2', verticalAlign: 'subscript' as const },
        { text: 'O' },
        { text: '+', verticalAlign: 'superscript' as const },
        { text: ' dynamics," Journal of Chemical Physics 10, 11-12 (2026).' },
      ],
    },
  ];
}

async function docxXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('word/document.xml missing from generated DOCX');
  return documentXml;
}

function docxXmlToText(documentXml: string): string {
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

function paragraphHasStyleAndUnderline(xml: string, text: string, style: string): boolean {
  const paragraph = paragraphXmlContaining(xml, text);
  return !!paragraph && paragraph.includes(`w:pStyle w:val="${style}"`) && paragraph.includes('w:u w:val="single"');
}

function paragraphHasStyleWithoutItalics(xml: string, text: string, style: string): boolean {
  const paragraph = paragraphXmlContaining(xml, text);
  return !!paragraph && paragraph.includes(`w:pStyle w:val="${style}"`) && !paragraph.includes('<w:i/>');
}

function paragraphXmlContaining(xml: string, text: string): string | undefined {
  return (xml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? []).find(paragraph =>
    docxXmlToText(paragraph).includes(text),
  );
}

function orderedText(text: string, parts: string[]): boolean {
  let cursor = -1;
  for (const part of parts) {
    const next = text.indexOf(part, cursor + 1);
    if (next === -1) return false;
    cursor = next;
  }
  return true;
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
