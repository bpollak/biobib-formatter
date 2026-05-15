/**
 * BioBib Document Writer
 * Generates a UCSD BioBib .docx from a ConversionResult.
 */

import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, HeadingLevel, AlignmentType,
  Packer, ShadingType
} from 'docx';
import { ConversionResult, EmploymentEntry, EducationEntry, PublicationEntry, GrantEntry } from '../types';

const UCSD_BLUE = '003B5C';
const LIGHT_GRAY = 'F2F2F2';

function heading1(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    thematicBreak: false,
    spacing: { before: 240, after: 120 },
  });
}

function heading2(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 22 })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
  });
}

function heading3(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, italics: true, size: 20 })],
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 160, after: 60 },
  });
}

function body(text: string, options?: { bold?: boolean; italic?: boolean }): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: options?.bold, italics: options?.italic, size: 20 })],
    spacing: { after: 60 },
  });
}

function manualPlaceholder(instruction: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
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
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Period', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 20, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Institution / Organization', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 35, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Location', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 20, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Rank / Title', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 25, type: WidthType.PERCENTAGE } }),
    ],
    tableHeader: true,
  });

  const dataRows = entries.map(e => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: displayCellValue(formatPeriod(e.from, e.to)), size: 18 })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: displayCellValue(e.institution), size: 18 })] })], width: { size: 35, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: displayCellValue(e.location), size: 18 })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: displayCellValue(e.rank), size: 18 })] })], width: { size: 25, type: WidthType.PERCENTAGE } }),
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
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'School', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 28, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Dates', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 15, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Location', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 18, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Major', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 17, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Degree', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 10, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Date Received', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 12, type: WidthType.PERCENTAGE } }),
    ],
    tableHeader: true,
  });

  const dataRows = entries.map(e => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: displayCellValue(e.school), size: 18 })] })], width: { size: 28, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: displayCellValue(formatPeriod(e.datesFrom, e.datesTo)), size: 18 })] })], width: { size: 15, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: displayCellValue(e.location), size: 18 })] })], width: { size: 18, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: displayCellValue(e.major), size: 18 })] })], width: { size: 17, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: displayCellValue(cleanDegree(e.degree, e.dateReceived)), size: 18 })] })], width: { size: 10, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: displayCellValue(e.dateReceived), size: 18 })] })], width: { size: 12, type: WidthType.PERCENTAGE } }),
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
    children: [new Paragraph({ children: [new TextRun({ text: options?.bold ? text : displayCellValue(text, options?.fallback), bold: options?.bold, size: 18 })] })],
    shading: options?.shaded ? { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY } : undefined,
    width: options?.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
  });
}

function publicationList(entries: PublicationEntry[]): Paragraph[] {
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
          new TextRun({ text: prefix, bold: true, size: 20 }),
          new TextRun({ text: e.citation, size: 20 }),
        ],
        spacing: { after: contributionNote || notes ? 30 : 80 },
      }),
    ];

    if (notes) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: notes, italics: true, size: 18 })],
        spacing: { after: contributionNote ? 30 : 80 },
      }));
    }

    if (contributionNote) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: contributionNote, italics: true, size: 18 })],
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

