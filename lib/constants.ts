export const APP_NAME = 'BioBib Formatter';
export const APP_DESCRIPTION = 'Convert your faculty CV to UCSD BioBib format automatically.';
export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const ACCEPTED_FILE_TYPES = ['.docx'];
export const ACCEPTED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// TritonAI LiteLLM Gateway
export const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'https://tritonai-api.ucsd.edu';
export const LITELLM_MODEL = process.env.LITELLM_MODEL || 'claude-sonnet-4-6';

// Session TTL for download tokens (15 minutes)
export const DOWNLOAD_TOKEN_TTL_SECONDS = 15 * 60;

export const BIOBIB_SECTIONS = {
  SECTION_I_EMPLOYMENT: 'Section I — Employment History',
  SECTION_I_EDUCATION: 'Section I — Education',
  SECTION_II_UNIVERSITY_SERVICE: 'Section II — University Service',
  SECTION_II_PUBLIC_SERVICE: 'Section II — Public Service',
  SECTION_II_PROFESSIONAL: 'Section II — Professional Activities',
  SECTION_II_AWARDS: 'Section II — Awards and Honors',
  SECTION_II_TEACHING: 'Section II — Teaching',
  SECTION_II_GRANTS: 'Section II — Research Support',
  SECTION_II_OUTREACH: 'Section II — Outreach / Public Engagement',
  SECTION_II_CLINICAL: 'Section II — Clinical Activities',
  SECTION_II_OTHER: 'Section II — Other Activities',
  SECTION_III_A_JOURNALS: 'Section III-A — Refereed Journal Articles',
  SECTION_III_A_REVIEWS: 'Section III-A — Review and Invited Articles',
  SECTION_III_A_BOOKS: 'Section III-A — Books',
  SECTION_III_A_CHAPTERS: 'Section III-A — Book Chapters',
  SECTION_III_A_PROCEEDINGS: 'Section III-A — Refereed Conference Proceedings',
  SECTION_III_B_OTHER_PROCEEDINGS: 'Section III-B — Other Conference Proceedings',
  SECTION_III_B_ABSTRACTS: 'Section III-B — Abstracts',
  SECTION_III_B_POPULAR: 'Section III-B — Popular Works',
  SECTION_III_B_PRODUCTS: 'Section III-B — Additional Products',
  SECTION_III_C_IN_PROGRESS: 'Section III-C — Work in Progress',
} as const;
