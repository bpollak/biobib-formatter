# BioBib Formatter

Converts UC San Diego faculty CVs (`.docx`) into UCSD Academic Biography and
Bibliography (BioBib) draft documents.

The app is a Next.js App Router application backed by Vercel Blob job storage
and UCSD TritonAI LiteLLM model routing. It is optimized for long CVs by
splitting extraction into independent BioBib section slices instead of running
one large model request.

Built by ITS Workplace Technology & Infrastructure Services.

## How It Works

1. A faculty member uploads a Word CV (`.docx`) in the browser.
2. The browser uploads the file directly to Vercel Blob through
   `POST /api/upload-token`.
3. The browser posts the Blob URL, file name, and optional review-period inputs
   to `POST /api/upload`.
4. The upload route validates the Blob URL, parses the CV with `mammoth`, stores
   `manifest.json`, `cv.txt`, and `cv-rich.json` under `jobs/<jobId>/`, and
   dispatches slice workers with `next/server` `after()`.
5. Each `POST /api/slice/[jobId]/[sliceKey]` worker extracts one BioBib slice
   through TritonAI LiteLLM and writes either `slice-<key>.json` or
   `slice-<key>.error` to Vercel Blob.
6. When all slices are terminal, `POST /api/finalize/[jobId]` merges successful
   slices, records partial failures, generates `biobib.docx`, writes
   `result.json` and `status.json`, and deletes parsed source CV text.
7. The client polls `GET /api/status/[jobId]` for slice progress and final
   result data, then downloads the final document from
   `GET /api/download/[jobId]`.

## Runtime Architecture

- `app/page.tsx` is the client workflow: upload, review-period controls,
  polling, recovery links, result summaries, gaps, review notes, and download.
- `app/api/upload-token/route.ts` mints client-direct Vercel Blob upload tokens.
- `app/api/upload/route.ts` is the public dispatcher and parser. It returns
  `202` quickly and starts background slice dispatch.
- `app/api/slice/[jobId]/[sliceKey]/route.ts` is an internal slice worker with a
  600 second function budget and 570 second model timeout.
- `app/api/finalize/[jobId]/route.ts` is an internal merge and DOCX generation
  worker guarded by a Blob-backed stale-recoverable lock.
- `app/api/status/[jobId]/route.ts` derives status from Blob keys and can kick
  finalize if all slices finished but finalize did not start.
- `app/api/download/[jobId]/route.ts` streams the final DOCX through the
  authenticated Blob SDK.
- `lib/pipeline/converter.ts` builds prompts, routes models, sanitizes JSON,
  merges slices, deduplicates records, sorts dated items, and adds review gaps.
- `lib/docx/reader.ts` extracts raw CV text and selected rich-text hints.
- `lib/docx/writer.ts` renders the final BioBib Word document.
- `lib/jobs/store.ts` is the Vercel Blob persistence layer.
- `lib/jobs/auth.ts` secures internal cross-function calls with
  `x-internal-secret`.

## Stack

- Next.js `16.2.1` App Router + TypeScript
- React `19.2.4`
- Material UI `7.3.9` with Emotion
- Vercel Blob for uploads, job state, locks, and generated artifacts
- `mammoth` for raw text extraction from uploaded CVs
- `jszip` for DOCX XML inspection and rich-text hint extraction
- `docx` for BioBib Word document generation
- UCSD TritonAI LiteLLM Gateway for model calls
- Vercel for deployment

## Model Routing

The pipeline has 20 shared slice keys in `lib/pipeline/slices.ts`. High-fidelity
sections, including Section I, teaching, journals, and key publication slices,
prefer the cloud model first and then fall back to the on-prem model. More
mechanical extraction slices prefer the on-prem model first and then fall back
to the cloud model.

Defaults:

- Cloud model: `gpt-5.5`
- On-prem fallback model: `api-gpt-oss-120b`
- Cloud completion cap: 12,000 tokens
- On-prem completion cap: 16,000 tokens unless `LITELLM_ON_PREM_MAX_TOKENS` is
  set