function sentenceCaseAllCaps(value: string): string {
  const letters = value.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4 || letters !== letters.toUpperCase()) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function stringList(items: string[]): Paragraph[] {
  return items.map(item => new Paragraph({
    children: [new TextRun({ text: item, size: 20 })],
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
    ...listOrNone(cleaned, noneText),
  ];
}

function publicationSubSection(heading: string, entries: PublicationEntry[]): Paragraph[] {
  return [
    heading3(heading),
    ...(entries.length > 0 ? publicationList(entries) : [body('None.')]),
  ];
}

function additionalProductsSection(
  additionalProducts: PublicationEntry[],
  theses: PublicationEntry[],
  patents: PublicationEntry[],
  facultyName: string,
): Paragraph[] {
  const ownTheses = filterOwnTheses(theses, facultyName);
  const children = [
    heading3('IV. Additional Products of Major Research'),
    ...publicationSubSection('a. Theses', ownTheses),
    ...publicationSubSection('b. Patent / Patent License', patents),
  ];

  if (additionalProducts.length > 0) {
    children.push(
      heading3('c. Other Products'),
      ...publicationList(additionalProducts),
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

function workInProgressSection(entries: PublicationEntry[]): Paragraph[] {
  return [
    heading2('WORK IN PROGRESS'),
    ...(entries.length > 0
      ? publicationList(entries)
      : [body('None submitted with file.')]),
  ];
}

export async function generateBioBibDocx(result: ConversionResult): Promise<Buffer> {
  const { sections, metadata } = result;

  // ── Document title block ───────────────────────────────────────────────────
  const titleBlock = [
    new Paragraph({
      children: [new TextRun({ text: 'UCSD ACADEMIC BIOGRAPHY/BIBLIOGRAPHY FORM', bold: true, size: 28, color: UCSD_BLUE })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Name: ', bold: true, size: 22 }),
        new TextRun({ text: metadata.name || '________________', size: 22 }),
        new TextRun({ text: '     Department: ', bold: true, size: 22 }),
        new TextRun({ text: metadata.department || '________________', size: 22 }),
      ],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Title: ', bold: true, size: 22 }),
        new TextRun({ text: metadata.title || '________________', size: 22 }),
      ],
      spacing: { after: 200 },
    }),
  ];

  // ── Section I ──────────────────────────────────────────────────────────────
  const sectionI = [
    heading1('Section I: Employment History and Education'),

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
    heading1('Section II: Professional Data'),

    heading2('(a) University Service'),
    heading3('Departmental Service'),
    ...(departmentalService.length > 0 ? serviceList(departmentalService) : [body('None.')]),
    heading3('University, Campus, Academic Senate, and Systemwide Service'),
    ...(nonDepartmentalService.length > 0 ? serviceList(nonDepartmentalService) : [body('None.')]),
    ...(sections.publicService.length > 0 ? [heading3('Public Service'), ...stringList(sections.publicService)] : []),

    dividerLine(),
    heading2('(b) Memberships'),
    ...listOrNone(sections.memberships),

    dividerLine(),
    heading2('(c) Honors and Awards'),
    ...(sections.awards.length > 0 ? stringList(sections.awards) : [manualPlaceholder('List awards and honors with dates received.')]),

    dividerLine(),
    heading2('(d) Contracts and Grants'),
    heading3('Current Research Support'),
    ...grantsOrNone(currentGrants),
    heading3('Past Research Support'),
    ...grantsOrNone(pastGrants),

    dividerLine(),
    heading2('(e) External Professional Activities'),
    ...subSection('Professional Committee Service and Conference Organization', [
      ...sections.professionalActivities,
      ...sections.externalProfessionalActivities,
    ]),
    ...subSection('Consulting', sections.consulting),
    ...subSection('Reviewer for External Academic Files, Funding Agencies, and Journals', sections.reviewerActivities),
    ...presentationSubSection('Presentations at National and International Meetings', sections.presentations),
    ...presentationSubSection('Other Invited Presentations', sections.invitedPresentations),

    dividerLine(),
    heading2('(f) Most Significant Contributions to Promoting Diversity'),
    ...listOrNone(sections.diversityContributions),

    dividerLine(),
    heading2('(g) Other Activities'),
    ...listOrNone([
      ...sections.outreach,
      ...sections.clinicalActivities,
      ...sections.otherActivities,
    ]),

    dividerLine(),
    heading2('(h) Student Instructional Activities'),
    ...(sections.studentInstructionalActivities.length > 0
      ? stringList(sections.studentInstructionalActivities)
      : sections.teaching.length > 0
        ? stringList(sections.teaching)
        : [manualPlaceholder('List courses taught, students supervised, postdoctoral researchers mentored, undergraduate research students, and visiting scholars/students.')]),

    dividerLine(),
    heading2('External Reviews of Primary Creative Work'),
    ...listOrNone(sections.externalReviews, 'None submitted with file.'),
  ];

  // ── Section III ────────────────────────────────────────────────────────────
  const sectionIII = [
    heading1('Section III: Bibliography'),

    heading2('PRIMARY PUBLISHED OR CREATIVE WORK'),
    heading2('A. PRIMARY PUBLISHED WORK'),
    heading3('I. Original Peer Reviewed Work'),
    ...publicationSubSection('a. Refereed Journal Articles', sections.peerReviewedJournals),
    ...publicationSubSection('b. Review and Invited Articles', sections.reviewAndInvited),

    heading3('II. Books and Book Chapters'),
    ...publicationSubSection('a. Books', sections.books),
    ...publicationSubSection('b. Book Chapters', sections.chapters),
    ...publicationSubSection('III. Refereed Conference Proceedings', sections.refereedProceedings),

    heading2('OTHER WORK'),
    ...publicationSubSection('I. Other Conference Proceedings', sections.otherProceedings),
    ...publicationSubSection('II. Abstracts of Non-Refereed Conference Proceedings', sections.abstracts),
    ...publicationSubSection('III. Popular Works', sections.popularWorks),
    ...additionalProductsSection(sections.additionalProducts, sections.theses, sections.patents, metadata.name),
    ...workInProgressSection(sections.workInProgress),
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
