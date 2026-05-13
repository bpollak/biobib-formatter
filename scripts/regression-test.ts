/**
 * Regression test for the BioBib Formatter async pipeline.
 *
 * Mirrors the browser flow:
 *   1. Upload the .docx CV directly to Vercel Blob via server-side put()
 *      (requires BLOB_READ_WRITE_TOKEN).
 *   2. POST { blobUrl, fileName } to /api/upload → expect { jobId } in <2s.
 *   3. Poll /api/status/<jobId> every 3s up to 12 minutes until terminal.
 *   4. Download /api/download/<jobId> and verify the .docx zip signature.
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
import { put } from '@vercel/blob';
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

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 12 * 60 * 1000;

type SliceKey =
  | 'meta_and_I'
  | 'II_service'
  | 'II_teaching_grants'
  | 'II_other'
  | 'III_journals_early'
  | 'III_journals_late'
  | 'III_other_a'
  | 'III_other_proc'
  | 'III_abstracts'
  | 'III_popular_products';
type SliceState = 'pending' | 'done' | 'failed';

interface StatusResponse {
  state: 'pending' | 'merging' | 'complete' | 'failed' | 'failed_partial';
  slices: Record<SliceKey, SliceState>;
  result?: {
    sections?: Record<string, unknown[]>;
    gaps?: unknown[];
  };
  error?: string;
  startedAt: number;
}

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

  // 1. File checks
  const info = await stat(absPath);
  const sizeMb = info.size / 1024 / 1024;
  record('CV file exists and is .docx', absPath.endsWith('.docx') && info.isFile(), `${sizeMb.toFixed(2)} MB`);
  record(`CV under app size limit (${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)`, info.size <= MAX_FILE_SIZE_BYTES);

  // 2. Upload to Vercel Blob (simulating the browser client-direct upload)
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

  // 3. POST /api/upload — should return jobId quickly
  const tUpload = Date.now();
  let upRes: Response;
  try {
    upRes = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blobUrl, fileName: basename(absPath) }),
    });
  } catch (e) {
    record('POST /api/upload reached server', false, `fetch threw: ${(e as Error).message}`);
    finish();
    return;
  }
  const uploadElapsed = ((Date.now() - tUpload) / 1000);
  record('POST /api/upload reached server', true, `${upRes.status} in ${uploadElapsed.toFixed(2)}s`);
  record('Upload response is fast (<5s) — dispatcher only, no AI', uploadElapsed < 5);

  const upBody = (await upRes.json()) as { jobId?: string; error?: string };
  if (!upRes.ok || !upBody.jobId) {
    record('Response has jobId', false, upBody.error ?? '(no error field)');
    finish();
    return;
  }
  record('Response has jobId', true, upBody.jobId);
  const jobId = upBody.jobId;

  // 4. Poll /api/status until terminal
  console.log('\nPolling /api/status...');
  const tPoll = Date.now();
  let lastStatus: StatusResponse | null = null;
  const printedSliceTransitions = new Set<string>();

  while (Date.now() - tPoll < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    const r = await fetch(`${baseUrl}/api/status/${jobId}`, { cache: 'no-store' });
    if (!r.ok) {
      record('Status endpoint reachable', false, `status ${r.status}`);
      finish();
      return;
    }
    const s = (await r.json()) as StatusResponse;
    lastStatus = s;

    for (const [k, st] of Object.entries(s.slices)) {
      const key = `${k}:${st}`;
      if (st !== 'pending' && !printedSliceTransitions.has(key)) {
        printedSliceTransitions.add(key);
        const elapsed = ((Date.now() - tPoll) / 1000).toFixed(1);
        console.log(`       [${elapsed}s] slice "${k}" → ${st}`);
      }
    }

    if (s.state !== 'pending' && s.state !== 'merging') break;
  }

  if (!lastStatus) {
    record('Reached terminal status', false, 'no status received');
    finish();
    return;
  }

  const pollElapsed = ((Date.now() - tPoll) / 1000);
  record('Reached terminal status', lastStatus.state !== 'pending' && lastStatus.state !== 'merging',
    `state=${lastStatus.state} in ${pollElapsed.toFixed(1)}s`);

  record('Job completed without total failure', lastStatus.state !== 'failed',
    lastStatus.state === 'failed' ? lastStatus.error ?? '(no error message)' : '');

  if (lastStatus.state === 'failed') {
    finish();
    return;
  }

  record('Response has result.sections', !!lastStatus.result?.sections);
  record('Response has result.gaps array', Array.isArray(lastStatus.result?.gaps));

  const sec = lastStatus.result?.sections ?? {};
  const emp = (sec.employment as unknown[] | undefined)?.length ?? 0;
  const edu = (sec.education as unknown[] | undefined)?.length ?? 0;
  const pubs = (sec.peerReviewedJournals as unknown[] | undefined)?.length ?? 0;
  const otherPubs =
    ((sec.reviewAndInvited as unknown[] | undefined)?.length ?? 0) +
    ((sec.books as unknown[] | undefined)?.length ?? 0) +
    ((sec.chapters as unknown[] | undefined)?.length ?? 0) +
    ((sec.refereedProceedings as unknown[] | undefined)?.length ?? 0) +
    ((sec.otherProceedings as unknown[] | undefined)?.length ?? 0) +
    ((sec.abstracts as unknown[] | undefined)?.length ?? 0) +
    ((sec.popularWorks as unknown[] | undefined)?.length ?? 0) +
    ((sec.additionalProducts as unknown[] | undefined)?.length ?? 0);
  const sectionII =
    ((sec.universityService as unknown[] | undefined)?.length ?? 0) +
    ((sec.awards as unknown[] | undefined)?.length ?? 0) +
    ((sec.grants as unknown[] | undefined)?.length ?? 0) +
    ((sec.teaching as unknown[] | undefined)?.length ?? 0);

  record('Employment entries extracted', emp > 0, `${emp} entries`);
  record('Education entries extracted', edu > 0, `${edu} entries`);
  record('Peer-reviewed publications extracted', pubs > 0, `${pubs} entries`);
  record('Section II content extracted', sectionII > 0, `${sectionII} entries`);
  record('Section III non-journal publications extracted', otherPubs > 0, `${otherPubs} entries`);

  // 5. Download
  const dl = await fetch(`${baseUrl}/api/download/${jobId}`);
  record('Download endpoint returns 2xx', dl.ok, `status ${dl.status}`);
  if (dl.ok) {
    const buf = Buffer.from(await dl.arrayBuffer());
    const isDocx = buf.slice(0, 2).toString('hex') === '504b';
    record('Downloaded file is a valid .docx (zip signature)', isDocx, `${buf.length} bytes`);
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
