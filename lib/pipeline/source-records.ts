/** Source evidence is segmented before any model call; text is never clipped by year. */
import type { SliceKey } from './slices';

export interface SourceRecord {
  id: string;
  text: string;
  context: string;
  heading: boolean;
  start: number;
  end: number;
}

const HEADING = /^(?:(?:section\s+[ivx]+|\(?[a-z0-9]+(?:\.\d+)*\)?)[.\s:–—-]+)?(?:academic positions?|current positions?|past positions?|positions|employment|appointments|education|research interests|specialization|honors.*|awards.*|memberships.*|professional societies.*|certifications|.*(?:publications|research papers|methods papers|book chapters|books reviewed for|review articles|bibliography)|books|patents|u\.?s\.? patent|.*(?:abstracts|contributed talks)|.*(?:service activities|university service|professional activities)|service (?:to|outside of).*|editorial service|technical service.*|outreach.*|.*(?:contracts and grants|research support)|contracts.*|grants reviewed for|.*(?:invited lectures|invited presentations|conference presentations)|presentations at.*|teaching|educational activities|.*(?:student instructional activities|doctoral students|ph\.?d\.? students|masters? students|m\.?s\.? students|postdoctoral associates|undergraduate research students|visiting scientists and graduate students)|.*contributions.*diversity.*|other activities|external reviews of primary creative work|manuscripts reviewed for|letters provided for.*)\s*:?(?:\s*\([^)]*\))?$/i;

