/**
 * Regression test for the BioBib Formatter upload pipeline.
 *
 * Submits a .docx CV to a target deployment's /api/upload endpoint and
 * validates the round trip: response shape, section counts, and the
 * generated BioBib download.
 *
 * Usage:
 *   npm run test:regression -- path/to/cv.docx
 *   BIOBIB_URL=https://biobib-formatter.vercel.app npm run test:regression -- path/to/cv.docx
 *   BIOBIB_URL=http://localhost:3000 npm run test:regression -- path/to/cv.docx
 *
 * Exit code 0 = pass, 1 = fail. Designed to be CI-friendly.
 */

import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { MAX_FILE_SIZE_BYTES } from '../lib/constants';

const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

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

  const isVercelHost = /vercel\.app$/.test(new URL(baseUrl).hostname);
  if (isVercelHost) {
    record(
      'CV under Vercel serverless body limit (4.5 MB)',
      info.size <= VERCEL_BODY_LIMIT_BYTES,
      info.size > VERCEL_BODY_LIMIT_BYTES
        ? `${sizeMb.toFixed(2)} MB exceeds Vercel's 4.5 MB request-body cap; /api/upload will return 413 before the function runs.`
        : undefined,
    );
  }

  // ── 2. POST /api/upload ─────────────────────────────────────────────────
  const fileBytes = await readFile(absPath);
  const blob = new Blob([fileBytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const fd = new FormData();
  fd.append('file', blob, basename(absPath));

  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/upload`, { method: 'POST', body: fd });
  } catch (err) {
    record('POST /api/upload reached server', false, `fetch threw: ${(err as Error).message}`);
    finish();
    return;
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  record('POST /api/upload reached server', true, `${res.status} in ${elapsed}s`);

  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  record('Response Content-Type is JSON', isJson, contentType || '(none)');

  let body: unknown;
  const rawText = await res.text();
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
    record(
      'Response body parses as JSON',
      false,
      `non-JSON response — UI will trip "Network error. Please try again." in app/page.tsx:60`,
    );
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
      metadata?: { name?: string };
    };
  };

  record('Response has sessionId', typeof data.sessionId === 'string' && data.sessionId.length > 0);
  record('Response has result.sections', !!data.result?.sections);
  record('Response has result.gaps array', Array.isArray(data.result?.gaps));

  const s = data.result?.sections ?? {};
  const emp = (s.employment as unknown[] | undefined)?.length ?? 0;
  const edu = (s.education as unknown[] | undefined)?.length ?? 0;
  const pubs = (s.peerReviewedJournals as unknown[] | undefined)?.length ?? 0;
  record('Employment entries extracted', emp > 0, `${emp} entries`);
  record('Education entries extracted', edu > 0, `${edu} entries`);
  record('Peer-reviewed publications extracted', pubs > 0, `${pubs} entries`);

  // ── 3. GET /api/download/:sessionId/document ─────────────────────────────
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
