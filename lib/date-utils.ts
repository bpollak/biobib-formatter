export interface InitialDateInfo {
  sortKey: number;
  label: string;
  year: number;
  month: number;
  day: number;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_PATTERN =
  'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';

export function stripLeadingSourceNumber(value: string): string {
  return value
    .trim()
    .replace(/^\s*(?:\(\d+\)|\d+[.)])\s*/, '')
    .trim();
}

export function cleanGeneratedRecord(value: string): string {
  return moveLeadingDateToEnd(stripLeadingSourceNumber(value).replace(/\s+/g, ' ').trim());
}

export function moveLeadingDateToEnd(value: string): string {
  const split = splitLeadingDate(value);
  if (!split) return value.trim();
  const rest = split.rest.trim();
  if (!rest) return split.dateLabel;
  if (endsWithDateLabel(rest, split.dateLabel)) return rest;
  return `${rest} (${split.dateLabel})`;
}

export function splitLeadingDate(value: string): { dateLabel: string; rest: string } | null {
  const trimmed = value.trim();
  const patterns = [
    new RegExp(`^(${MONTH_PATTERN})\\s+\\d{1,2},\\s*\\d{4}\\b[\\s,.:;-]*`, 'i'),
    new RegExp(`^(${MONTH_PATTERN})\\s+\\d{4}\\b[\\s,.:;-]*`, 'i'),
    /^\d{4}-\d{2}-\d{2}\b[\s,.:;-]*/,
    /^\d{4}\s*,\s*\d{4}\b[\s,.:;-]*/,
    /^\d{4}\s*[-\u2013\u2014]\s*(?:\d{4}|current|present|tenure)\b[\s,.:;-]*/i,
    /^\d{4}\b[\s,.:;-]*/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const dateLabel = match[0].replace(/[\s,.:;-]+$/, '').trim();
    const rest = trimmed.slice(match[0].length).trim();
    return { dateLabel, rest };
  }

  return null;
}

export function extractInitialDateInfo(value: string | undefined): InitialDateInfo | null {
  const cleaned = stripLeadingSourceNumber(value ?? '');
  if (!cleaned) return null;

  const leading = splitLeadingDate(cleaned);
  if (leading) return dateInfoFromLabel(leading.dateLabel);

  const fullDate = cleaned.match(new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2}),\\s*(\\d{4})\\b`, 'i'));
  if (fullDate) {
    return buildDateInfo(Number(fullDate[3]), monthNumber(fullDate[1]), Number(fullDate[2]), fullDate[0]);
  }

  const isoDate = cleaned.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoDate) {
    return buildDateInfo(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]), isoDate[0]);
  }

  const monthYear = cleaned.match(new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{4})\\b`, 'i'));
  if (monthYear) {
    return buildDateInfo(Number(monthYear[2]), monthNumber(monthYear[1]), 0, monthYear[0]);
  }

  const range = cleaned.match(/\b((?:19|20)\d{2})\s*[-\u2013\u2014]\s*(?:(?:19|20)\d{2}|current|present|tenure)\b/i);
  if (range) return buildDateInfo(Number(range[1]), 0, 0, range[0]);

  const year = cleaned.match(/\b(19|20)\d{2}\b/);
  if (year) return buildDateInfo(Number(year[0]), 0, 0, year[0]);

  return null;
}

export function sortByInitialDate<T>(items: T[], textForItem: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index, date: extractInitialDateInfo(textForItem(item)) }))
    .sort((a, b) => {
      if (a.date && b.date) return a.date.sortKey - b.date.sortKey || a.index - b.index;
      if (a.date) return -1;
      if (b.date) return 1;
      return a.index - b.index;
    })
    .map(item => item.item);
}

export function dateOnOrAfter(value: string | undefined, cutoff: string | undefined): boolean {
  const date = extractInitialDateInfo(value);
  const cutoffKey = cutoffDateSortKey(cutoff);
  return !!date && cutoffKey !== null && date.sortKey >= cutoffKey;
}

export function dateBefore(value: string | undefined, cutoff: string | undefined): boolean {
  const date = extractInitialDateInfo(value);
  const cutoffKey = cutoffDateSortKey(cutoff);
  return !!date && cutoffKey !== null && date.sortKey < cutoffKey;
}

export function cutoffDateSortKey(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return dateSortKey(year, month, day);
}

function dateInfoFromLabel(label: string): InitialDateInfo | null {
  const fullDate = label.match(new RegExp(`^(${MONTH_PATTERN})\\s+(\\d{1,2}),\\s*(\\d{4})$`, 'i'));
  if (fullDate) {
    return buildDateInfo(Number(fullDate[3]), monthNumber(fullDate[1]), Number(fullDate[2]), label);
  }

  const monthYear = label.match(new RegExp(`^(${MONTH_PATTERN})\\s+(\\d{4})$`, 'i'));
  if (monthYear) return buildDateInfo(Number(monthYear[2]), monthNumber(monthYear[1]), 0, label);

  const isoDate = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return buildDateInfo(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]), label);

  const year = label.match(/^(19|20)\d{2}/);
  if (year) return buildDateInfo(Number(year[0]), 0, 0, label);

  return null;
}

function buildDateInfo(year: number, month: number, day: number, label: string): InitialDateInfo {
  return {
    sortKey: dateSortKey(year, month, day),
    label: label.trim(),
    year,
    month,
    day,
  };
}

function dateSortKey(year: number, month: number, day: number): number {
  return year * 10000 + month * 100 + day;
}

function monthNumber(value: string): number {
  return MONTHS[value.toLowerCase().replace(/\.$/, '')] ?? 0;
}

function endsWithDateLabel(value: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\(${escaped}\\)\\s*[.;]?$`, 'i').test(value);
}
