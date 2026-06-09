/**
 * Slice key definitions shared by the server pipeline and the client UI.
 *
 * This module must stay client-safe: no env access and no server-only
 * imports, since app/page.tsx bundles it to render per-slice progress.
 */

export type SliceKey =
  | 'meta_and_I'
  | 'II_service'
  | 'II_teaching'
  | 'II_grants'
  | 'II_external'
  | 'II_presentations_pre_2000'
  | 'II_presentations_2000_2010'
  | 'II_presentations_2011_2020'
  | 'II_presentations_post_2020'
  | 'II_diversity_other'
  | 'III_journals_pre_2000'
  | 'III_journals_2000_2010'
  | 'III_journals_late'
  | 'III_other_a'
  | 'III_other_proc'
  | 'III_abstracts_pre_2000'
  | 'III_abstracts_2000_2010'
  | 'III_abstracts_2011_2020'
  | 'III_abstracts_post_2020'
  | 'III_popular_products';

export const SLICE_LABELS: Record<SliceKey, string> = {
  meta_and_I: 'Section I — Employment & Education',
  II_service: 'Section II — Service, Memberships, Awards',
  II_teaching: 'Section II — Teaching & Mentoring',
  II_grants: 'Section II — Contracts & Grants',
  II_external: 'Section II — External Activities & Reviews',
  II_presentations_pre_2000: 'Section II — Presentations (< 2000)',
  II_presentations_2000_2010: 'Section II — Presentations (2000–2010)',
  II_presentations_2011_2020: 'Section II — Presentations (2011–2020)',
  II_presentations_post_2020: 'Section II — Presentations (> 2020)',
  II_diversity_other: 'Section II — Diversity, Outreach, Other',
  III_journals_pre_2000: 'Section III — Peer-Reviewed Journals (< 2000)',
  III_journals_2000_2010: 'Section III — Peer-Reviewed Journals (2000–2010)',
  III_journals_late: 'Section III — Peer-Reviewed Journals (> 2010)',
  III_other_a: 'Section III — Books, Chapters, Reviews',
  III_other_proc: 'Section III — Conference Proceedings',
  III_abstracts_pre_2000: 'Section III — Abstracts (< 2000)',
  III_abstracts_2000_2010: 'Section III — Abstracts (2000–2010)',
  III_abstracts_2011_2020: 'Section III — Abstracts (2011–2020)',
  III_abstracts_post_2020: 'Section III — Abstracts (> 2020)',
  III_popular_products: 'Section III — Popular Works & Products',
};

export const SLICE_KEYS = Object.keys(SLICE_LABELS) as readonly SliceKey[];

export const isSliceKey = (s: string): s is SliceKey => s in SLICE_LABELS;
