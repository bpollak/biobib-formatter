/**
 * Tokenless end-to-end test against a deployed instance.
 *
 * Builds a .docx from a plain-text CV dump, uploads it through the deployed
 * app's own client-upload flow (/api/upload-token — no BLOB_READ_WRITE_TOKEN
 * needed, unlike scripts/regression-test.ts), runs the full conversion,
 * downloads the BioBib, and applies the same remediation checks as the
 * regression test. Artifacts are written to /tmp.
 *
 * Usage:
 *   npm run test:e2e-prod -- <cv-text-file> <output-name> [sinceYear]
 *   BIOBIB_URL=https://my-preview.vercel.app npm run test:e2e-prod -- cv.txt smith-cv 2020
 */

import { readFile, writeFile } from 'node:fs/promises';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { upload } from '@vercel/blob/client';
import JSZip from 'jszip';

const BASE = (process.env.BIOBIB_URL || 'https://biobib-formatter.vercel.app').replace(/\/$/, '');
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 14 * 60 * 1000;

const checks: { name: string; pass: boolean; detail?: string }[] = [];
function record(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function segmentCvText(raw: string): string[] {
  // SharePoint text extraction collapses paragraph breaks into runs of
  // spaces; treat 2+ whitespace chars as a paragraph boundary.
  return raw
    .replace(/\r/g, '')
    .split(/\n|\s{2,}/)
    .map(s => s.trim())
    .filter(Boolean);
}

async function buildDocx(paragraphs: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      children: paragraphs.map(text => new Paragraph({ children: [new TextRun({ text })] })),
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function docxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('word/document.xml missing');
  return documentXml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .trim();
}

async function main() {
  const [textPath, outName, sinceYearArg] = process.argv.slice(2);
  if (!textPath || !outName) {
    console.error('Usage: npm run test:e2e-prod -- <cv-text-file> <output-name> [sinceYear]');
    process.exit(2);
  }
  const sinceYear = sinceYearArg ? Number(sinceYearArg) : undefined;
  if (sinceYear !== undefined && !Number.isInteger(sinceYear)) {
    console.error(`Invalid sinceYear: ${sinceYearArg}`);
    process.exit(2);
  }

  console.log(`Target: ${BASE}${sinceYear ? ` (review period: since ${sinceYear})` : ''}`);
  const rawText = await readFile(textPath, 'utf8');
  const paragraphs = segmentCvText(rawText);
  record('CV text segmented', paragraphs.length > 50, `${paragraphs.length} paragraphs, ${rawText.length} chars`);

  const docxBuffer = await buildDocx(paragraphs);
  const fileName = `${outName}.docx`;
  await writeFile(`/tmp/${fileName}`, docxBuffer);
  record('Test CV .docx built', docxBuffer.length > 10_000, `${(docxBuffer.length / 1024).toFixed(0)} KB`);

  // 1. Client-direct upload via the app's public token endpoint.
  let blobUrl: string;
  try {
    const blob = await upload(fileName, new Blob([new Uint8Array(docxBuffer)]), {
      access: 'public',
      handleUploadUrl: `${BASE}/api/upload-token`,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    blobUrl = blob.url;
    record('Client upload via /api/upload-token', true, blobUrl);
  } catch (e) {
    record('Client upload via /api/upload-token', false, (e as Error).message);
    return finish();
  }

  // 2. Dispatch.
  const tUpload = Date.now();
  const upRes = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blobUrl, fileName, sinceYear }),
  });
  const uploadElapsed = (Date.now() - tUpload) / 1000;
  const upBody = (await upRes.json()) as { jobId?: string; error?: string };
  record('POST /api/upload accepted', upRes.ok && !!upBody.jobId, `${upRes.status} in ${uploadElapsed.toFixed(2)}s${upBody.error ? ` — ${upBody.error}` : ''}`);
  record('Dispatcher responds fast (<5s)', uploadElapsed < 5);
  if (!upBody.jobId) return finish();
  const jobId = upBody.jobId;
  console.log(`jobId: ${jobId}`);

  // 3. Poll to terminal state.
  const tPoll = Date.now();
  let last: { state: string; slices: Record<string, string>; error?: string; result?: { sections?: Record<string, unknown[]>; gaps?: unknown[] } } | null = null;
  const seen = new Set<string>();
  while (Date.now() - tPoll < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    const r = await fetch(`${BASE}/api/status/${jobId}`, { cache: 'no-store' });
    if (!r.ok) continue;
    last = await r.json();
    if (!last) continue;
    for (const [k, st] of Object.entries(last.slices ?? {})) {
      const key = `${k}:${st}`;
      if (st !== 'pending' && !seen.has(key)) {
        seen.add(key);
        console.log(`  [${((Date.now() - tPoll) / 1000).toFixed(0)}s] ${k} → ${st}`);
      }
    }
    if (last.state !== 'pending' && last.state !== 'merging') break;
  }
  const pollElapsed = (Date.now() - tPoll) / 1000;
  record('Reached terminal status', !!last && last.state !== 'pending' && last.state !== 'merging', `state=${last?.state} in ${pollElapsed.toFixed(0)}s`);
  record('Job did not totally fail', last?.state !== 'failed', last?.error ?? '');
  if (!last || last.state === 'failed') return finish();

  const sec = last.result?.sections ?? {};
  const count = (k: string) => (sec[k] as unknown[] | undefined)?.length ?? 0;
  record('Employment extracted', count('employment') > 0, `${count('employment')}`);
  record('Education extracted', count('education') > 0, `${count('education')}`);
  record('Peer-reviewed journals extracted', count('peerReviewedJournals') > 0, `${count('peerReviewedJournals')}`);
  const sectionII = ['universityService', 'memberships', 'awards', 'grants', 'teaching', 'studentInstructionalGroups', 'externalProfessionalActivities', 'presentations'].reduce((n, k) => n + count(k), 0);
  record('Section II content extracted', sectionII > 0, `${sectionII} entries`);
  record('Gaps array present', Array.isArray(last.result?.gaps), `${last.result?.gaps?.length ?? 0} gaps`);

  // 4. Download + remediation checks on the generated BioBib.
  const dl = await fetch(`${BASE}/api/download/${jobId}`);
  record('Download returns 2xx', dl.ok, `status ${dl.status}`);
  if (dl.ok) {
    const buf = Buffer.from(await dl.arrayBuffer());
    const isDocx = buf.subarray(0, 2).toString('hex') === '504b';
    record('Output is valid .docx (zip signature)', isDocx, `${(buf.length / 1024).toFixed(0)} KB`);
    const disposition = dl.headers.get('content-disposition') ?? '';
    record('Download filename derived from upload', disposition.includes(`${outName}-biobib.docx`), disposition);
    if (isDocx) {
      await writeFile(`/tmp/${outName}-biobib.docx`, buf);
      const text = await docxText(buf);
      record('No source-number metadata leaked', !/\bsource\s+no\.?\b/i.test(text));
      record('No BioBib-section metadata leaked', !/\bBioBib section:/i.test(text));
      record('No review-material metadata leaked', !/\breview material:/i.test(text));
      record('No duplicate article labels', !/\bARTICLE\s+ARTICLE\b/i.test(text));
      record('Blank cells remediated with "Not listed"', text.includes('Not listed'));
      record('All BioBib top-level sections present', ['Section I: Employment History and Education', 'Section II: Professional Data', 'Section III – Bibliography', 'C. Work in Progress'].every(h => text.includes(h)));
    }
  }
  finish();
}

function finish() {
  const failed = checks.filter(c => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length) {
    console.log('Failures:');
    for (const c of failed) console.log(`  - ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