## Job State

All durable job state is stored in Vercel Blob under `jobs/<jobId>/`.

- `manifest.json`: input filename, expected slice keys, creation time, source
  Blob URL, model routing label, `sinceYear`, and `reviewPeriodStart`.
- `cv.txt`: parsed CV text used by slice workers.
- `cv-rich.json`: rich-text paragraph hints used by DOCX generation.
- `slice-<key>.json`: successful slice result.
- `slice-<key>.error`: terminal slice failure.
- `finalize.lock`: Blob-backed lock used by finalize.
- `result.json`: merged `ConversionResult` returned by status polling.
- `biobib.docx`: generated BioBib document.
- `status.json`: terminal status marker written last.

`cv.txt` and `cv-rich.json` are deleted after a terminal finalize because they
contain the most sensitive source CV data. Final outputs and slice metadata do
not currently have an automatic retention policy in this repo.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `LITELLM_API_KEY` | One provider key required | Cloud TritonAI LiteLLM provider API key. |
| `LITELLM_ON_PREM_API_KEY` | One provider key required | On-prem TritonAI LiteLLM provider API key. |
| `LITELLM_BASE_URL` | No | Gateway URL. Defaults to `https://tritonai-api.ucsd.edu`. |
| `LITELLM_MODEL` | No | Cloud model. Defaults to `gpt-5.5`. |
| `LITELLM_ON_PREM_MODEL` | No | On-prem model. Defaults to `api-gpt-oss-120b`. |
| `LITELLM_ON_PREM_MAX_TOKENS` | No | On-prem completion cap. Defaults to `16000`. |
| `LITELLM_ROUTING_LABEL` | No | Display label stored in job manifests. |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob token for server-side Blob access and regression scripts. |
| `INTERNAL_API_SECRET` | Yes | Shared secret for upload, slice, and finalize route calls. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | No | Vercel Deployment Protection bypass header for internal fetches. |
| `BIOBIB_URL` | Tests only | Target URL for regression/e2e scripts. |

## Local Development

```bash
cp .env.example .env.local
# Fill in at least one LiteLLM provider key, BLOB_READ_WRITE_TOKEN, and INTERNAL_API_SECRET.
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validation

```bash
npm run lint
npm run typecheck
npm run build
npm run test:docx-quality
```

Run the full async pipeline against a real `.docx`:

```bash
BLOB_READ_WRITE_TOKEN=... npm run test:regression -- path/to/cv.docx
```

Run the tokenless deployed-app flow from a CV text dump:

```bash
BIOBIB_URL=https://biobib-formatter.vercel.app \
  npm run test:e2e-prod -- path/to/cv.txt output-name 2020
```

For production regressions, use the deployed URL explicitly:

```bash
BIOBIB_URL=https://biobib-formatter.vercel.app \
  BLOB_READ_WRITE_TOKEN=... \
  npm run test:regression -- path/to/cv.docx
```

## Deployment

Pushes to `main` auto-deploy through Vercel. Set the runtime environment
variables in the Vercel project, and link a Vercel Blob store so
`BLOB_READ_WRITE_TOKEN` is available to serverless functions.

The production URL used by the validation scripts defaults to
`https://biobib-formatter.vercel.app`.

## Current Security Boundaries

- Uploads are limited to `.docx` files and the official Word MIME type.
- Source upload URLs must be HTTPS Vercel public Blob URLs and cannot point
  under `/jobs/`.
- Internal worker and finalize routes require `x-internal-secret`.
- Status and download routes are public-by-jobId. The UUID jobId is the access
  capability.
- Downloads stream through authenticated Blob SDK reads because raw public CDN
  fetches can be blocked by Vercel Deployment Protection.

## Source Materials

- BioBib instructions:
  https://academicaffairs.ucsd.edu/_files/aps/forms/word/BioBib-instructions.docx
- APS forms:
  https://aps.ucsd.edu/tools/forms.html#appointment-for
- Based on dissertation-formatter architecture
