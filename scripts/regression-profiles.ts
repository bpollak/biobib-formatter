import { normalizeForComparison } from '../lib/text-utils';

export type RegressionProfileName = 'continetti' | 'nieh';

export interface ProfileCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

type Sections = Record<string, unknown[]>;
type Metadata = Record<string, unknown>;

const CONTINETTI_HONOR_ANCHORS = [
  'Amoco Graduate Fellow',
  'Phi Beta Kappa',
  'Camille and Henry Dreyfus New Faculty Awardee',
  "UCSD Chancellor's Summer Faculty Fellowship",
  'David and Lucile Packard Fellow in Science and Engineering',
  'Camille Dreyfus Teacher-Scholar',
  'Alfred P. Sloan Research Fellow',
  'Warren College Outstanding Teacher Award',
  'Visiting Scientist, Combustion Research Facility',
  'Professore Visitatore|2000',
  'Fellow, American Physical Society',
  'Kurt Shuler Scholar in Physical Chemistry',
  'Wilsmore Fellow',
  'UCSD Diversity Champion Award',
  'ACS Division of Physical Chemistry Award in Experimental Chemistry',
  'Professore Visitatore|2013',
  'Distinguished Professor, University of California, San Diego',
  'Aarhus University Faculty Fellow',
  'Fellow, American Association for the Advancement of Science',
  'Distinguished Chair in Physical Chemistry',
] as const;

const CONTINETTI_PROCEEDING_ANCHORS = [
  'Estimating the impact of atmospheric carbonaceous particulates',
  'On the origin of carbonaceous particulates in American cities',
  'XIIIth International Hot Atom Chemistry Symposium',
  'Reactive scattering of energetic deuterium atoms',
  'Dynamics of dissociative photodetachment in cluster anions',
  'Photoelectron-photofragment coincidence studies of anion dissociation dynamics',
  'Effect of Nozzle Geometry on Cluster Formation',
  'Experimentally probing the three-body predissociation dynamics',
  'Dissociation dynamics of highly excited molecules produced by charge exchange',
] as const;

const NIEH_FULL_DATE_ENTRIES = [
  {
    anchor: 'The role of pheromones in the food location communication system',
    date: 'May 20, 1995',
  },
  {
    anchor: 'The emergent properties of superorganism signaling',
    date: 'Sept 23, 2014',
  },
] as const;

export function isRegressionProfileName(value: string): value is RegressionProfileName {
  return value === 'continetti' || value === 'nieh';
}

export function evaluateRegressionProfile(
  profile: RegressionProfileName,
  sections: Sections,
  metadata: Metadata = {},
): ProfileCheck[] {
  return profile === 'continetti'
    ? evaluateContinetti(sections, metadata)
    : evaluateNieh(sections, metadata);
}

function evaluateContinetti(sections: Sections, metadata: Metadata): ProfileCheck[] {
  const awards = asStrings(sections.awards);
  const refereed = publicationCitations(sections.refereedProceedings);
  const misplaced = [
    ...publicationCitations(sections.otherArticles),
    ...publicationCitations(sections.otherProceedings),
  ];

  const missingHonors = CONTINETTI_HONOR_ANCHORS.filter(anchor =>
    countAnchorMatches(awards, anchor) !== 1,
  );
  const missingProceedings = CONTINETTI_PROCEEDING_ANCHORS.filter(anchor =>
    countAnchorMatches(refereed, anchor) !== 1,
  );
  const misplacedProceedings = CONTINETTI_PROCEEDING_ANCHORS.filter(anchor =>
    countAnchorMatches(misplaced, anchor) !== 0,
  );

  return [
    {
      name: 'Profile identifies the expected faculty CV',
      pass: stringValue(metadata.name).includes('Continetti'),
      detail: stringValue(metadata.name) || 'name missing',
    },
    {
      name: 'All documented honors and honorific appointments appear exactly once',
      pass: missingHonors.length === 0,
      detail: missingHonors.length === 0
        ? `${CONTINETTI_HONOR_ANCHORS.length} expected records`
        : `missing or repeated: ${missingHonors.join(', ')}`,
    },
    {
      name: 'Both Professore Visitatore appointments remain distinct',
      pass:
        countAnchorMatches(awards, 'Professore Visitatore|2000') === 1 &&
        countAnchorMatches(awards, 'Professore Visitatore|2013') === 1,
    },
    {
      name: 'All documented refereed proceedings are present exactly once',
      pass: missingProceedings.length === 0 && refereed.length === CONTINETTI_PROCEEDING_ANCHORS.length,
      detail: missingProceedings.length === 0
        ? `${refereed.length} proceedings`
        : `missing or repeated: ${missingProceedings.join(', ')}`,
    },
    {
      name: 'Documented refereed proceedings are not misplaced in other publication sections',
      pass: misplacedProceedings.length === 0 && publicationCitations(sections.otherProceedings).length === 0,
      detail: misplacedProceedings.length === 0
        ? 'no misplaced proceedings'
        : misplacedProceedings.join(', '),
    },
  ];
}

