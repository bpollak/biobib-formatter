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

function tableCell(text: string, options?: { bold?: boolean; shaded?: boolean; width?: number }): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: options?.bold, size: 18 })] })],
    shading: options?.shaded ? { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY } : undefined,
    width: options?.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
  });
}

function publicationList(entries: PublicationEntry[]): Paragraph[] {
  if (entries.length === 0) return [];
  return entries.flatMap(e => {
    const prefix = e.isNewSinceLastReview ? `*${e.number}. ` : `${e.number}. `;
    const notes = [
      e.articleKind ? e.articleKind.toUpperCase() + ' ARTICLE' : '',
      e.previouslyListedAs ? `previously ${e.previouslyListedAs}` : '',
      e.bioBibSection ? `BioBib section: ${e.bioBibSection}` : '',
      e.originalNumber ? `source no. ${e.originalNumber}` : '',
      e.reviewMaterialUrl ? `review material: ${e.reviewMaterialUrl}` : '',
    ].filter(Boolean).join('; ');

    const paragraphs = [
      new Paragraph({
        children: [
          new TextRun({ text: prefix, bold: true, size: 20 }),
          new TextRun({ text: e.citation, size: 20 }),
        ],
        spacing: { after: e.contributionNote || notes ? 30 : 80 },
      }),
    ];

    if (notes) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: notes, italics: true, size: 18 })],
        spacing: { after: e.contributionNote ? 30 : 80 },
      }));
    }

    if (e.contributionNote) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: e.contributionNote, italics: true, size: 18 })],
        spacing: { after: 80 },
      }));
    }

    return paragraphs;
  });
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
  return stringList(items.map(s => `${s.description}${s.dates ? ` (${s.dates})` : ''}`));
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
): Paragraph[] {
  const children = [
    heading3('IV. Additional Products of Major Research'),
    ...publicationSubSection('a. Theses', theses),
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

function workInProgressSection(entries: PublicationEntry[]): Paragraph[] {
  return [
    heading2('WORK IN PROGRESS'),
    ...(entries.length > 0
      ? publicationList(entries)
      : [manualPlaceholder('Include only work-in-progress material being submitted for review, if applicable.')]),
  ];
}

export async function generateBioBibDocx(result: ConversionResult): Promise<Buffer> {
  const { sections, metadata } = result;

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
    ...subSection('Presentations at National and International Meetings', sections.presentations),
    ...subSection('Other Invited Presentations', sections.invitedPresentations),

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
    ...additionalProductsSection(sections.additionalProducts, sections.theses, sections.patents),
    ...workInProgressSection(sections.workInProgress),
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
