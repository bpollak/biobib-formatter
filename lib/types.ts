// BioBib Formatter — Core Types

export interface ProcessingSession {
  id: string;
  fileName: string;
  status: 'parsing' | 'converting' | 'generating' | 'complete' | 'error';
  error?: string;
}

// ── CV Parsing ──────────────────────────────────────────────────────────────

export interface ParsedCV {
  rawText: string;
  name?: string;
  department?: string;
  title?: string;
}

// ── AI Conversion Output ─────────────────────────────────────────────────────

export interface EmploymentEntry {
  from: string;
  to: string;
  institution: string;
  location: string;
  rank: string;
}

export interface EducationEntry {
  school: string;
  datesFrom: string;
  datesTo: string;
  location: string;
  major: string;
  degree: string;
  dateReceived: string;
}

export interface ServiceEntry {
  description: string;
  dates: string;
  category: 'departmental' | 'university' | 'senate' | 'systemwide' | 'other';
}

export interface PublicationEntry {
  number: number;
  citation: string; // Preserve original format from CV
  type: 'journal' | 'review' | 'book' | 'chapter' | 'proceedings' | 'abstract' | 'popular' | 'other';
  isNewSinceLastReview?: boolean;
}

export interface GrantEntry {
  title: string;
  funder: string;
  amount?: string;
  period: string;
  status: 'current' | 'past';
  role?: string;
}

export interface BioBibSections {
  // Section I
  employment: EmploymentEntry[];
  education: EducationEntry[];
  specialization?: string;

  // Section II
  universityService: ServiceEntry[];
  publicService: string[];
  professionalActivities: string[];
  awards: string[];
  teaching: string[];
  grants: GrantEntry[];
  outreach: string[];
  clinicalActivities: string[];
  otherActivities: string[];

  // Section III
  peerReviewedJournals: PublicationEntry[];
  reviewAndInvited: PublicationEntry[];
  books: PublicationEntry[];
  chapters: PublicationEntry[];
  refereedProceedings: PublicationEntry[];
  otherProceedings: PublicationEntry[];
  abstracts: PublicationEntry[];
  popularWorks: PublicationEntry[];
  additionalProducts: PublicationEntry[];
  workInProgress: PublicationEntry[];
}

// ── Gap Detection ────────────────────────────────────────────────────────────

export type GapSeverity = 'required' | 'recommended' | 'optional';

export interface BioBibGap {
  section: string;
  field: string;
  instruction: string;
  severity: GapSeverity;
}

// ── Full Conversion Result ───────────────────────────────────────────────────

export interface ConversionResult {
  sections: BioBibSections;
  gaps: BioBibGap[];
  metadata: {
    name: string;
    department: string;
    title: string;
    processedAt: string;
  };
}

// ── API Response Shapes ──────────────────────────────────────────────────────

export interface UploadResponse {
  sessionId: string;
  result: ConversionResult;
}

export interface DownloadTokenPayload {
  sessionId: string;
  kind: 'document' | 'report';
  iat: number;
  exp: number;
}
