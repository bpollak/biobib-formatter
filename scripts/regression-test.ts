/**
 * Regression test for the BioBib Formatter upload pipeline.
 *
 * Mirrors the browser flow:
 *   1. Upload the .docx CV directly to Vercel Blob using a server-side
 *      `put()` (requires BLOB_READ_WRITE_TOKEN).
 *   2. POST { blobUrl, fileName } to /api/upload and validate the result.
 *   3. Download the generated BioBib and verify it's a valid .docx.
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=... npm run test:regression -- path/to/cv.docx
 *   BIOBIB_URL=https://biobib-formatter.vercel.app BLOB_READ_WRITE_TOKEN=... \
 *     npm run test:regression -- path/to/cv.docx
 *
 * Exit code 0 = pass, 1 = fail.
 */

import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { put, del } from '@vercel/blob';
import { MAX_FILE_SIZE_BYTES } from '../lib/constants';

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

const checks: Check[] = [];
const record = (name: string, pass: boolean, detail?: string) => {
  checks.push({ name, pass, detail });
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  const cvPath = process.argv[2];
  if (!cvPath) {
    console.error('Usage: npm run test:regression -- <path-to-cv.docx>');
    process.exit(2);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('BLOB_READ_WRITE_TOKEN must be set (pull from Vercel: `vercel env pull`).');
    process.exit(2);
  }

  const absPath = resolve(cvPath);
  const baseUrl = (process.env.BIOBIB_URL || 'http://localhost:3000').replace(/\/$/, '');
  console.log(`Target: ${baseUrl}`);
  console.log(`CV:     ${absPath}\n`);

  // ── 1. Pre-flight file checks ────────────────────────────────────────────
  const info = await stat(absPath);
  const sizeMb = info.size / 1024 / 1024;
  record(
    'CV file exists and is .docx',
    absPath.endsWith('.docx') && info.isFile(),
    `${sizeMb.toFixed(2)} MB`,
  );
  record(
    `CV under app size limit (${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)`,
    info.size <= MAX_FILE_SIZE_BYTES,
  );

  // ── 2. Upload to Vercel Blob ─────────────────────────────────────────────
  const fileBytes = await readFile(absPath);
  let blobUrl: string;
  try {
    const blob = await put(basename(absPath), fileBytes, {
      access: 'public',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      addRandomSuffix: true,
    });
    blobUrl = blob.url;
    record('Uploaded CV to Vercel Blob', true, blobUrl);
  } catch (e) {
    record('Uploaded CV to Vercel Blob', false, (e as Error).message);
    finish();
    return;
  }

  // ── 3. POST blobUrl to /api/upload ───────────────────────────────────────
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blobUrl, fileName: basename(absPath) }),
    });
  } catch (e) {
    record('POST /api/upload reached server', false, `fetch threw: ${(e as Error).message}`);
    await del(blobUrl).catch(() => {});
    finish();
    return;
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  record('POST /api/upload reached server', true, `${res.status} in ${elapsed}s`);

  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  record('Response Content-Type is JSON', isJson, contentType || '(none)');

  const rawText = await res.text();
  let body: unknown;
  if (isJson) {
    try {
      body = JSON.parse(rawText);
    } catch (e) {
      record('Response body parses as JSON', false, (e as Error).message);
      console.error('--- raw body (first 500 chars) ---');
      console.error(rawText.slice(0, 500));
      finish();
      return;
    }
  } else {
    record('Response body parses as JSON', false, 'non-JSON response');
    console.error('--- raw body (first 500 chars) ---');
    console.error(rawText.slice(0, 500));
    finish();
    return;
  }

  if (!res.ok) {
    const errMsg = (body as { error?: string }).error ?? '(no error field)';
    record(`HTTP 2xx from /api/upload`, false, `status ${res.status}: ${errMsg}`);
    finish();
    return;
  }
  record('HTTP 2xx from /api/upload', true);

  const data = body as {
    sessionId?: string;
    result?: {
      sections?: Record<string, unknown[]>;
      gaps?: unknown[];
    };
  };

  record('Response has sessionId', typeof data.sessionId === 'string' && data.sessionId.length > 0);
  record('Response has result.sections', !!data.result?.sections);
  record('Response has result.gaps array', Array.isArray(data.result?.gaps));

  const s = data.result?.sections ?? {};
  const emp = (s.employment as unknown[] | undefined)?.length ?? 0;
  const edu = (s.education as unknown[] | undefined)?.length ?? 0;
  const pubs = (s.peerReviewedJournals as unknown[] | undefined)?.length ?? 0;
  const otherPubs =
    ((s.reviewAndInvited as unknown[] | undefined)?.length ?? 0) +
    ((s.books as unknown[] | undefined)?.length ?? 0) +
    ((s.chapters as unknown[] | undefined)?.length ?? 0) +
    ((s.refereedProceedings as unknown[] | undefined)?.length ?? 0) +
    ((s.otherProceedings as unknown[] | undefined)?.length ?? 0) +
    ((s.abstracts as unknown[] | undefined)?.length ?? 0) +
    ((s.popularWorks as unknown[] | undefined)?.length ?? 0) +
    ((s.additionalProducts as unknown[] | undefined)?.length ?? 0);
  const sectionII =
    ((s.universityService as unknown[] | undefined)?.length ?? 0) +
    ((s.awards as unknown[] | undefined)?.length ?? 0) +
    ((s.grants as unknown[] | undefined)?.length ?? 0) +
    ((s.teaching as unknown[] | undefined)?.length ?? 0);

  record('Employment entries extracted', emp > 0, `${emp} entries`);
  record('Education entries extracted', edu > 0, `${edu} entries`);
  record('Peer-reviewed publications extracted', pubs > 0, `${pubs} entries`);
  record('Section II content extracted (any of service/awards/grants/teaching)', sectionII > 0, `${sectionII} entries`);
  record('Section III non-journal publications extracted', otherPubs > 0, `${otherPubs} entries`);
  record('Conversion completed within 180s (parallel-chunked target)', Number(elapsed) < 180, `${elapsed}s`);

  // ── 4. GET /api/download/:sessionId/document ─────────────────────────────
  if (data.sessionId) {
    const dl = await fetch(`${baseUrl}/api/download/${data.sessionId}/document`);
    record('Download endpoint returns 2xx', dl.ok, `status ${dl.status}`);
    if (dl.ok) {
      const buf = Buffer.from(await dl.arrayBuffer());
      const isDocx = buf.slice(0, 2).toString('hex') === '504b'; // PK zip header
      record('Downloaded file is a valid .docx (zip signature)', isDocx, `${buf.length} bytes`);
    }
  }

  finish();
}

function finish() {
  const failed = checks.filter(c => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const c of failed) console.log(`  - ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