export function isSourceHeading(text: string): boolean {
  if (text.length >= 180) return false;
  if (/^for\s/i.test(text.trim())) return false; // an award rubric is not a bibliography heading
  const plain = text.trim().replace(/^\d+(?:\.\d+)*\s+/, '').replace(/[‑–]/g, '-');
  if (/^education(?:\s*:|\t|\s+(?:[BM]\.[AS]\.|Ph\.?D\.?))/i.test(plain)) return true;
  if (/^(?:major accomplishments|essays|colloquia and presentations|invited talks|public service|consulting|clinical activities|student advising|corpora maintained|past research positions)$/i.test(plain)) return true;
  if (/^\d{1,2}(?:\.\d+)+\s+\p{Lu}/u.test(text) || /^\d{1,2}\s{2,}\p{Lu}/u.test(text)) return true;
  if (/^(?:grants(?: and other funding)?|(?:journal articles|conference proceedings)(?: and (?:book chapters|reports))?|(?:professional activities(?: & services)?|(?:faculty|academic|university.level|department.level|professional and community) service)|university service at .+|teaching experience|conference presentations and posters|advising(?: and mentoring)?)$/i.test(plain)) return true;
  return HEADING.test(plain) || /^(?:(?:past|current) research(?: and educational)? support|(?:invited )?(?:lectures|presentations) (?:at|to)\b|(?:invited )?(?:peer.reviewed )?(?:review articles?|book reviews|books and book chapters)|grants\s*(?:\(|&)|(?:doctoral|master.s) students\b|(?:invited academic.*|ucsd) talks$|departmental service$|contributions to .*principles of community)/i.test(plain);
}

const THESIS_TITLE = /^(?:\d{1,2}\s+)?(?:(?:doctoral|ph\.?d\.?)\s+)?(?:thesis|dissertation)(?:\s+title)?\s*:/i;

export function sourceRecords(rawText: string): SourceRecord[] {
  const records: SourceRecord[] = [];
  let context = '';
  const outline: string[] = [];
  let previousContent: SourceRecord | undefined;
  const pageHeader = /^[A-Z][A-Z .,'’–-]{4,}\s{2,}\d{1,3}\s*$/;
  let afterPageHeader = false;
  // Keep paragraph offsets so selecting any line preserves the whole source block.
  const paragraphs = [...rawText.matchAll(/[^\r\n]+(?:\r?\n(?!\s*\r?\n)[^\r\n]+)*/g)];
  for (const match of paragraphs) {
    // A plain-text CV can have headings and numbered records in one paragraph.
    const chunks = match[0].split(/\r?\n/);
    let offset = match.index!;
    for (const chunk of chunks) {
      const text = chunk.trim();
      const start = offset;
      offset += chunk.length + 1;
      if (!text) continue;
      const furniture = /^\d{1,3}$/.test(text) || pageHeader.test(chunk) || (afterPageHeader && /^[A-Z]+\s+(?:19|20)\d{2}$/.test(text));
      afterPageHeader = pageHeader.test(chunk);
      const titledThesis = THESIS_TITLE.test(text);
      const heading = furniture || (!titledThesis && isSourceHeading(text));
      const previous = previousContent;
      const crossedPageFurniture = previous !== records.at(-1);
      const bibliography = /publications|papers|articles?|books?|chapters|abstracts|bibliography|patents/i.test(context);
      // "2019.100953" is a wrapped DOI suffix, not a record that starts with a year.
      const startsRecord = /^(?:\(?\d+[.)]\s|[○•●]\s|(?:19|20)\d{2}\b(?![./]\d))/.test(text)
        || (bibliography && (/^[\p{Lu}][\p{L}’'-]+,\s*\p{Lu}[.,\s]/u.test(text)
          || /^(?:\p{Lu}\.\s*){1,4}\p{Lu}[\p{L}’'-]+(?:\s+\p{Lu}[\p{L}’'-]+){0,2}(?:,|\s+and\s)/u.test(text)));
      // A translation note annotates the preceding work, even after a page break.
      const continuation = /^(?:featured in|highlighted in|doi\s*:|pmid\s*:|https?:|\*\*|co.corresponding|(?:\p{Lu}[\p{L}-]+\s+)?translation\s*:)/iu.test(text)
        // "... In C." followed by "Chamberlain, J. Morford (Eds.)" is one
        // citation; the editor list must not start a new author record.
        || (!!previous && !previous.heading && bibliography && !crossedPageFurniture
          && /(?:\bIn(?:\s+(?:\p{Lu}[.-]\s*)+)?|[,&]|\band)$/u.test(previous.text.trimEnd()))
        || (!!previous && !previous.heading && !startsRecord && (bibliography || THESIS_TITLE.test(previous.text))
          && (/^\s{2,}\S/.test(chunk) || (!crossedPageFurniture && !/[.!?\d)]\s*$/.test(previous.text))));
      if ((heading || titledThesis) && !furniture) {
        const numbered = text.match(/^(\d{1,2}(?:\.\d+)*)\s+/);
        if (numbered) {
          const depth = numbered[1].split('.').length - 1;
          outline.length = depth;
          outline[depth] = text;
          context = outline.filter(Boolean).join(' / ');
        } else if (heading) {
          outline.length = 0;
          context = text;
        }
      }
      if (continuation && !heading && previous && !previous.heading) {
        previous.text += `\n${text}`;
        previous.end = start + chunk.length;
      } else {
        const record = { id: `s${start}`, text, context, heading, start, end: start + chunk.length };
        records.push(record);
        if (!furniture) previousContent = record;
      }
    }
  }
  return records;
}

export function batchSourceRecords(records: SourceRecord[], maxRecords = 40, maxCharacters = 18000): SourceRecord[][] {
  const batches: SourceRecord[][] = [];
  let batch: SourceRecord[] = [];
  let size = 0;
  for (const record of records) {
    const weight = record.text.length + record.context.length + 60;
    // Never silently split an unusually large record. Explicitly fail for review.
    if (weight > 64000) throw new Error(`Source record ${record.id} exceeds the safe extraction size; divide this source record before converting.`);
    if (batch.length && (batch.length >= maxRecords || size + weight > maxCharacters)) {
      batches.push(batch); batch = []; size = 0;
    }
    batch.push(record); size += weight;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

/** A conservative citation candidate: keep source headings and prose out of the gate. */
export function isBibliographyRecord(record: SourceRecord): boolean {
  if (!record.heading && /conference presentations/i.test(record.context)
    && /^\(?\d+[.)]\s/.test(record.text) && /\b(?:19|20)\d{2}\b/.test(record.text)) return true;
  if (!record.heading && /education|dissertation|thesis/i.test(record.context) && THESIS_TITLE.test(record.text)) return true;
  return !record.heading && /publications|papers|articles?|books?|chapters|abstracts|bibliography|patents|essays/i.test(record.context)
    && !/reviewed for|students|service/i.test(record.context)
    && record.text.length > 35
    && /\b(?:19|20)\d{2}\b|\bdoi\b|\bpmid\b|\baccepted\b|\bin press\b/i.test(record.text)
    && !/^\*?(?:undergraduate|underrepresented)\b/i.test(record.text);
}

export function recordsForSlice(rawText: string, slice: SliceKey): SourceRecord[] {
  const all = sourceRecords(rawText);
  const patterns: [RegExp, RegExp][] = [
    [/^meta_and_I$/, /\beducation\b|employment|appointments|positions?|research interests|specialization|basic information/i],
    [/^II_memberships_awards$/, /\beducation\b|employment|appointments|positions?|memberships|societies|honors|awards|fellowships/i],
    [/^II_service_/, /university.*service|department.*service|service to|service outside|public service|faculty service|academic service|community service/i],
    [/^II_grants$/, /grants|research.*support/i],
    [/^II_teaching$/, /teaching|educational activities|students|postdoc|instructional|visiting scientists|mentoring|advising/i],
    [/^II_external$/, /professional|editorial|technical service|consulting|reviewed for|reviewer|career reviews|external reviews|service outside/i],
    [/^II_diversity_other$/, /diversity|outreach|other activities|synergistic|clinical|principles of community|major accomplishments/i],
    [/^II_presentations/, /presentations|lectures|talks|seminars/i],
    [/^III_/, /publications|papers|articles?|books?|chapters|abstracts|bibliography|patent|products|software|datasets|dissertation|conference presentations|conference proceedings|essays|corpora maintained/i],
  ];
  const context = patterns.find(([key]) => key.test(slice))?.[1];
  let selected = all.filter(record => (!record.context && slice === 'meta_and_I') || !context || context.test(record.context));
  // Faculty thesis titles often appear with their degree rather than in the
  // bibliography. Include the education context to distinguish the faculty's
  // own thesis from dissertations supervised later in the CV.
  if (slice === 'III_popular_products') {
    selected = all.filter(record => context!.test(record.context) || /education/i.test(record.context));
  }
  // Unknown layouts must remain extractable; do not infer an absent section from
  // a heading vocabulary miss. Every record is explicit model evidence then.
  if (!all.some(record => record.heading)) selected = all;
  if (slice === 'II_diversity_other') {
    selected = all.filter(record => context!.test(record.context)
      || /diversity|outreach|equity|underrepresented|public engagement|community engagement/i.test(record.text));
  }
  const window = slice.endsWith('_pre_2000') ? [0, 1999]
    : slice.endsWith('_2000_2010') ? [2000, 2010]
      : slice.endsWith('_2011_2020') ? [2011, 2020]
        : slice.endsWith('_post_2020') ? [2021, 9999]
          : slice === 'II_service_pre_2010' ? [0, 2010]
            : slice === 'III_journals_late' ? [2011, 9999] : null;
  if (window) selected = selected.filter(record => {
    const years = record.text.match(/\b(?:19|20)\d{2}\b/g)?.map(Number) ?? [];
    return record.heading || !years.length || years.some(year => year >= window[0] && year <= window[1]);
  });
  return selected;
}