function evaluateNieh(sections: Sections, metadata: Metadata): ProfileCheck[] {
  const abstracts = publicationCitations(sections.abstracts);
  const presentations = [
    ...asStrings(sections.presentations),
    ...asStrings(sections.invitedPresentations),
  ];
  const overlaps = abstracts.flatMap(abstract =>
    presentations
      .filter(presentation => likelySameCitation(abstract, presentation))
      .map(presentation => `${shorten(abstract)} <> ${shorten(presentation)}`),
  );
  const dateFailures = NIEH_FULL_DATE_ENTRIES.filter(({ anchor, date }) => {
    const entry = presentations.find(item => item.includes(anchor));
    return !entry || !entry.trim().endsWith(date);
  });
  const numberedAbstracts = abstracts.filter(item => /^\s*(?:\(\d+\)|\d+[.)])/.test(item));

  return [
    {
      name: 'Profile identifies the expected faculty CV',
      pass: stringValue(metadata.name).includes('Nieh'),
      detail: stringValue(metadata.name) || 'name missing',
    },
    {
      name: 'Conference abstracts do not also appear as Section II presentations',
      pass: overlaps.length === 0,
      detail: overlaps.length === 0 ? 'no fuzzy overlaps' : overlaps.slice(0, 3).join(' | '),
    },
    {
      name: 'Documented presentation dates retain full source precision at the end',
      pass: dateFailures.length === 0,
      detail: dateFailures.length === 0
        ? `${NIEH_FULL_DATE_ENTRIES.length} full dates preserved`
        : dateFailures.map(item => item.date).join(', '),
    },
    {
      name: 'Abstracts do not retain inherited source-order numbering',
      pass: numberedAbstracts.length === 0,
      detail: numberedAbstracts.length === 0
        ? `${abstracts.length} abstracts checked`
        : numberedAbstracts.slice(0, 3).map(shorten).join(' | '),
    },
  ];
}

function countAnchorMatches(values: string[], anchor: string): number {
  const requiredParts = anchor.split('|').map(normalizeForComparison);
  return values.filter(value => {
    const normalized = normalizeForComparison(value);
    return requiredParts.every(part => normalized.includes(part));
  }).length;
}

function likelySameCitation(left: string, right: string): boolean {
  const leftTokens = new Set(normalizeForComparison(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeForComparison(right).split(' ').filter(Boolean));
  const smallerSize = Math.min(leftTokens.size, rightTokens.size);
  if (smallerSize < 8) return false;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / smallerSize >= 0.9;
}

function publicationCitations(value: unknown): string[] {
  return asRecords(value)
    .map(item => stringValue(item.citation))
    .filter(Boolean);
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item),
    )
    : [];
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function shorten(value: string): string {
  return value.length > 90 ? `${value.slice(0, 87)}...` : value;
}
