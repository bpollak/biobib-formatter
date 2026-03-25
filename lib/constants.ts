// UCSD Brand Colors
export const UCSD_COLORS = {
  navy: '#182B49',
  gold: '#C69214',
  lightGold: '#FFCD00',
  blue: '#006A96',
  cyan: '#00629B',
  white: '#FFFFFF',
  lightGray: '#F5F5F5',
  medGray: '#E5E5E5',
  darkGray: '#747678',
  success: '#2E7D32',
  error: '#C62828',
  warning: '#E65100',
  info: '#01579B',
};

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
export const DEFAULT_FONT_SIZE_HP = 24; // 12pt
export const DEFAULT_FONT = 'Times New Roman';

// Measurement constants (twips: 1 inch = 1440 twips)
export const TWIPS_PER_INCH = 1440;
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
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
export const ALLOWED_EXTENSIONS = ['.docx'];

// Session TTL
export const SESSION_TTL_MS = 3600000; // 1 hour
export const SESSION_CLEANUP_INTERVAL_MS = 60000; // 1 minute

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
