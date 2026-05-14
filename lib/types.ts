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
  category:
    | 'departmental'
    | 'college'
    | 'campus'
    | 'university'
    | 'senate'
    | 'systemwide'
    | 'other';
}

export interface PublicationEntry {
  number: number;
  citation: string; // Preserve original format from CV
  type: 'journal' | 'review' | 'book' | 'chapter' | 'proceedings' | 'abstract' | 'popular' | 'other';
  articleKind?: 'research' | 'review' | 'creative' | 'other';
  bioBibSection?: string;
  originalNumber?: string;
  isNewSinceLastReview?: boolean;
  previouslyListedAs?: string;
  contributionNote?: string;
  reviewMaterialUrl?: string;
}

export interface GrantEntry {
  title: string;
  funder: string;
  amount?: string;
  totalAward?: string;
  period: string;
  status: 'current' | 'past';
  role?: string;
  coPIsShare?: string;
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
  memberships: string[];
  awards: string[];
  teaching: string[];
  studentInstructionalActivities: string[];
  grants: GrantEntry[];
  externalProfessionalActivities: string[];
  consulting: string[];
  reviewerActivities: string[];
  presentations: string[];
  invitedPresentations: string[];
  diversityContributions: string[];
  outreach: string[];
  clinicalActivities: string[];
  otherActivities: string[];
  externalReviews: string[];

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
  theses: PublicationEntry[];
  patents: PublicationEntry[];
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
