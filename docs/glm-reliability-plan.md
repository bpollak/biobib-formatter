# GLM extraction reliability and production release

Created September 24, 2026. Status: implemented and validated; see Release evidence.

## Outcome

Make the on-premises GLM pipeline preserve complete source records, detect and
repair omissions, and produce stable classifications. Release to production
only after source-based completeness checks and the full release gate pass.

## Implementation sequence

1. Preserve source evidence. Build a record inventory with stable source IDs,
   complete continuation text, and section context. Avoid clipping records at
   date-adjacent lines. Keep uncertain boundaries explicit rather than silently
   discarding text.
2. Bound model work by record count and input size. Extract/classify small
   batches, require an explicit disposition for every source ID, and reconstruct
   citations from original evidence. Preserve dates, annotations, and review
   markers. Keep high reasoning effort until measured evidence supports a change.
3. Validate and repair. Reject truncated or structurally invalid responses;
   detect missing, duplicated, and unknown source IDs; retry only unresolved
   records with their full context. Surface unresolved coverage as a failure or
   actionable review item, never silent successful extraction.
4. Reconcile classification. Use focused category rules and source provenance
   to reconcile activities and bibliography records across batches. Preserve
   legitimate distinct records while preventing accidental duplicates.
5. Strengthen regression evidence. Test record boundaries, source preservation,
   coverage repair, malformed/truncated responses, classification, and retries.
   Add source-based checks for the previously omitted protocol papers and broader
   bibliography coverage. Repeat fresh GLM extraction to measure consistency;
   embedded-document reprocessing is tested separately.
6. Validate a preview. Run npm run test:release, deploy a candidate, then run
   npm run test:release:live with both semantic acceptance CVs and at least three
   additional real UC San Diego faculty CVs. Every output is reprocessed with
   the same acceptance profile. Investigate failures and rerun the complete gate.
7. Release and verify. Update public release notes and operating documentation,
   record source/completeness and timing comparisons against the previous GLM
   and cloud baselines, commit only intended source changes, push through the
   repository's verified production release path, and verify the deployed
   production artifact and a real conversion. Keep credentials and private CVs,
   generated documents, and regression artifacts out of Git.

## Acceptance criteria

- All detected source records have traceable, validated dispositions; unresolved
  extraction is not presented as complete.
- Source citation wording and continuation notes survive extraction and repair.
- Previously verified missing protocol records survive repeated fresh extraction.
- Completeness and classification are checked against source evidence, not raw
  cloud output counts alone. Cloud duplicates are not a target to reproduce.
- Deterministic and full five-CV live gates pass, with exact second-pass stability.
- Production points to the tested code and uses the authorized on-prem GLM route.

## Constraints

Preserve existing working-tree changes and unrelated untracked files. No cloud
fallback. Production publication is authorized by the user; failed release gates
must be fixed before publication. Record any remaining model-quality limitations
explicitly in the release evidence.

## Release evidence

Validated September 24, 2026 against the final preview candidate.

- Deterministic gate: route/retry, source-coverage (43 tests), and
  document-quality suites, TypeScript, lint, and production build pass.
- Five-CV live gate: both acceptance CVs and three additional UC San Diego
  faculty CVs completed every extraction section. Every check passed on both
  passes, and reprocessing reproduced each first-pass result exactly.
- Fresh-extraction repeatability: both acceptance CVs passed three
  independent fresh GLM extractions with the same acceptance profile.
- Source completeness: every detected bibliography source record was preserved
  in the final document for all five CVs (300, 223, 46, 88, and 25 records).

Comparison with earlier runs on the same CVs (bibliography records present with
their complete source wording):

| CV | Previous cloud routing | Earlier GLM | Source-verified GLM |
|---|---|---|---|
| Acceptance CV 1 | 298/300 | 299/300 | 300/300 |
| Acceptance CV 2 | 218/223 | 194/223 | 223/223 |
| Additional CV 1 | not run | 38/46 | 46/46 |
| Additional CV 2 | not run | 85/88 | 88/88 |
| Additional CV 3 | not run | 23/25 | 25/25 |

The cloud baseline retained every acceptance-CV record but shortened some
trailing annotations and produced known duplicates. It also predates the
current prompts, so it is not a same-code comparison.

First-pass conversion times: source-verified GLM took 264-458 seconds per CV
(acceptance CVs 264-373 and 359-451 seconds across three runs each), compared
with 336 and 394 seconds for the previous cloud routing and 193-297 seconds for
the earlier GLM build. The added batching, validation, and repair work costs time relative
to the earlier GLM build in exchange for complete source coverage.

Faults found and fixed during validation include citations split at editor
lists and wrapped DOIs, translation notes treated as separate records, singular
review-article headings, and records every section task declined. A record that
every task declines is now kept under other articles with a placement review
note; a record that no task accounts for still fails the conversion.

Remaining limitations: category placement is still model judgment and needs
faculty review, and record boundaries are inferred from document layout.
