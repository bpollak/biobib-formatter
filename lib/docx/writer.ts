/**
 * BioBib Document Writer
 * Generates a UCSD BioBib .docx from a ConversionResult.
 */

import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  BorderStyle, WidthType, HeadingLevel, AlignmentType,
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
    spacing: { before: 200, after: 80 },
  });
}

function heading3(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, italics: true, size: 20 })],
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
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${e.from} – ${e.to}`, size: 18 })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: e.institution, size: 18 })] })], width: { size: 35, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: e.location, size: 18 })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: e.rank, size: 18 })] })], width: { size: 25, type: WidthType.PERCENTAGE } }),
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
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'School', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 30, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Dates', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 15, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Location', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 20, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Major', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 20, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Degree', bold: true, size: 18 })] })], shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY }, width: { size: 15, type: WidthType.PERCENTAGE } }),
    ],
    tableHeader: true,
  });

  const dataRows = entries.map(e => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: e.school, size: 18 })] })], width: { size: 30, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${e.datesFrom} – ${e.datesTo}`, size: 18 })] })], width: { size: 15, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: e.location, size: 18 })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: e.major, size: 18 })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${e.degree} (${e.dateReceived})`, size: 18 })] })], width: { size: 15, type: WidthType.PERCENTAGE } }),
    ],
  }));

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function publicationList(entries: PublicationEntry[]): Paragraph[] {
  if (entries.length === 0) return [];
  return entries.map(e =>
    new Paragraph({
      children: [
        new TextRun({ text: `${e.number}. `, bold: true, size: 20 }),
        new TextRun({ text: e.citation, size: 20 }),
      ],
      spacing: { after: 80 },
    })
  );
}

function stringList(items: string[]): Paragraph[] {
  return items.map(item => new Paragraph({
    children: [new TextRun({ text: item, size: 20 })],
    spacing: { after: 60 },
  }));
}

function grantList(grants: GrantEntry[]): Paragraph[] {
  return grants.map((g, i) => new Paragraph({
    children: [
      new TextRun({ text: `${i + 1}. `, bold: true, size: 20 }),
      new TextRun({ text: `${g.title}. ${g.funder}${g.amount ? `, ${g.amount}` : ''}. ${g.period}.${g.role ? ` (${g.role})` : ''}`, size: 20 }),
    ],
    spacing: { after: 80 },
  }));
}

export async function generateBioBibDocx(result: ConversionResult): Promise<Buffer> {
  const { sections, gaps, metadata } = result;

  // Build gap map for quick lookup
  const gapMap = new Map(gaps.map(g => [`${g.section}::${g.field}`, g]));

  const getGapPlaceholder = (sectionKey: string, field: string): Paragraph | null => {
    const gap = gapMap.get(`${sectionKey}::${field}`);
    return gap ? manualPlaceholder(gap.instruction) : null;
  };

  // ── Document title block ───────────────────────────────────────────────────
  const titleBlock = [
    new Paragraph({
      children: [new TextRun({ text: 'UCSD ACADEMIC BIOGRAPHY / BIBLIOGRAPHY FORM', bold: true, size: 28, color: UCSD_BLUE })],
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
  const sII = 'Section II — University Service';

  const sectionII = [
    heading1('Section II: Professional Data'),

    heading2('University Service'),
    heading3('Departmental Service:'),
    ...stringList(sections.universityService.filter(s => s.category === 'departmental').map(s => `${s.description}${s.dates ? ` (${s.dates})` : ''}`)),
    heading3('University Service:'),
    ...stringList(sections.universityService.filter(s => s.category !== 'departmental').map(s => `${s.description}${s.dates ? ` (${s.dates})` : ''}`)),
    ...(sections.universityService.length === 0 ? [manualPlaceholder('List all departmental, college, Academic Senate, campus, and systemwide service with dates.')] : []),

    dividerLine(),
    heading2('Public Service'),
    ...(sections.publicService.length > 0 ? stringList(sections.publicService) : [body('None.')]),

    dividerLine(),
    heading2('Professional Activities'),
    ...(sections.professionalActivities.length > 0 ? stringList(sections.professionalActivities) : [body('None.')]),

    dividerLine(),
    heading2('Awards and Honors'),
    ...(sections.awards.length > 0 ? stringList(sections.awards) : [manualPlaceholder('List awards and honors with dates received.')]),

    dividerLine(),
    heading2('Teaching'),
    ...(sections.teaching.length > 0 ? stringList(sections.teaching) : [manualPlaceholder('List courses taught, graduate students supervised (name, degree, year), and postdoctoral researchers mentored.')]),

    dividerLine(),
    heading2('Research Support'),
    heading3('Current Research Support:'),
    ...grantList(sections.grants.filter(g => g.status === 'current')),
    ...(sections.grants.filter(g => g.status === 'current').length === 0 ? [body('None.')] : []),
    heading3('Past Research Support:'),
    ...grantList(sections.grants.filter(g => g.status === 'past')),
    ...(sections.grants.filter(g => g.status === 'past').length === 0 ? [body('None.')] : []),

    dividerLine(),
    heading2('Outreach / Public Engagement'),
    ...(sections.outreach.length > 0 ? stringList(sections.outreach) : [body('None.')]),

    dividerLine(),
    heading2('Clinical Activities'),
    ...(sections.clinicalActivities.length > 0 ? stringList(sections.clinicalActivities) : [body('None.')]),

    dividerLine(),
    heading2('Other Activities'),
    ...(sections.otherActivities.length > 0 ? stringList(sections.otherActivities) : [body('None.')]),
  ];

  // ── Section III ────────────────────────────────────────────────────────────
  const sectionIII = [
    heading1('Section III: Bibliography'),

    heading2('A. Primary Published or Creative Work'),
    heading3('I. Original Peer-Reviewed Work'),
    heading3('a. Refereed Journal Articles'),
    ...(sections.peerReviewedJournals.length > 0 ? publicationList(sections.peerReviewedJournals) : [body('None.')]),

    heading3('b. Review and Invited Articles'),
    ...(sections.reviewAndInvited.length > 0 ? publicationList(sections.reviewAndInvited) : [body('None.')]),

    heading3('c. Books'),
    ...(sections.books.length > 0 ? publicationList(sections.books) : [body('None.')]),

    heading3('d. Book Chapters'),
    ...(sections.chapters.length > 0 ? publicationList(sections.chapters) : [body('None.')]),

    heading3('e. Refereed Conference Proceedings'),
    ...(sections.refereedProceedings.length > 0 ? publicationList(sections.refereedProceedings) : [body('None.')]),

    heading2('B. Other Work'),
    heading3('Other Conference Proceedings'),
    ...(sections.otherProceedings.length > 0 ? publicationList(sections.otherProceedings) : [body('None.')]),

    heading3('Abstracts'),
    ...(sections.abstracts.length > 0 ? publicationList(sections.abstracts) : [body('None.')]),

    heading3('Popular Works'),
    ...(sections.popularWorks.length > 0 ? publicationList(sections.popularWorks) : [body('None.')]),

    heading3('Additional Products of Major Research (patents, software, datasets)'),
    ...(sections.additionalProducts.length > 0 ? publicationList(sections.additionalProducts) : [body('None.')]),

    heading2('C. Work in Progress'),
    manualPlaceholder('Work in Progress cannot be auto-filled. Include only items for which you will submit actual material (chapters, documentation). This section is optional for most reviews.'),
  ];

  const doc = new Document({
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
