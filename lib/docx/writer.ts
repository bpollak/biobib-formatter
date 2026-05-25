/**
 * BioBib Document Writer
 * Generates a UCSD BioBib .docx from a ConversionResult.
 */

import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, HeadingLevel, AlignmentType,
  Packer, ShadingType, UnderlineType, IRunOptions,
} from 'docx';
import {
  ConversionResult,
  EmploymentEntry,
  EducationEntry,
  PublicationEntry,
  GrantEntry,
  RichTextParagraph,
  RichTextRun,
  StudentInstructionalGroup,
} from '../types';

const UCSD_BLUE = '003B5C';
const LIGHT_GRAY = 'F2F2F2';
const FONT_NAME = 'Arial';

function run(options: IRunOptions): TextRun {
  return new TextRun({ font: FONT_NAME, ...options });
}

function heading1(text: string, options?: { underline?: boolean }): Paragraph {
  return new Paragraph({
    children: [run({ text, bold: true, size: 24, underline: options?.underline ? { type: UnderlineType.SINGLE } : undefined })],
    heading: HeadingLevel.HEADING_1,
    thematicBreak: false,
    spacing: { before: 240, after: 120 },
  });
}

function heading2(text: string, options?: { underline?: boolean }): Paragraph {
  return new Paragraph({
    children: [run({ text, bold: true, size: 22, underline: options?.underline ? { type: UnderlineType.SINGLE } : undefined })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
  });
}

function heading3(text: string): Paragraph {
  return new Paragraph({
    children: [run({ text, bold: true, italics: true, size: 20 })],
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 160, after: 60 },
  });
}

function body(text: string, options?: { bold?: boolean; italic?: boolean }): Paragraph {
  return new Paragraph({
    children: [run({ text, bold: options?.bold, italics: options?.italic, size: 20 })],
    spacing: { after: 60 },
  });
}

function manualPlaceholder(instruction: string): Paragraph {
  return new Paragraph({
    children: [
      run({
        text: `[MANUAL ENTRY REQUIRED: ${instruction}]`,
        color: 'CC0000',
        italics: true,
        size: 20,
      }),
    ],
    spacing: { after: 60 },
  });
}

function dividerLine(): Paragraph {
  return new Paragraph({
    thematicBreak: true,
    spacing: { before: 60, after: 60 },
  });
}

const NOT_LISTED = 'Not listed';

function displayCellValue(value?: string, fallback = NOT_LISTED): string {
  const cleaned = (value ?? '').trim();
  return cleaned || fallback;
}

function employmentTable(entries: EmploymentEntry[]): Table {
  const headerRow = new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [run({ text: 'Period', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 20, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: 'Institution / Organization', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 35, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: 'Location', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 20, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: 'Rank / Title', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 25, type: WidthType.PERCENTAGE } }),
    ],
    tableHeader: true,
  });

  const dataRows = entries.map(e => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [run({ text: displayCellValue(formatPeriod(e.from, e.to)), size: 18 })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: displayCellValue(e.institution), size: 18 })] })], width: { size: 35, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: displayCellValue(e.location), size: 18 })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: displayCellValue(e.rank), size: 18 })] })], width: { size: 25, type: WidthType.PERCENTAGE } }),
    ],
  }));

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function educationTable(entries: EducationEntry[]): Table {
  const headerRow = new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [run({ text: 'Dates of attendance', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 18, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: 'School, college, university, or hospital', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 28, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: 'Location', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 16, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: 'Major subject or field', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 16, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: 'Degrees or certificates', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 12, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: 'Date received', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 10, type: WidthType.PERCENTAGE } }),
    ],
    tableHeader: true,
  });

  const dataRows = entries.map(e => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [run({ text: displayCellValue(formatPeriod(e.datesFrom, e.datesTo)), size: 18 })] })], width: { size: 18, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: displayCellValue(e.school), size: 18 })] })], width: { size: 28, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: displayCellValue(e.location), size: 18 })] })], width: { size: 16, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: displayCellValue(e.major), size: 18 })] })], width: { size: 16, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: displayCellValue(cleanDegree(e.degree, e.dateReceived)), size: 18 })] })], width: { size: 12, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [run({ text: displayCellValue(e.dateReceived), size: 18 })] })], width: { size: 10, type: WidthType.PERCENTAGE } }),
    ],
  }));

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function formatPeriod(from?: string, to?: string): string {
  const cleanFrom = cleanDatePart(from);
  const cleanTo = cleanDatePart(to);
  if (cleanFrom && cleanTo) return `${cleanFrom} – ${cleanTo}`;
  return cleanFrom || cleanTo || '';
}

