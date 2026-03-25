// Core types for Dissertation Formatting Agent

export type DocumentType = 'dissertation' | 'thesis';
export type DegreeType = 'doctoral' | 'masters';
export type RuleStatus = 'pass' | 'fail' | 'warning' | 'skipped' | 'auto-fixed';
export type Severity = 'critical' | 'major' | 'minor';
export type SessionStatus = 'uploading' | 'parsing' | 'validating' | 'fixing' | 'reporting' | 'complete' | 'error';

export type RuleCategory =
  | 'margins'
  | 'fonts'
  | 'pagination'
  | 'page-order'
  | 'title-page'
  | 'approval-page'
  | 'abstract'
  | 'spacing'
  | 'indentation'
  | 'figures-tables'
  | 'references'
  | 'text-formatting'
  | 'accessibility';

export interface DocumentMetadata {
  type: DocumentType;
  degreeType: DegreeType;
  fileName: string;
  fileSize: number;
}

export interface MarginInfo {
  top: number;    // in twips (1440 = 1")
  bottom: number;
  left: number;
  right: number;
  header: number;
  footer: number;
  sectionIndex: number;
}

export interface StyleInfo {
  fonts: string[];
  sizes: number[];  // in half-points
  colors: string[];
  hasColoredText: boolean;
  dominantFont: string;
  dominantSize: number;
}

export interface ParagraphInfo {
  index: number;
  text: string;
  style: string;
  fontSize?: number;    // half-points
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  lineSpacing?: number; // twips
  spaceBefore?: number;
  spaceAfter?: number;
  indentLeft?: number;  // twips
  indentRight?: number;
  indentFirstLine?: number;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  isHeading?: boolean;
  headingLevel?: number;
  isCaption?: boolean;
  isEmpty?: boolean;
}

export interface FigureInfo {
  index: number;
  paragraphIndex: number;
  hasCaption: boolean;
  captionParagraphIndex?: number;
  captionPosition?: 'before' | 'after';
  captionText?: string;
  hasAltText?: boolean;
  altText?: string;
}

export interface TableInfo {
  index: number;
  paragraphIndex: number;
  hasCaption: boolean;
  captionParagraphIndex?: number;
  captionPosition?: 'before' | 'after';
  captionText?: string;
  hasHeaderRow?: boolean;
  isMultiPage?: boolean;
}

export interface ReferenceInfo {
  index: number;
  text: string;
  lineSpacing?: number;
  spaceAfter?: number;
  hasEtAl?: boolean;
}

export interface TitlePageInfo {
  detected: boolean;
  hasUniversityName: boolean;
  universityNameCorrect: boolean;
  hasInLine: boolean;
  hasbyLine: boolean;
  committeeDetected: boolean;
  committeeChairFirst?: boolean;
  committeeMembersAlphabetized?: boolean;
  committeeIndented?: boolean;
  committeeSingleSpaced?: boolean;
  year?: string;
  paragraphIndices: number[];
}

export interface AbstractInfo {
  detected: boolean;
  wordCount: number;
  topMargin?: number;
  paragraphIndices: number[];
}

export interface PageNumberingInfo {
  hasPrelimRoman: boolean;
  hasBodyArabic: boolean;
  romanStartsAtIii: boolean;
  arabicStartsAtOne: boolean;
  pageNumbersAtBottom: boolean;
  pageNumbersCentered: boolean;
}

export interface PageInfo {
  index: number;
  isBlank: boolean;
  sectionType?: string;
}

export interface SectionInfo {
  type: 'title' | 'copyright' | 'approval' | 'dedication' | 'epigraph' | 'toc' | 'acknowledgements' | 'vita' | 'abstract' | 'body' | 'appendix' | 'references' | 'unknown';
  startParagraphIndex: number;
  endParagraphIndex: number;
  detected: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export interface DocumentModel {
  metadata: DocumentMetadata;
  rawXml: string;
  stylesXml: string;
  numberingXml: string;
  paragraphs: ParagraphInfo[];
  margins: MarginInfo[];
  styles: StyleInfo;
  figures: FigureInfo[];
  tables: TableInfo[];
  references: ReferenceInfo[];
  titlePage: TitlePageInfo;
  abstract: AbstractInfo;
  pageNumbering: PageNumberingInfo;
  sections: SectionInfo[];
  pages: PageInfo[];
}

export interface RuleResult {
  ruleId: string;
  category: RuleCategory;
  name: string;
  status: RuleStatus;
  message: string;
  details?: string;
  autoFixable: boolean;
  severity: Severity;
  manualFixInstruction?: string;
}

export interface ChangeRecord {
  ruleId: string;
  description: string;
  location: string;
  before: string;
  after: string;
}

export interface ValidationResults {
  sessionId: string;
  metadata: DocumentMetadata;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warned: number;
    autoFixed: number;
    skipped: number;
    overallStatus: 'pass' | 'needs-attention' | 'fail';
  };
  rules: RuleResult[];
  changes: ChangeRecord[];
  manualFixes: ManualFix[];
}

export interface ManualFix {
  ruleId: string;
  severity: Severity;
  title: string;
  instruction: string;
  location?: string;
}

export interface FormattingRule {
  id: string;
  category: RuleCategory;
  name: string;
  description: string;
  severity: Severity;
  autoFixable: boolean;
  appliesTo: 'all' | 'dissertation' | 'thesis';
  check: (doc: DocumentModel) => RuleResult;
  fix?: (docBuffer: Buffer, doc: DocumentModel, changes: ChangeRecord[]) => Buffer;
}

export interface ProcessingSession {
  id: string;
  createdAt: number;
  status: SessionStatus;
  stage: string;
  progress: number;
  metadata: DocumentMetadata;
  originalBuffer: Buffer;
  correctedBuffer?: Buffer;
  documentModel?: DocumentModel;
  results?: ValidationResults;
  error?: string;
}
