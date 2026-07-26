import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import JSZip from 'jszip';
import { ConversionResult } from '../types';

export const BIOBIB_SNAPSHOT_PROPERTY = 'BioBibConversionResultV1';
export const BIOBIB_SNAPSHOT_PLACEHOLDER = 'BIOBIB_SNAPSHOT_PENDING';

export interface BioBibSnapshot {
  result: ConversionResult;
  sinceYear?: number;
  documentHash: string;
}

const SNAPSHOT_PREFIX = 'biobib-v1:gzip-base64:';
const MAX_COMPRESSED_BYTES = 3 * 1024 * 1024;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_ENCODED_CHARS =
  SNAPSHOT_PREFIX.length + Math.ceil(MAX_COMPRESSED_BYTES * 4 / 3) + 4;

const SERVICE_CATEGORIES = new Set([
  'departmental',
  'college',
  'campus',
  'university',
  'senate',
  'systemwide',
  'other',
]);
const PUBLICATION_TYPES = new Set([
  'journal',
  'review',
  'book',
  'chapter',
  'proceedings',
  'abstract',
  'popular',
  'other',
]);
const ARTICLE_KINDS = new Set(['research', 'review', 'creative', 'other']);
const GAP_SEVERITIES = new Set(['required', 'recommended', 'optional']);

const STRING_ARRAY_KEYS = [
  'publicService',
  'professionalActivities',
  'memberships',
  'awards',
  'teaching',
  'studentInstructionalActivities',
  'externalProfessionalActivities',
  'consulting',
  'reviewerActivities',
  'presentations',
  'invitedPresentations',
  'diversityContributions',
  'outreach',
  'clinicalActivities',
  'otherActivities',
  'externalReviews',
] as const;

const PUBLICATION_ARRAY_KEYS = [
  'peerReviewedJournals',
  'reviewAndInvited',
  'books',
  'chapters',
  'refereedProceedings',
  'otherArticles',
  'otherProceedings',
  'abstracts',
  'popularWorks',
  'additionalProducts',
  'theses',
  'patents',
  'workInProgress',
] as const;

/**
 * Generated BioBibs carry their already-reviewed structured result in a
 * standard DOCX custom property. Compressing the JSON keeps even very large
 * CVs comfortably below ordinary Word-package limits.
 */
export function encodeBioBibSnapshot(
  result: ConversionResult,
  options: { sinceYear?: number; documentHash: string },
): string {
  const json = Buffer.from(JSON.stringify({
    version: 1,
    result,
    documentHash: options.documentHash,
    ...(options.sinceYear ? { sinceYear: options.sinceYear } : {}),
  }), 'utf8');
  if (json.length > MAX_JSON_BYTES) {
    throw new Error('BioBib conversion result is too large to embed in the generated document.');
  }

  const compressed = gzipSync(json, { level: 9 });
  if (compressed.length > MAX_COMPRESSED_BYTES) {
    throw new Error('Compressed BioBib conversion result is too large to embed.');
  }

  return `${SNAPSHOT_PREFIX}${compressed.toString('base64')}`;
}

/**
 * Returns undefined for absent, malformed, oversized, or incompatible
 * snapshots. The caller can then safely fall back to normal CV extraction.
 */
export function decodeBioBibSnapshot(value: string | undefined): BioBibSnapshot | undefined {
  if (!value?.startsWith(SNAPSHOT_PREFIX) || value.length > MAX_ENCODED_CHARS) return undefined;

  try {
    const compressed = Buffer.from(value.slice(SNAPSHOT_PREFIX.length), 'base64');
    if (compressed.length === 0 || compressed.length > MAX_COMPRESSED_BYTES) return undefined;

    const json = gunzipSync(compressed, { maxOutputLength: MAX_JSON_BYTES });
    const parsed: unknown = JSON.parse(json.toString('utf8'));
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !isConversionResult(parsed.result) ||
      typeof parsed.documentHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(parsed.documentHash) ||
      (
        parsed.sinceYear !== undefined &&
        (
          typeof parsed.sinceYear !== 'number' ||
          !Number.isInteger(parsed.sinceYear) ||
          parsed.sinceYear < 1950 ||
          parsed.sinceYear > 2200
        )
      )
    ) {
      return undefined;
    }
    return {
      result: parsed.result,
      documentHash: parsed.documentHash,
      ...(typeof parsed.sinceYear === 'number' ? { sinceYear: parsed.sinceYear } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function embedBioBibSnapshot(
  docxBuffer: Buffer,
  result: ConversionResult,
  options: { sinceYear?: number } = {},
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const customXmlFile = zip.file('docProps/custom.xml');
  if (!customXmlFile) throw new Error('Generated DOCX is missing docProps/custom.xml.');

  const customXml = await customXmlFile.async('string');
  const documentHash = await hashDocxWordParts(zip);
  const encoded = encodeBioBibSnapshot(result, {
    sinceYear: options.sinceYear,
    documentHash,
  });
  const updatedXml = replaceCustomPropertyValue(
    customXml,
    BIOBIB_SNAPSHOT_PROPERTY,
    encoded,
  );
  zip.file('docProps/custom.xml', updatedXml);

  return Buffer.from(await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  }));
}

export async function snapshotMatchesDocument(
  snapshot: BioBibSnapshot,
  zip: JSZip,
): Promise<boolean> {
  return snapshot.documentHash === await hashDocxWordParts(zip);
}

async function hashDocxWordParts(zip: JSZip): Promise<string> {
  const hash = createHash('sha256');
  const partNames = Object.keys(zip.files)
    .filter(name => name.startsWith('word/') && !zip.files[name].dir)
    .sort();

  for (const name of partNames) {
    hash.update(name, 'utf8');
    hash.update('\0');
    hash.update(await zip.file(name)!.async('nodebuffer'));
    hash.update('\0');
  }

  return hash.digest('hex');
}

function replaceCustomPropertyValue(
  customXml: string,
  propertyName: string,
  value: string,
): string {
  for (const match of customXml.matchAll(/<property\b([^>]*)>([\s\S]*?)<\/property>/g)) {
    const name = match[1].match(/\bname="([^"]*)"/)?.[1];
    if (name !== propertyName) continue;
    const updatedProperty = match[0].replace(
      /(<vt:lpwstr(?:\s[^>]*)?>)[\s\S]*?(<\/vt:lpwstr>)/,
      `$1${value}$2`,
    );
    if (updatedProperty === match[0]) {
      throw new Error(`Generated DOCX custom property "${propertyName}" has no string value.`);
    }
    return customXml.replace(match[0], updatedProperty);
  }

  throw new Error(`Generated DOCX custom property "${propertyName}" is missing.`);
}