function cleanDatePart(value?: string): string {
  return (value ?? '')
    .trim()
    .replace(/^[-–—]\s*/, '')
    .replace(/\s*[-–—]$/, '');
}

function cleanDegree(degree: string, dateReceived: string): string {
  if (!dateReceived) return degree;
  return degree
    .replace(new RegExp(`\\s*\\(${escapeRegex(dateReceived)}\\)\\s*$`), '')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tableCell(text: string, options?: { bold?: boolean; shaded?: boolean; width?: number; fallback?: string }): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [run({ text: options?.bold ? text : displayCellValue(text, options?.fallback), bold: options?.bold, size: 18 })] })],
    shading: options?.shaded ? { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY } : undefined,
    width: options?.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
  });
}

function publicationList(entries: PublicationEntry[], richTextParagraphs: RichTextParagraph[] = []): Paragraph[] {
  if (entries.length === 0) return [];
  return entries.flatMap(e => {
    const prefix = e.isNewSinceLastReview ? `*${e.number}. ` : `${e.number}. `;
    const notes = [
      formatArticleKind(e.articleKind),
      formatPreviouslyListedAs(e.previouslyListedAs),
    ].filter(Boolean).join('; ');
    const contributionNote = formatContributionNote(e.contributionNote, e.citation);

    const paragraphs = [
      new Paragraph({
        children: [
          run({ text: prefix, bold: true, size: 20 }),
          ...citationRuns(e.citation, richTextParagraphs),
        ],
        spacing: { after: contributionNote || notes ? 30 : 80 },
      }),
    ];

    if (notes) {
      paragraphs.push(new Paragraph({
        children: [run({ text: notes, italics: true, size: 18 })],
        spacing: { after: contributionNote ? 30 : 80 },
      }));
    }

    if (contributionNote) {
      paragraphs.push(new Paragraph({
        children: [run({ text: contributionNote, italics: true, size: 18 })],
        spacing: { after: 80 },
      }));
    }

    return paragraphs;
  });
}

function formatArticleKind(value?: string): string {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'research') return 'Research article';
  if (normalized === 'review') return 'Review article';
  if (normalized === 'creative') return 'Creative work';
  return '';
}

function formatPreviouslyListedAs(value?: string): string {
  const cleaned = cleanPublicationNote(value);
  return cleaned ? `Previously listed as ${cleaned}` : '';
}

function formatContributionNote(note: string | undefined, citation: string): string {
  const cleaned = cleanPublicationNote(note);
  if (!cleaned) return '';
  if (normalizeForComparison(citation).includes(normalizeForComparison(cleaned))) return '';
  return sentenceCaseAllCaps(cleaned);
}

function cleanPublicationNote(value?: string): string {
  const cleaned = (value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.;]\s*$/, '');
  if (!cleaned) return '';
  if (/\b(source\s+no\.?|biobib\s+section|review\s+material)\b/i.test(cleaned)) return '';
  return cleaned;
}

function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function citationRuns(citation: string, richTextParagraphs: RichTextParagraph[]): TextRun[] {
  const matched = findRichCitation(citation, richTextParagraphs);
  if (!matched) return [run({ text: citation, size: 20 })];
  return stripRichSourceNumber(matched.runs).map(sourceRun =>
    run({
      text: sourceRun.text,
      size: 20,
      subScript: sourceRun.verticalAlign === 'subscript' || undefined,
      superScript: sourceRun.verticalAlign === 'superscript' || undefined,
    }),
  );
}

function findRichCitation(citation: string, richTextParagraphs: RichTextParagraph[]): RichTextParagraph | undefined {
  const normalizedCitation = normalizeCitationMatch(stripSourceNumber(citation));
  if (!normalizedCitation) return undefined;

  let best: { paragraph: RichTextParagraph; score: number } | undefined;
  for (const paragraph of richTextParagraphs) {
    const normalizedSource = normalizeCitationMatch(stripSourceNumber(paragraph.text));
    if (!normalizedSource) continue;
    let score = 0;
    if (normalizedSource === normalizedCitation) score = 1;
    else if (normalizedSource.includes(normalizedCitation) || normalizedCitation.includes(normalizedSource)) score = 0.9;
    else score = tokenOverlapScore(normalizedCitation, normalizedSource);
    if (score > (best?.score ?? 0)) best = { paragraph, score };
  }
  return best && best.score >= 0.72 ? best.paragraph : undefined;
}

function normalizeCitationMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/^\s*\d+\s*[.)]\s*/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlapScore(a: string, b: string): number {
  const aTokens = new Set(a.split(' ').filter(token => token.length > 2));
  const bTokens = new Set(b.split(' ').filter(token => token.length > 2));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let matches = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) matches += 1;
  }
  return matches / Math.max(aTokens.size, bTokens.size);
}

function stripRichSourceNumber(runs: RichTextRun[]): RichTextRun[] {
  const out = runs.map(item => ({ ...item }));
  while (out.length > 0) {
    const updated = out[0].text.replace(/^\s*\d+\s*[.)]\s*/, '');
    if (updated === out[0].text) break;
    out[0].text = updated;
    if (out[0].text) break;
    out.shift();
  }
  return out.filter(item => item.text);
}

function sentenceCaseAllCaps(value: string): string {
  const letters = value.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4 || letters !== letters.toUpperCase()) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function stringList(items: string[]): Paragraph[] {
  return items.map(item => new Paragraph({
    children: [run({ text: item, size: 20 })],
    spacing: { after: 60 },
  }));
}

function numberedStringList(items: string[]): Paragraph[] {
  return items.map((item, index) => new Paragraph({
    children: [
      run({ text: `${index + 1}. `, bold: true, size: 20 }),
      run({ text: item, size: 20 }),
    ],
    spacing: { after: 60 },
  }));
}

function listOrNone(items: string[], noneText = 'None.'): Paragraph[] {
  return items.length > 0 ? stringList(items) : [body(noneText)];
}

function serviceList(items: { description: string; dates: string }[]): Paragraph[] {
  return stringList(items.map(s => {
    const dates = cleanWrappedDate(s.dates);
    return `${s.description}${dates ? ` (${dates})` : ''}`;
  }));
}

function cleanWrappedDate(value: string): string {
  return value.trim().replace(/^\((.*)\)$/, '$1').trim();
}

function stripSourceNumber(value: string): string {
  return value.trim().replace(/^\d+\s*[.)]\s*/, '');
}

function shouldRenderPresentation(value: string): boolean {
  const lower = value.toLowerCase();
  return !lower.includes('(poster)') && !lower.includes('poster presentation') && !lower.includes('contributed talk');
}

function grantTable(grants: GrantEntry[]): Table {
  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        tableCell('Title', { bold: true, shaded: true, width: 27 }),
        tableCell('Granting agency', { bold: true, shaded: true, width: 20 }),
        tableCell('Amount of total award', { bold: true, shaded: true, width: 17 }),
        tableCell('Time period', { bold: true, shaded: true, width: 14 }),
        tableCell('Role', { bold: true, shaded: true, width: 10 }),
        tableCell('Co-PIs / share', { bold: true, shaded: true, width: 12 }),
      ],
    }),
    ...grants.map(g => new TableRow({
      children: [
        tableCell(g.title),
        tableCell(g.funder),
        tableCell(g.totalAward || g.amount || ''),
        tableCell(g.period),
        tableCell(g.role || ''),
        tableCell(g.coPIsShare || ''),
      ],
    })),
  ];

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function grantsOrNone(grants: GrantEntry[]): (Paragraph | Table)[] {
  if (grants.length === 0) return [body('None.')];
  return [
    grantTable(grants),
    new Paragraph({ text: '', spacing: { after: 120 } }),
  ];
}

function subSection(heading: string, items: string[], noneText = 'None.'): Paragraph[] {
  return [
    heading3(heading),
    ...listOrNone(items, noneText),
  ];
}

function presentationSubSection(heading: string, items: string[], noneText = 'None.'): Paragraph[] {
  const cleaned = items.map(stripSourceNumber).filter(shouldRenderPresentation);
  return [
    heading3(heading),
    ...(cleaned.length > 0 ? numberedStringList(cleaned) : [body(noneText)]),
  ];
}

