// Approved fonts per GEPA manual
export const APPROVED_FONTS = [
  'Arial',
  'Century Gothic',
  'Helvetica',
  'Times New Roman',
];

// Font size limits (in half-points: 10pt=20, 11pt=22, 12pt=24)
export const MIN_FONT_SIZE_HP = 20; // 10pt
export const MAX_FONT_SIZE_HP = 24; // 12pt

// Measurement constants (twips: 1 inch = 1440 twips)
export const MARGIN_1_INCH = 1440;
export const MARGIN_HALF_INCH = 720;
export const MARGIN_2_5_INCH = 3600;
export const LINE_SPACING_SINGLE = 240;
export const LINE_SPACING_DOUBLE = 480;
export const INDENT_HALF_INCH = 720;

// Word count limits
export const ABSTRACT_WORD_LIMIT_DOCTORAL = 350;
export const ABSTRACT_WORD_LIMIT_MASTERS = 250;

// File limits
export const MAX_FILE_SIZE_MB = 50;

// Rule categories display names
export const CATEGORY_LABELS: Record<string, string> = {
  margins: 'Margins',
  fonts: 'Fonts & Typography',
  pagination: 'Pagination',
  'page-order': 'Page Order',
  'title-page': 'Title Page',
  'approval-page': 'Approval Page',
  abstract: 'Abstract',
  spacing: 'Spacing',
  indentation: 'Indentation',
  'figures-tables': 'Figures & Tables',
  references: 'References',
  'text-formatting': 'Text Formatting',
  accessibility: 'Accessibility',
};