function isConversionResult(value: unknown): value is ConversionResult {
  if (!isRecord(value) || !isRecord(value.sections) || !isRecord(value.metadata)) return false;
  if (!Array.isArray(value.gaps)) return false;
  if (value.reviewNotes !== undefined && !Array.isArray(value.reviewNotes)) return false;

  const metadata = value.metadata;
  if (
    !isString(metadata.name) ||
    !isString(metadata.department) ||
    !isString(metadata.title) ||
    !isString(metadata.processedAt) ||
    !isOptionalString(metadata.reviewPeriodStart)
  ) {
    return false;
  }

  const sections = value.sections;
  if (!isOptionalString(sections.specialization)) return false;
  if (!isArrayOf(sections.employment, isEmploymentEntry)) return false;
  if (!isArrayOf(sections.education, isEducationEntry)) return false;
  if (!isArrayOf(sections.universityService, isServiceEntry)) return false;
  if (!isArrayOf(sections.studentInstructionalGroups, isStudentInstructionalGroup)) return false;
  if (!isArrayOf(sections.grants, isGrantEntry)) return false;
  if (!STRING_ARRAY_KEYS.every(key => isArrayOf(sections[key], isString))) return false;
  if (!PUBLICATION_ARRAY_KEYS.every(key => isArrayOf(sections[key], isPublicationEntry))) return false;
  if (!isArrayOf(value.gaps, isGap)) return false;
  if (value.reviewNotes !== undefined && !isArrayOf(value.reviewNotes, isReviewNote)) return false;

  return true;
}

function isEmploymentEntry(value: unknown): boolean {
  return hasStringFields(value, ['from', 'to', 'institution', 'location', 'rank']);
}

function isEducationEntry(value: unknown): boolean {
  return hasStringFields(value, [
    'school',
    'datesFrom',
    'datesTo',
    'location',
    'major',
    'degree',
    'dateReceived',
  ]);
}

function isServiceEntry(value: unknown): boolean {
  return (
    hasStringFields(value, ['description', 'dates', 'category']) &&
    isRecord(value) &&
    SERVICE_CATEGORIES.has(value.category as string)
  );
}

function isStudentInstructionalGroup(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.heading) &&
    isArrayOf(value.entries, isString)
  );
}

function isGrantEntry(value: unknown): boolean {
  return (
    hasStringFields(value, ['title', 'funder', 'period', 'status']) &&
    isRecord(value) &&
    (value.status === 'current' || value.status === 'past') &&
    isOptionalString(value.amount) &&
    isOptionalString(value.totalAward) &&
    isOptionalString(value.role) &&
    isOptionalString(value.coPIsShare)
  );
}

function isPublicationEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.number === 'number' &&
    Number.isFinite(value.number) &&
    isString(value.citation) &&
    isString(value.type) &&
    PUBLICATION_TYPES.has(value.type) &&
    (
      value.articleKind === undefined ||
      (isString(value.articleKind) && ARTICLE_KINDS.has(value.articleKind))
    ) &&
    isOptionalString(value.bioBibSection) &&
    isOptionalString(value.originalNumber) &&
    (value.isNewSinceLastReview === undefined || typeof value.isNewSinceLastReview === 'boolean') &&
    isOptionalString(value.previouslyListedAs) &&
    isOptionalString(value.contributionNote) &&
    isOptionalString(value.reviewMaterialUrl) &&
    (value.isFacultyThesis === undefined || typeof value.isFacultyThesis === 'boolean')
  );
}

function isGap(value: unknown): boolean {
  return (
    hasStringFields(value, ['section', 'field', 'instruction', 'severity']) &&
    isRecord(value) &&
    GAP_SEVERITIES.has(value.severity as string)
  );
}

function isReviewNote(value: unknown): boolean {
  return hasStringFields(value, ['section', 'topic', 'instruction']);
}

function hasStringFields(value: unknown, keys: readonly string[]): boolean {
  return isRecord(value) && keys.every(key => isString(value[key]));
}

function isArrayOf(value: unknown, predicate: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(predicate);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