function studentInstructionalSection(
  groups: StudentInstructionalGroup[],
  flatItems: string[],
  fallbackTeaching: string[],
): Paragraph[] {
  const normalizedGroups = normalizeStudentGroups(groups, flatItems);
  if (normalizedGroups.length > 0) {
    return normalizedGroups.flatMap(group => [
      heading3(group.heading),
      ...numberedStringList(group.entries),
    ]);
  }

  const mentoringOnly = fallbackTeaching.filter(looksLikeStudentMentoring);
  if (mentoringOnly.length > 0) return stringList(mentoringOnly);
  return [manualPlaceholder('List students supervised, postdoctoral researchers mentored, undergraduate research students, visiting scholars/students, and thesis committee service.')];
}

function looksLikeStudentMentoring(value: string): boolean {
  return /\b(student|advisee|thesis|dissertation|committee|mentor|supervis|postdoc|postdoctoral|undergraduate|graduate|visitor|visiting|staff scientist)\b/i
    .test(value);
}

function normalizeStudentGroups(
  groups: StudentInstructionalGroup[],
  flatItems: string[],
): StudentInstructionalGroup[] {
  const allGroups = [...groups];
  for (const item of flatItems) {
    const parsed = parseFlatStudentItem(item);
    if (parsed) allGroups.push(parsed);
  }

  const byHeading = new Map<string, string[]>();
  for (const group of allGroups) {
    const heading = cleanStudentHeading(group.heading);
    if (!heading) continue;
    const existing = byHeading.get(heading) ?? [];
    existing.push(...group.entries.map(entry => stripStudentPrefix(entry, heading)).filter(Boolean));
    byHeading.set(heading, dedupeStrings(existing).sort((a, b) => firstYear(a) - firstYear(b)));
  }

  return [...byHeading.entries()]
    .filter(([, entries]) => entries.length > 0)
    .map(([heading, entries]) => ({ heading, entries }));
}

function parseFlatStudentItem(item: string): StudentInstructionalGroup | undefined {
  const match = item.match(/^\s*([^:]{4,90}):\s*(.+)$/);
  if (!match) return undefined;
  return { heading: match[1], entries: [match[2]] };
}

function cleanStudentHeading(value: string): string {
  const cleaned = value.replace(/:$/, '').trim();
  const lower = cleaned.toLowerCase();
  if (lower.includes('postdoctoral fellow') && lower.includes('current')) return 'Current Postdoctoral Associates';
  if (lower.includes('undergraduate') && lower.includes('former')) return 'Former Undergraduate Research Students';
  if (lower.includes('undergraduate')) return 'Undergraduate Research Students';
  return cleaned;
}

function stripStudentPrefix(value: string, heading: string): string {
  const escaped = escapeRegex(heading);
  return value
    .replace(new RegExp(`^\\s*${escaped}\\s*:?\\s*`, 'i'), '')
    .replace(/^\s*(Current|Former)\s+(Ph\.?D\.?|Masters?|Postdoctoral|Staff|Undergraduate|Visiting)[^:]{0,80}:\s*/i, '')
    .trim();
}

