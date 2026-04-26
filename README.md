# Dissertation Formatting Agent

A Next.js web app that checks UC San Diego dissertations and master's theses
against the GEPA formatting requirements. Validates 80+ rules across margins,
fonts, pagination, page order, abstract, references, accessibility, and more,
and auto-fixes the ones that can be applied mechanically.

Built on Next.js 16 + React 19, MUI, JSZip for `.docx` parsing,
and `pdf-lib` for the client-side compliance report.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local       # then fill in BLOB_READ_WRITE_TOKEN
npm run dev
```

Open <http://localhost:3000>.

### Required environment variable

| Variable                | Where to get it                                                            |
| ----------------------- | -------------------------------------------------------------------------- |
| `BLOB_READ_WRITE_TOKEN` | Vercel dashboard → Storage → your Blob store → "Read-Write Token". Used for direct-from-browser uploads (the 50 MB cap exceeds Vercel's 4.5 MB serverless body limit). |

## Scripts

| Command                    | Purpose                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `npm run dev`              | Local dev server with hot reload.                                  |
| `npm run build`            | Production build (Turbopack).                                      |
| `npm run start`            | Serve the production build.                                        |
| `npm run lint`             | ESLint over the project.                                           |
| `npm run lint:fix`         | ESLint with autofix.                                               |
| `npm run typecheck`        | `tsc --noEmit`.                                                    |
| `npm run test:regression`  | Run the full pipeline against the supplied dissertation fixtures and assert 7 invariants per fixture (round-trip validation, valid OOXML output, attribution correctness, etc.). |

## Architecture

```
app/
  page.tsx              # upload form + indeterminate processing view
  results/page.tsx      # three-bucket results view + download
  about/page.tsx        # rule reference + FAQ
  api/blob-upload/      # signs a one-shot upload token for the browser
  api/check/            # parse → validate → auto-fix → return JSON + corrected blob URL

lib/
  pipeline/
    parser.ts           # OOXML → DocumentModel
    validator.ts        # DocumentModel → RuleResult[] + buildValidationResults()
    fixer.ts            # RuleResult[] → corrected docx (dispatches by rule ID)
    reporter-client.ts  # ValidationResults → PDF (runs in the browser via pdf-lib)
  rules/                # one file per rule category; each exports FormattingRule[]
  docx/
    reader.ts           # OOXML extraction helpers
    writer.ts           # OOXML mutation helpers used by the auto-fixer
  types.ts              # shared types

components/             # MUI presentational components
theme/                  # MUI theme + UCSD palette
scripts/regression-test.ts
```

### Request flow

1. Browser uploads `.docx` directly to Vercel Blob via a one-time token from
   `/api/blob-upload` (this bypasses the 4.5 MB serverless body limit).
2. Browser POSTs `{ blobUrl, ... }` to `/api/check`.
3. The route fetches the blob, runs `parseDocument` → `validateDocument` →
   `applyAutoFixes` → `buildValidationResults`, uploads the corrected file
   back to Blob, deletes the original blob, and returns the results JSON
   plus a URL for the corrected file.
4. Browser stashes the JSON in `sessionStorage` and navigates to `/results`,
   which renders the three-bucket view and generates the PDF report
   client-side from `lib/pipeline/reporter-client.ts`.

There is no persistent server-side session; everything is per-request.

## Adding a new rule

1. Add the rule object to the appropriate file in `lib/rules/`.
2. If `autoFixable: true`, also add a dispatch case in `lib/pipeline/fixer.ts`
   and the underlying writer in `lib/docx/writer.ts`.
3. Add a row to `app/about/page.tsx` so it shows up in the public rule list.
4. Run `npm run test:regression`. If your auto-fixer is partial, the round-trip
   check will flag it.

## Limitations

- Vercel Blob URLs for corrected files are public-read with random suffixes.
  Treat URLs as bearer tokens; consider migrating to private/signed URLs if
  you need stronger guarantees.
- The fake progress bar was removed in favor of an honest indeterminate
  spinner. Adding server-streamed progress would require switching `/api/check`
  to a streaming response.
- Multi-page table detection is heuristic (`rows > 25 || hasHeaderRow`)
  because OOXML doesn't store page boundaries.
