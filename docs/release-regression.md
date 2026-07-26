# Release Regression Procedure

This is the required verification procedure for BioBib changes. A change is not
ready to merge or deploy until the applicable gates below pass.

## 1. Every change: deterministic release gate

Run this for every code, configuration, dependency, documentation, or test
change:

```bash
npm run test:release
```

The command runs the document-quality regression suite, TypeScript checks,
linting, and a production build. GitHub Actions runs the same command on every
pull request and every push to `main`.

## 2. Conversion-affecting changes: live real-CV gate

Run this after deploying a preview or production candidate whenever a change can
affect CV parsing, prompts, model routing, classification, merge cleanup, dates,
review-period behavior, job orchestration, status, download, or generated Word
output.

The two named environment variables point to private local copies of the source
CVs supplied for acceptance testing. Do not commit the CVs or generated
documents.

```bash
BIOBIB_URL=https://biobib-formatter.vercel.app \
BLOB_READ_WRITE_TOKEN='...' \
CONTINETTI_CV_PATH='/absolute/path/to/Continetti source CV.docx' \
NIEH_CV_PATH='/absolute/path/to/Nieh source CV.docx' \
npm run test:release:live
```

The live gate automatically:

1. Sends each source CV through the deployed application.
2. Verifies all extraction slices, status responses, and generated DOCX files.
3. Applies the documented semantic acceptance profile to the first output.
4. Uploads that generated output again.
5. Verifies that every structured section, completion gap, and placement note is
   unchanged on the second pass.
6. Applies the same semantic acceptance profile to the second output.
7. Exercises an exact `2020-01-01` review-period cutoff and confirms it survives
   in the structured result and Word document.

The semantic profiles cover the previously documented honors and honorific
appointments, distinct visiting-professor years, refereed-proceedings placement,
abstract/presentation deduplication, full presentation dates, and removal of
inherited abstract numbering.

## 3. Material pipeline releases: five-CV cohort

For prompt, model, extraction, classification, deduplication, or Word-generation
changes, include at least three additional representative UC San Diego faculty
CVs so the live release cohort contains five or more CVs:

```bash
BIOBIB_ADDITIONAL_CV_PATHS="$(printf '%s\n' \
  '/absolute/path/to/additional-cv-1.docx' \
  '/absolute/path/to/additional-cv-2.docx' \
  '/absolute/path/to/additional-cv-3.docx')" \
BIOBIB_URL=https://biobib-formatter.vercel.app \
BLOB_READ_WRITE_TOKEN='...' \
CONTINETTI_CV_PATH='/absolute/path/to/Continetti source CV.docx' \
NIEH_CV_PATH='/absolute/path/to/Nieh source CV.docx' \
npm run test:release:live
```

Choose a varied cohort with long and short CVs, publication-heavy and
service-heavy records, and at least one CV with detailed presentations or
conference abstracts. Each additional CV receives the same end-to-end and
second-pass checks, while the two acceptance CVs also receive their exact
semantic profiles.

## Pass criteria and evidence

- Every command exits with status 0.
- The live runner reports no failed slices or profile checks on either pass.
- The second pass exactly preserves sections, gaps, and placement notes.
- Save the live job IDs and the temporary artifact/report directory in the pull
  request or release record.
- If any check fails, stop the release, preserve the artifacts, fix or explicitly
  investigate the difference, then rerun the entire applicable gate.

Pure copy or documentation changes may omit the live gate, but the deterministic
gate still applies. Record the reason whenever a required live gate is skipped.
