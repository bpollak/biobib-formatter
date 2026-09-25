import type { PartialResult } from './converter';
import { sanitizePartialResult } from './sanitize';
import { isBibliographyRecord, type SourceRecord } from './source-records';
import { stripLeadingSourceNumber } from '../date-utils';

export interface SourceCoverage {
  included: string[];
  /** Bibliography exclusions keep source text so assembly can recover a record every task declined. */
  excluded: { id: string; reason: string; text?: string }[];
  required: string[];
}

const PUBLICATIONS = new Set(['peerReviewedJournals', 'reviewAndInvited', 'books', 'chapters',
  'refereedProceedings', 'otherArticles', 'otherProceedings', 'abstracts', 'popularWorks',
  'additionalProducts', 'theses', 'patents', 'workInProgress']);

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export class CoverageError extends Error {
  constructor(message: string, public readonly unresolvedIds: string[], public readonly partial?: PartialResult) { super(message); }
}

/** JSON validity is insufficient: every output and source record must be accounted for. */
export function validateCoveredResult(raw: unknown, records: SourceRecord[], allowedFields: string[]): PartialResult {
  raw = unpackAttributedEntries(raw);
  const ids = records.map(record => record.id);
  if (!object(raw) || !object(raw.sections) || !object(raw.sources) || !Array.isArray(raw.excluded)) {
    throw new CoverageError('Response needs a sections object and valid excluded records.', ids);
  }
  const lookup = new Map(records.map(record => [record.id, record]));
  const included = new Set<string>();
  const scalarSources = (field: string) => {
    const refs = raw.sources && (raw.sources as Record<string, unknown>)[field];
    if (!Array.isArray(refs) || !refs.length || refs.some(id => typeof id !== 'string' || !lookup.has(id))) {
      throw new CoverageError(`Unknown or missing source ID for ${field}.`, ids);
    }
    for (const id of refs) included.add(id);
  };
  if (object(raw.metadata) && Object.values(raw.metadata).some(value => typeof value === 'string' && value.trim())) {
    if (!allowedFields.includes('employment')) throw new CoverageError('Metadata belongs only in the identity slice.', ids);
    scalarSources('metadata');
  }
  for (const [field, value] of Object.entries(raw.sections)) {
    if (!allowedFields.includes(field)) throw new CoverageError(`Unexpected output field ${field}.`, ids);
    if (!Array.isArray(value)) {
      if (field !== 'specialization' || typeof value !== 'string') throw new CoverageError(`Invalid ${field}.`, ids);
      if (value.trim()) scalarSources(field);
      continue;
    }
    const references = raw.sources[field] ?? (value.length === 0 ? [] : undefined);
    if (!Array.isArray(references) || references.length !== value.length) {
      throw new CoverageError(`Every ${field} entry needs source IDs.`, ids);
    }
    value.forEach((entry, index) => {
      const refs: unknown = references[index];
      if (!Array.isArray(refs) || !refs.length || refs.some(id => typeof id !== 'string' || !lookup.has(id))) {
        throw new CoverageError(`Unknown or missing source ID in ${field}.`, ids);
      }
      if (new Set(refs).size !== refs.length) throw new CoverageError(`Repeated source ID in ${field} entry.`, ids);
      for (const id of refs) included.add(id as string);
      if (field === 'presentations' || field === 'invitedPresentations') {
        const source = refs.map(id => lookup.get(id as string)!).filter(record => !record.heading)
          .map(record => stripLeadingSourceNumber(record.text).replace(/^[○•●]\s*/, '')).join(' ').replace(/\s+/g, ' ').trim();
        if (!source) throw new CoverageError('Presentation references only headings.', refs as string[]);
        // Moving an existing date is formatting, not a model inference task.
        const dated = source.match(/^((?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:[-–]\d{1,2})?,?\s+)?(?:19|20)\d{2})\s+(.+)$/i);
        value[index] = dated ? `${dated[2]} ${dated[1]}` : source;
      }
      if (PUBLICATIONS.has(field)) {
        if (!object(entry)) throw new CoverageError(`Invalid publication in ${field}.`, refs as string[]);
        if (refs.filter(id => isBibliographyRecord(lookup.get(id as string)!)).length > 1) {
          throw new CoverageError('Distinct bibliography records must have separate output entries.', refs as string[]);
        }
        // Model classifies; code copies complete source evidence, including annotations.
        entry.citation = sourceCitationText(refs.map(id => lookup.get(id as string)!));
        if (!entry.citation) throw new CoverageError('Publication references only headings.', refs as string[]);
        entry.sourceIds = refs;
      }
    });
  }
  const excluded: SourceCoverage['excluded'] = [];
  for (const item of raw.excluded) {
    if (!object(item) || typeof item.id !== 'string' || !lookup.has(item.id)
      || typeof item.reason !== 'string' || !item.reason.trim() || included.has(item.id)
      || excluded.some(previous => previous.id === item.id)) {
      throw new CoverageError('Invalid, duplicate, or contradictory exclusion.', ids);
    }
    const record = lookup.get(item.id)!;
    excluded.push({ id: item.id, reason: item.reason.trim(), ...(isBibliographyRecord(record) ? { text: sourceCitationText([record]) } : {}) });
  }
  const accounted = new Set([...included, ...excluded.map(item => item.id)]);
  const missing = ids.filter(id => !accounted.has(id));
  const cleaned = sanitizePartialResult(raw);
  // Sanitization must not turn malformed model output into silent record loss.
  for (const [field, value] of Object.entries(raw.sections)) {
    const output = cleaned.sections[field as keyof typeof cleaned.sections];
    if (Array.isArray(value) && (!Array.isArray(output) || output.length !== value.length)) {
      throw new CoverageError(`Malformed entries would be discarded from ${field}.`, ids);
    }
    assertNoNestedArrayLoss(value, output, field, ids);
  }
  cleaned.coverage = { included: [...included], excluded, required: [] };
  if (missing.length) throw new CoverageError(`Missing source dispositions: ${missing.join(', ')}.`, missing, cleaned);
  return cleaned;
}