function firstYear(value: string): number {
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function dedupeStrings(items: string[]): string[] {
  return [...new Map(items.map(item => [normalizeForComparison(item), item])).values()];
}

function publicationSubSection(
  heading: string,
  entries: PublicationEntry[],
  richTextParagraphs: RichTextParagraph[] = [],
): Paragraph[] {
  return [
    heading3(heading),
    ...(entries.length > 0 ? publicationList(entries, richTextParagraphs) : [body('None.')]),
  ];
}

function additionalProductsSection(
  additionalProducts: PublicationEntry[],
  theses: PublicationEntry[],
  patents: PublicationEntry[],
  facultyName: string,
  richTextParagraphs: RichTextParagraph[] = [],
): Paragraph[] {
  const ownTheses = filterOwnTheses(theses, facultyName);
  const children = [
    heading3('IV. Additional Products of Major Research'),
    ...publicationSubSection('a. Theses', ownTheses, richTextParagraphs),
    ...publicationSubSection('b. Patent/Patent License', patents, richTextParagraphs),
  ];

  if (additionalProducts.length > 0) {
    children.push(
      heading3('c. Other Products'),
      ...publicationList(additionalProducts, richTextParagraphs),
    );
  }

  return children;
}

function filterOwnTheses(theses: PublicationEntry[], facultyName: string): PublicationEntry[] {
  const lastName = facultyName.split(',')[0]?.trim().toLowerCase();
  if (!lastName) return theses;
  return theses.filter(t => {
    const citationStart = t.citation.slice(0, 120).toLowerCase();
    return citationStart.includes(lastName);
  });
}

function workInProgressSection(entries: PublicationEntry[], richTextParagraphs: RichTextParagraph[] = []): Paragraph[] {
  const byType = {
    journal: entries.filter(entry => entry.type === 'journal'),
    review: entries.filter(entry => entry.type === 'review'),
    book: entries.filter(entry => entry.type === 'book' || entry.type === 'chapter'),
    proceedings: entries.filter(entry => entry.type === 'proceedings'),
    other: entries.filter(entry => !['journal', 'review', 'book', 'chapter', 'proceedings'].includes(entry.type)),
  };
  return [
    heading2('C. Work in Progress'),
    ...publicationSubSection('I. Refereed Journal Articles', renumberForDisplay(byType.journal), richTextParagraphs),
    ...publicationSubSection('II. Review and Invited Articles', renumberForDisplay(byType.review), richTextParagraphs),
    ...publicationSubSection('III. Books and Book Chapters', renumberForDisplay(byType.book), richTextParagraphs),
    ...publicationSubSection('IV. Refereed Conference Proceedings', renumberForDisplay(byType.proceedings), richTextParagraphs),
    ...publicationSubSection('V. Other Articles', renumberForDisplay(byType.other), richTextParagraphs),
  ];
}

function renumberForDisplay(entries: PublicationEntry[]): PublicationEntry[] {
  return entries.map((entry, index) => ({ ...entry, number: index + 1 }));
}

export async function generateBioBibDocx(
  result: ConversionResult,
  richTextParagraphs: RichTextParagraph[] = [],
): Promise<Buffer> {
  const { sections, metadata } = result;

  // ── Document title block ───────────────────────────────────────────────────
  const titleBlock = [
    new Paragraph({
      children: [run({ text: 'UCSD ACADEMIC BIOGRAPHY/BIBLIOGRAPHY FORM', bold: true, size: 28, color: UCSD_BLUE })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        run({ text: 'Name: ', bold: true, size: 22 }),
        run({ text: metadata.name || '________________', size: 22 }),
        run({ text: '     Department: ', bold: true, size: 22 }),
        run({ text: metadata.department || '________________', size: 22 }),
      ],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [
        run({ text: 'Title: ', bold: true, size: 22 }),
        run({ text: metadata.title || '________________', size: 22 }),
      ],
      spacing: { after: 200 },
    }),
  ];

  // ── Section I ──────────────────────────────────────────────────────────────
  const sectionI = [
    heading1('Section I: Employment History and Education', { underline: true }),

    heading2('Previous Applicable Employment'),
    ...(sections.employment.length > 0
      ? [employmentTable(sections.employment), new Paragraph({ text: '', spacing: { after: 120 } })]
      : [manualPlaceholder('List all employment chronologically from first academic position to present. Include institution, location, rank/title, and dates.')]),

    heading2('Education'),
    ...(sections.education.length > 0
      ? [educationTable(sections.education), new Paragraph({ text: '', spacing: { after: 120 } })]
      : [manualPlaceholder('List schools attended, dates, location, major field, degree, and date received.')]),

    heading2('Areas of Sub-Specialization'),
    sections.specialization
      ? body(sections.specialization)
      : manualPlaceholder('Describe your areas of sub-specialization or board certification.'),
  ];

  // ── Section II ─────────────────────────────────────────────────────────────
  const departmentalService = sections.universityService.filter(s => s.category === 'departmental');
  const nonDepartmentalService = sections.universityService.filter(s => s.category !== 'departmental');
  const currentGrants = sections.grants.filter(g => g.status === 'current');
  const pastGrants = sections.grants.filter(g => g.status === 'past');

  const sectionII = [
    heading1('Section II: Professional Data', { underline: true }),

    heading2('(a) University Service', { underline: true }),
    heading3('Departmental Service'),
    ...(departmentalService.length > 0 ? serviceList(departmentalService) : [body('None.')]),
    heading3('University, Campus, Academic Senate, and Systemwide Service'),
    ...(nonDepartmentalService.length > 0 ? serviceList(nonDepartmentalService) : [body('None.')]),
    ...(sections.publicService.length > 0 ? [heading3('Public Service'), ...stringList(sections.publicService)] : []),

    dividerLine(),
    heading2('(b) Memberships', { underline: true }),
    ...listOrNone(sections.memberships),

    dividerLine(),
    heading2('(c) Honors and Awards', { underline: true }),
    ...(sections.awards.length > 0 ? stringList(sections.awards) : [manualPlaceholder('List awards and honors with dates received.')]),

    dividerLine(),
    heading2('(d) Contracts and Grants', { underline: true }),
    heading3('Current Research Support'),
    ...grantsOrNone(currentGrants),
    heading3('Past Research Support'),
    ...grantsOrNone(pastGrants),

    dividerLine(),
    heading2('(e) External Professional Activities', { underline: true }),
    ...subSection('Professional Committee Service and Conference Organization', [
      ...sections.professionalActivities,
      ...sections.externalProfessionalActivities,
    ]),
    ...subSection('Consulting', sections.consulting),
    ...subSection('Reviewer for External Academic Files, Funding Agencies, and Journals', sections.reviewerActivities),
    ...presentationSubSection('Presentations at National and International Meetings', sections.presentations),
    ...presentationSubSection('Other Invited Presentations', sections.invitedPresentations),

    dividerLine(),
    heading2('(f) Most Significant Contributions to Promoting Diversity', { underline: true }),
    ...listOrNone(sections.diversityContributions),

    dividerLine(),
    heading2('(g) Other Activities', { underline: true }),
    ...listOrNone([
      ...sections.outreach,
      ...sections.clinicalActivities,
      ...sections.otherActivities,
    ]),

    dividerLine(),
    heading2('(h) Student Instructional Activities', { underline: true }),
    ...studentInstructionalSection(
      sections.studentInstructionalGroups,
      sections.studentInstructionalActivities,
      sections.teaching,
    ),

    dividerLine(),
    heading2('(i) External Reviews of Primary Creative Work', { underline: true }),
    ...listOrNone(sections.externalReviews, 'None submitted with file.'),
  ];

  // ── Section III ────────────────────────────────────────────────────────────
  const sectionIII = [
    heading1('Section III – Bibliography'),

    heading2('A. Primary Published Work or Creative Work:'),
    ...publicationSubSection('I. Refereed Journal Articles', sections.peerReviewedJournals, richTextParagraphs),
    ...publicationSubSection('II. Review and Invited Articles', sections.reviewAndInvited, richTextParagraphs),

    heading3('III. Books and Book Chapters'),
    ...publicationSubSection('a. Books', sections.books, richTextParagraphs),
    ...publicationSubSection('b. Book Chapters', sections.chapters, richTextParagraphs),
    ...publicationSubSection('IV. Refereed Conference Proceedings', sections.refereedProceedings, richTextParagraphs),
    ...publicationSubSection('V. Other Articles', sections.otherArticles, richTextParagraphs),

    heading2('B. Other Work'),
    ...publicationSubSection('I. Other Conference Proceedings', sections.otherProceedings, richTextParagraphs),
    ...publicationSubSection('II. Abstracts', sections.abstracts, richTextParagraphs),
    ...publicationSubSection('III. Popular Works', sections.popularWorks, richTextParagraphs),
    ...additionalProductsSection(sections.additionalProducts, sections.theses, sections.patents, metadata.name, richTextParagraphs),
    ...workInProgressSection(sections.workInProgress, richTextParagraphs),
  ];

  const doc = new Document({
    title: metadata.name
      ? `UCSD Academic Biography/Bibliography Form - ${metadata.name}`
      : 'UCSD Academic Biography/Bibliography Form',
    subject: 'UC San Diego Academic Biography/Bibliography',
    creator: 'BioBib Formatter',
    description: 'Generated UCSD Academic Biography/Bibliography draft.',
    keywords: 'UC San Diego, BioBib, academic biography, bibliography',
    styles: {
      default: {
        document: {
          run: {
            font: FONT_NAME,
            language: { value: 'en-US' },
          },
        },
      },
    },
    sections: [{
      children: [
        ...titleBlock,
        ...sectionI,
        ...sectionII,
        ...sectionIII,
      ],
    }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
