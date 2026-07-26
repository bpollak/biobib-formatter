export interface ReleaseNote {
  releasedAt: string;
  releasedAtIso: string;
  title: string;
  changes: readonly string[];
}

/**
 * Public, product-facing release history in reverse chronological order.
 * Keep internal fixture names and one-off validation artifacts out of this list.
 */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    releasedAt: 'July 26, 2026, 9:15 AM PDT',
    releasedAtIso: '2026-07-26T09:15:00-07:00',
    title: 'Dedicated Release Notes and Production Verification Update',
    changes: [
      'Added a dedicated Release Notes page and direct navigation link so product changes are easier to find without searching through the About page.',
      'Reorganized the public update history into one chronological source shared by the Release Notes and About pages.',
      'Completed a live two-pass production review with five real faculty CVs, confirming that generated BioBibs retain their sections, manual-completion guidance, placement review notes, and document structure when processed again.',
      'Clarified the About page’s current 23-part review workflow and temporary-file handling.',
      'Improved shared page rendering so navigation and visual styles remain consistent when moving between routes.',
    ],
  },
  {
    releasedAt: 'July 26, 2026, 6:50 AM PDT',
    releasedAtIso: '2026-07-26T06:50:00-07:00',
    title: 'Lossless BioBib Reprocessing Update',
    changes: [
      'Unedited generated BioBib drafts now retain their reviewed structured record inside the Word file, so processing a generated draft again preserves every section entry, manual-completion item, and placement review note without repeating AI extraction.',
      'If a generated draft is edited before it is uploaded again, the app detects the change and reviews the visible document instead of restoring stale embedded content.',
      'Faculty thesis and dissertation entries now remain in the generated bibliography even when the citation title does not repeat the faculty member’s name.',
      'Expanded honors extraction to recognize CV sections labeled “Honors, Awards and Fellowships.”',
      'Strengthened two-pass release verification to require exact structured-section, gap-list, and review-note preservation.',
    ],
  },
  {
    releasedAt: 'July 25, 2026, 8:15 PM PDT',
    releasedAtIso: '2026-07-25T20:15:00-07:00',
    title: 'Safe Reprocessing and Duplicate Prevention Update',
    changes: [
      'Made generated BioBib drafts safer to process again by excluding the conversion-review appendix from subsequent CV extraction.',
      'Improved exact-duplicate cleanup across University Service and External Professional Activities while retaining uncertain near-matches for human review.',
      'Improved bibliography cleanup so repeated citations do not accumulate within publication sections or Work in Progress.',
      'Added two-pass release verification to confirm generated documents retain the expected formatting and do not introduce new high-confidence duplicates when reprocessed.',
      'Split long university-service histories into smaller review periods so service-heavy CVs can complete more reliably.',
      'Generated BioBibs now use their own standardized section headings to bound reprocessing tasks, preventing long records from being silently skipped on a second pass.',
    ],
  },
  {
    releasedAt: 'June 17, 2026, 10:42 AM PDT',
    releasedAtIso: '2026-06-17T10:42:00-07:00',
    title: 'Chronology and Review-Period Update',
    changes: [
      'Added an optional new-since-last-review date so generated drafts can mark and separate clearly dated new records.',
      'Improved chronological ordering for dated service, memberships, honors, grants, external activities, presentations, diversity contributions, student activity, and abstract entries.',
      'Moved leading dates to the end of generated professional-data records for cleaner BioBib formatting.',
      'Improved cleanup of inherited CV numbering in presentations and abstracts so generated BioBib numbering remains the only visible list numbering.',
    ],
  },
  {
    releasedAt: 'June 9, 2026, 3:30 PM PDT',
    releasedAtIso: '2026-06-09T15:30:00-07:00',
    title: 'Activity History Selector Fix',
    changes: [
      'Fixed the activity history selector so the All years choice displays in the field after selection and as the starting value, instead of an empty box.',
    ],
  },
  {
    releasedAt: 'June 9, 2026, 2:45 PM PDT',
    releasedAtIso: '2026-06-09T14:45:00-07:00',
    title: 'Review Period and Summary Page Update',
    changes: [
      'Added a review period option on the upload screen so Section II service, grants, presentations, and other activities can be limited to a chosen start year (for example, 2020 to present), with all years remaining the default. Employment, education, and the bibliography always include the full record.',
      'Added the selected review period to the generated document heading for reviewer reference.',
      'Added a Conversion Review Summary page at the end of the generated document listing manual completion items and placement review notes, with instructions to resolve and remove the page before submission.',
    ],
  },
  {
    releasedAt: 'June 9, 2026, 10:30 AM PDT',
    releasedAtIso: '2026-06-09T10:30:00-07:00',
    title: 'Reliability and Privacy Update',
    changes: [
      'Accepted uppercase .DOCX file extensions when uploading a CV.',
      'Added automatic recovery when the final assembly step of a conversion is interrupted, so completed section work is merged instead of lost.',
      'Hardened conversion against occasional malformed AI section output so a single bad entry no longer fails the whole conversion.',
      'Removed the parsed CV text from temporary storage once a conversion finishes.',
    ],
  },
  {
    releasedAt: 'June 4, 2026, 11:08 AM PDT',
    releasedAtIso: '2026-06-04T11:08:00-07:00',
    title: 'Review Notes and Output Fidelity Update',
    changes: [
      'Added generated Word document page numbering and final document-link/signature placeholders for review workflows.',
      'Improved preservation of subscript and superscript formatting in extracted professional activity and presentation entries, not only bibliography entries.',
      'Improved classification of honorific appointments, conference proceedings, and popular works during BioBib assembly.',
      'Added review notes for likely duplicate or judgment-call section placements so reviewers can confirm the final organization.',
      'Improved section completion reporting for grouped student instructional activity entries.',
    ],
  },
  {
    releasedAt: 'June 2, 2026, 12:48 PM PDT',
    releasedAtIso: '2026-06-02T12:48:00-07:00',
    title: 'Recovery Navigation Update',
    changes: [
      'Changed saved conversion recovery so returning to the home page no longer automatically forces a previous job to resume.',
      'Added a visible recovery prompt with resume and dismiss actions for saved in-progress conversions.',
      'Kept explicit recovery links available for users who want to reopen a running conversion directly.',
    ],
  },
  {
    releasedAt: 'May 26, 2026, 9:34 PM PDT',
    releasedAtIso: '2026-05-26T21:34:00-07:00',
    title: 'Conversion Recovery Update',
    changes: [
      'Added saved conversion recovery so an active BioBib job can resume after a page refresh, accidental tab close, or copied recovery link.',
      'Added recovery links to the progress screen so users can return to a running conversion without losing access to the generated draft.',
      'Improved completed-result recovery so a finished BioBib remains reachable from the browser until the user starts over.',
    ],
  },
  {
    releasedAt: 'May 24, 2026, 8:18 PM PDT',
    releasedAtIso: '2026-05-24T20:18:00-07:00',
    title: 'Model Routing and Resilience Update',
    changes: [
      'Added section-aware model routing so review tasks can use cloud or on-prem UCSD TritonAI models based on the type of BioBib content being extracted.',
      'Added fallback handling across model providers so eligible sections can continue when a preferred model is temporarily unavailable or over budget.',
      'Improved on-prem fallback handling for longer BioBib sections by narrowing review context to the requested date window when appropriate.',
      'Improved resilience for on-prem review attempts with a retry path for transient empty or truncated responses.',
      'Updated the application description to reflect routed UCSD TritonAI review rather than a single fixed review model.',
    ],
  },
  {
    releasedAt: 'May 24, 2026, 5:18 PM PDT',
    releasedAtIso: '2026-05-24T17:18:00-07:00',
    title: 'BioBib Formatting and Bibliography Fidelity Update',
    changes: [
      'Updated generated Word documents to use Arial typography throughout the BioBib draft.',
      'Aligned major BioBib section labels, subsection labels, and Education columns more closely with UCSD BioBib formatting conventions while preserving semantic Word headings.',
      'Improved student instructional activity formatting with grouped subheaders and restarted numbering within each group.',
      'Cleaned source numbering from student instructional entries so generated lists use BioBib numbering only.',
      'Improved presentation formatting so national/international presentations and other invited presentations number independently within their own subsections.',
      'Enhanced bibliography organization with clearer Section III labels, always-present empty sections where expected, and better placement of likely submitted or in-progress work.',
      'Refined bibliography subheading styling so publication category labels are not italicized.',
      'Improved preservation of chemical and scientific notation from Word CVs by carrying source subscript and superscript formatting into generated bibliography entries when available.',
      'Improved final status handling so the app keeps waiting briefly if the generated result is still becoming available.',
    ],
  },
  {
    releasedAt: 'May 15, 2026, 12:09 PM PDT',
    releasedAtIso: '2026-05-15T12:09:00-07:00',
    title: 'BioBib Output Quality and Regression Guard Update',
    changes: [
      'Improved final Word output so internal extraction metadata stays out of user-facing bibliography entries.',
      'Added clearer review text in tables when source CV details are unavailable, reducing silent blank cells in generated documents.',
      'Improved invited-presentation section placement so conference and society meeting presentations are separated from institutional invited talks.',
      'Added regression checks for generated-document quality, including metadata leakage, duplicate publication labels, unavailable table values, and presentation section placement.',
    ],
  },
  {
    releasedAt: 'May 15, 2026, 11:39 AM PDT',
    releasedAtIso: '2026-05-15T11:39:00-07:00',
    title: 'Application Reliability and Accessible Output Update',
    changes: [
      'Moved BioBib section review to GPT 5.5 through UCSD TritonAI so long CVs have more room for structured extraction.',
      'Improved large-CV handling by splitting long publication, abstract, and presentation lists into smaller saved tasks with visible section progress.',
      'Added partial-result handling so completed sections can still be returned when an individual review task fails.',
      'Expanded final merge cleanup for duplicate reduction, publication renumbering, and better separation of employment history from fellowships, visiting titles, senate offices, and service roles.',
      'Enhanced generated Word documents with semantic title and heading styles, document metadata, an English language setting, and repeatable table header rows for better navigation and assistive technology support.',
      'Validated the production workflow end to end, including upload, section extraction, final status, download, DOCX validity, and generated-document accessibility markers.',
    ],
  },
];