/** Complete citation wording copied from source evidence, without list numbering or bullets. */
export function sourceCitationText(records: SourceRecord[]): string {
  return records.filter(record => !record.heading)
    .map(record => stripLeadingSourceNumber(record.text).replace(/^[○•●]\s*/, '')).join(' ').replace(/\s+/g, ' ').trim();
}

/** Keep evidence beside each model-produced entry; derive parallel arrays in code. */
function unpackAttributedEntries(value: unknown): unknown {
  if (!object(value) || (value.sections !== undefined && !object(value.sections))) return value;
  const raw: Record<string, unknown> & { sections: Record<string, unknown>; sources: Record<string, unknown> } = {
    ...value, sections: { ...(value.sections as Record<string, unknown> | undefined) }, sources: object(value.sources) ? { ...value.sources } : {},
    excluded: value.excluded === undefined ? [] : value.excluded,
  };
  // These are response-level annotations, never CV section fields. Relocate
  // a misplaced array without losing either the nested or top-level notes.
  for (const key of ['gaps', 'reviewNotes', 'excluded'] as const) {
    if (key in raw.sections) {
      if (!Array.isArray(raw.sections[key]) || (raw[key] !== undefined && !Array.isArray(raw[key]))) {
        throw new CoverageError(`Invalid ${key} annotations.`, []);
      }
      raw[key] = [...(raw[key] as unknown[] ?? []), ...raw.sections[key] as unknown[]];
      delete raw.sections[key];
    }
  }
  if (object(value.metadata) && 'sourceIds' in value.metadata) {
    const { sourceIds, ...metadata } = value.metadata;
    raw.metadata = metadata;
    raw.sources.metadata = sourceIds;
  }
  for (const [field, content] of Object.entries(raw.sections)) {
    if (field === 'specialization' && object(content)) {
      raw.sections[field] = content.text;
      raw.sources[field] = content.sourceIds;
    } else if (Array.isArray(content) && content.some(entry => object(entry) && 'sourceIds' in entry)) {
      raw.sources[field] = content.map(entry => object(entry) ? entry.sourceIds : undefined);
      raw.sections[field] = content.map(entry => {
        if (!object(entry)) return entry;
        const { sourceIds: _sourceIds, ...data } = entry;
        void _sourceIds;
        return 'text' in data ? data.text : data;
      });
    }
  }
  return raw;
}

function assertNoNestedArrayLoss(raw: unknown, cleaned: unknown, path: string, ids: string[]): void {
  if (Array.isArray(raw)) {
    if (!Array.isArray(cleaned) || raw.length !== cleaned.length) {
      throw new CoverageError(`Malformed entries would be discarded from ${path}.`, ids);
    }
    raw.forEach((item, index) => assertNoNestedArrayLoss(item, cleaned[index], `${path}[${index}]`, ids));
  } else if (object(raw) && object(cleaned)) {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value) || object(value)) assertNoNestedArrayLoss(value, cleaned[key], `${path}.${key}`, ids);
    }
  }
}

export function combineCoveredParts(parts: PartialResult[]): PartialResult {
  const combined: PartialResult = { sections: {}, gaps: [], reviewNotes: [], coverage: { included: [], excluded: [], required: [] } };
  for (const part of parts) {
    for (const [key, value] of Object.entries(part.sections)) {
      const sections = combined.sections as Record<string, unknown>;
      if (Array.isArray(value)) sections[key] = [...(sections[key] as unknown[] ?? []), ...value];
      else if (value && !sections[key]) sections[key] = value;
    }
    if (part.metadata) {
      combined.metadata ??= { name: '', department: '', title: '', processedAt: part.metadata.processedAt };
      for (const key of ['name', 'department', 'title'] as const) {
        if (!combined.metadata[key] && part.metadata[key]) combined.metadata[key] = part.metadata[key];
      }
    }
    combined.gaps!.push(...(part.gaps ?? []));
    combined.reviewNotes!.push(...(part.reviewNotes ?? []));
    if (part.coverage) {
      combined.coverage!.included.push(...part.coverage.included);
      combined.coverage!.excluded.push(...part.coverage.excluded);
      combined.coverage!.required.push(...part.coverage.required);
    }
  }
  return combined;
}
