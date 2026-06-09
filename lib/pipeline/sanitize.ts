/**
 * Defensive sanitization of AI slice output.
 *
 * Slice responses are JSON.parsed model output; a single missing or
 * mistyped field (e.g. a publication without a citation) must degrade to
 * a dropped entry, not crash finalize and discard every completed slice.
 */

import {
  BioBibGap,
  BioBibReviewNote,
  BioBibSections,
  EducationEntry,
  EmploymentEntry,
  GrantEntry,
  PublicationEntry,
  ServiceEntry,
  StudentInstructionalGroup,
} from '../types';
import type { PartialResult } from './converter';

const STRING_LIST_KEYS = [
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

const PUBLICATION_KEYS = [
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

const PUBLICATION_TYPES = new Set<PublicationEntry['type']>([
  'journal', 'review', 'book', 'chapter', 'proceedings', 'abstract', 'popular', 'other',
]);
const SERVICE_CATEGORIES = new Set<ServiceEntry['category']>([
  'departmental', 'college', 'campus', 'university', 'senate', 'systemwide', 'other',
]);
const GAP_SEVERITIES = new Set<BioBibGap['severity']>(['required', 'recommended', 'optional']);

export function sanitizePartialResult(raw: unknown): PartialResult {
  if (!isRecord(raw)) {
    throw new Error('AI response is not a JSON object');
  }

  const out: PartialResult = { sections: {} };

  if (isRecord(raw.metadata)) {
    out.metadata = {
      name: asString(raw.metadata.name),
      department: asString(raw.metadata.department),
      title: asString(raw.metadata.title),
      processedAt: new Date().toISOString(),
    };
  }

  out.gaps = asArray(raw.gaps).flatMap(item => {
    if (!isRecord(item)) return [];
    const gap: BioBibGap = {
      section: asString(item.section),
      field: asString(item.field),
      instruction: asString(item.instruction),
      severity: GAP_SEVERITIES.has(item.severity as BioBibGap['severity'])
        ? (item.severity as BioBibGap['severity'])
        : 'optional',
    };
    return gap.section || gap.field || gap.instruction ? [gap] : [];
  });

  out.reviewNotes = asArray(raw.reviewNotes).flatMap(item => {
    if (!isRecord(item)) return [];
    const note: BioBibReviewNote = {
      section: asString(item.section),
      topic: asString(item.topic),
      instruction: asString(item.instruction),
    };
    return note.instruction ? [note] : [];
  });

  if (!isRecord(raw.sections)) return out;
  const sections = raw.sections;
  const cleaned: Partial<BioBibSections> = {};

  if (sections.specialization !== undefined) {
    cleaned.specialization = asString(sections.specialization);
  }
  for (const key of STRING_LIST_KEYS) {
    if (sections[key] !== undefined) cleaned[key] = asStringList(sections[key]);
  }
  for (const key of PUBLICATION_KEYS) {
    if (sections[key] !== undefined) cleaned[key] = sanitizePublications(sections[key]);
  }
  if (sections.employment !== undefined) cleaned.employment = sanitizeEmployment(sections.employment);
  if (sections.education !== undefined) cleaned.education = sanitizeEducation(sections.education);
  if (sections.universityService !== undefined) cleaned.universityService = sanitizeService(sections.universityService);
  if (sections.grants !== undefined) cleaned.grants = sanitizeGrants(sections.grants);
  if (sections.studentInstructionalGroups !== undefined) {
    cleaned.studentInstructionalGroups = sanitizeStudentGroups(sections.studentInstructionalGroups);
  }

  out.sections = cleaned;
  return out;
}

function sanitizePublications(value: unknown): PublicationEntry[] {
  return asArray(value).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const citation = asString(item.citation);
    if (!citation) return [];
    const entry: PublicationEntry = {
      number: Number.isFinite(Number(item.number)) ? Number(item.number) : index + 1,
      citation,
      type: PUBLICATION_TYPES.has(item.type as PublicationEntry['type'])
        ? (item.type as PublicationEntry['type'])
        : 'other',
    };
    const articleKind = asString(item.articleKind);
    if (['research', 'review', 'creative', 'other'].includes(articleKind)) {
      entry.articleKind = articleKind as PublicationEntry['articleKind'];
    }
    copyOptionalString(item, entry, 'bioBibSection');
    copyOptionalString(item, entry, 'originalNumber');
    copyOptionalString(item, entry, 'previouslyListedAs');
    copyOptionalString(item, entry, 'contributionNote');
    copyOptionalString(item, entry, 'reviewMaterialUrl');
    if (typeof item.isNewSinceLastReview === 'boolean') entry.isNewSinceLastReview = item.isNewSinceLastReview;
    return [entry];
  });
}

function sanitizeEmployment(value: unknown): EmploymentEntry[] {
  return asArray(value).flatMap(item => {
    if (!isRecord(item)) return [];
    const entry: EmploymentEntry = {
      from: asString(item.from),
      to: asString(item.to),
      institution: asString(item.institution),
      location: asString(item.location),
      rank: asString(item.rank),
    };
    return entry.institution || entry.rank ? [entry] : [];
  });
}

function sanitizeEducation(value: unknown): EducationEntry[] {
  return asArray(value).flatMap(item => {
    if (!isRecord(item)) return [];
    const entry: EducationEntry = {
      school: asString(item.school),
      datesFrom: asString(item.datesFrom),
      datesTo: asString(item.datesTo),
      location: asString(item.location),
      major: asString(item.major),
      degree: asString(item.degree),
      dateReceived: asString(item.dateReceived),
    };
    return entry.school || entry.degree ? [entry] : [];
  });
}

function sanitizeService(value: unknown): ServiceEntry[] {
  return asArray(value).flatMap(item => {
    if (!isRecord(item)) return [];
    const description = asString(item.description);
    if (!description) return [];
    return [{
      description,
      dates: asString(item.dates),
      category: SERVICE_CATEGORIES.has(item.category as ServiceEntry['category'])
        ? (item.category as ServiceEntry['category'])
        : 'other',
    }];
  });
}

function sanitizeGrants(value: unknown): GrantEntry[] {
  return asArray(value).flatMap(item => {
    if (!isRecord(item)) return [];
    const entry: GrantEntry = {
      title: asString(item.title),
      funder: asString(item.funder),
      period: asString(item.period),
      status: item.status === 'current' ? 'current' : 'past',
    };
    if (!entry.title && !entry.funder) return [];
    copyOptionalString(item, entry, 'amount');
    copyOptionalString(item, entry, 'totalAward');
    copyOptionalString(item, entry, 'role');
    copyOptionalString(item, entry, 'coPIsShare');
    return [entry];
  });
}

function sanitizeStudentGroups(value: unknown): StudentInstructionalGroup[] {
  return asArray(value).flatMap(item => {
    if (!isRecord(item)) return [];
    const heading = asString(item.heading);
    const entries = asStringList(item.entries);
    return heading && entries.length > 0 ? [{ heading, entries }] : [];
  });
}

function copyOptionalString<T extends object>(
  source: Record<string, unknown>,
  target: T,
  key: keyof T & string,
): void {
  const value = asString(source[key]);
  if (value) (target as Record<string, string>)[key] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function asStringList(value: unknown): string[] {
  return asArray(value).map(asString).filter(Boolean);
}
