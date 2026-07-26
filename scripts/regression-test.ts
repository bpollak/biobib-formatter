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
 *   BLOB_READ_WRITE_TOKEN=... npm run test:regression -- path/to/cv.docx --roundtrip
 *   BIOBIB_URL=https://biobib-formatter.vercel.app BLOB_READ_WRITE_TOKEN=... \
 *     npm run test:regression -- path/to/cv.docx
 *
 * Exit code 0 = pass, 1 = fail.
 */

import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { put } from '@vercel/blob';
import JSZip from 'jszip';
import { MAX_FILE_SIZE_BYTES } from '../lib/constants';
import {
  normalizeRecordForComparison,
  normalizeServiceRecordForComparison,
} from '../lib/text-utils';

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
  | 'II_service_pre_2010'
  | 'II_service_2011_2020'
  | 'II_service_post_2020'
  | 'II_memberships_awards'
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

interface PipelineRun {
  jobId: string;
  status: StatusResponse;
  output: Buffer;
}

async function main() {
  const args = process.argv.slice(2);
  const roundtrip = args.includes('--roundtrip');
  const cvPath = args.find(arg => arg !== '--roundtrip');
  if (!cvPath) {
    console.error('Usage: npm run test:regression -- <path-to-cv.docx> [--roundtrip]');
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
  if (roundtrip) {
    record(
      'Roundtrip first pass completed every extraction slice',
      lastStatus.state === 'complete',
      `state=${lastStatus.state}`,
    );
  }

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
    ((sec.otherArticles as unknown[] | undefined)?.length ?? 0) +
    ((sec.otherProceedings as unknown[] | undefined)?.length ?? 0) +
    ((sec.abstracts as unknown[] | undefined)?.length ?? 0) +
    ((sec.popularWorks as unknown[] | undefined)?.length ?? 0) +
    ((sec.additionalProducts as unknown[] | undefined)?.length ?? 0) +
    ((sec.theses as unknown[] | undefined)?.length ?? 0) +
    ((sec.patents as unknown[] | undefined)?.length ?? 0);
  const sectionII =
    ((sec.universityService as unknown[] | undefined)?.length ?? 0) +
    ((sec.memberships as unknown[] | undefined)?.length ?? 0) +
    ((sec.awards as unknown[] | undefined)?.length ?? 0) +
    ((sec.grants as unknown[] | undefined)?.length ?? 0) +
    ((sec.teaching as unknown[] | undefined)?.length ?? 0) +
    ((sec.studentInstructionalActivities as unknown[] | undefined)?.length ?? 0) +
    ((sec.studentInstructionalGroups as unknown[] | undefined)?.length ?? 0) +
    ((sec.externalProfessionalActivities as unknown[] | undefined)?.length ?? 0) +
    ((sec.presentations as unknown[] | undefined)?.length ?? 0);

  record('Employment entries extracted', emp > 0, `${emp} entries`);
  record('Education entries extracted', edu > 0, `${edu} entries`);
  record('Peer-reviewed publications extracted', pubs > 0, `${pubs} entries`);
  record('Section II content extracted', sectionII > 0, `${sectionII} entries`);
  record('Section III non-journal publications extracted', otherPubs > 0, `${otherPubs} entries`);

  // 5. Download
  const dl = await fetch(`${baseUrl}/api/download/${jobId}`);
  record('Download endpoint returns 2xx', dl.ok, `status ${dl.status}`);
  let firstPassOutput: Buffer | undefined;
  if (dl.ok) {
    const buf = Buffer.from(await dl.arrayBuffer());
    const isDocx = buf.slice(0, 2).toString('hex') === '504b';
    record('Downloaded file is a valid .docx (zip signature)', isDocx, `${buf.length} bytes`);
    if (isDocx) {
      firstPassOutput = buf;
      const outputText = await docxText(buf);
      record('Generated DOCX does not expose source-number metadata', !/\bsource\s+no\.?\b/i.test(outputText));
      record('Generated DOCX does not expose BioBib section metadata', !/\bBioBib section:/i.test(outputText));
      record('Generated DOCX does not expose review-material metadata', !/\breview material:/i.test(outputText));
      record('Generated DOCX does not render duplicate article labels', !/\bARTICLE\s+ARTICLE\b/i.test(outputText));
      record('Generated DOCX uses explicit review text for unavailable table values', outputText.includes('Not listed'));
    }
  }

  if (
    roundtrip &&
    lastStatus.state === 'complete' &&
    firstPassOutput &&
    lastStatus.result?.sections
  ) {
    await runRoundtripVerification({
      baseUrl,
      sourcePath: absPath,
      firstPass: {
        jobId,
        status: lastStatus,
        output: firstPassOutput,
      },
    });
  } else if (roundtrip && lastStatus.state === 'complete') {
    record('Roundtrip verification could start', false, 'first-pass output or sections missing');
  }

  finish();
}

async function runRoundtripVerification({
  baseUrl,
  sourcePath,
  firstPass,
}: {
  baseUrl: string;
  sourcePath: string;
  firstPass: PipelineRun;
}): Promise<void> {
  console.log('\nRoundtrip verification: submitting the generated DOCX again...');
  const sourceStem = basename(sourcePath, extname(sourcePath));
  const artifactDir = await mkdtemp(join(tmpdir(), 'biobib-roundtrip-'));
  const firstOutputPath = join(artifactDir, `${sourceStem}-first-pass.docx`);
  await writeFile(firstOutputPath, firstPass.output);

  const secondPass = await runPipelinePass(
    firstPass.output,
    `${sourceStem}-first-pass.docx`,
    baseUrl,
    'Second pass',
  );
  if (!secondPass) return;

  const secondOutputPath = join(artifactDir, `${sourceStem}-second-pass.docx`);
  await writeFile(secondOutputPath, secondPass.output);

  const firstSections = firstPass.status.result?.sections ?? {};
  const secondSections = secondPass.status.result?.sections ?? {};
  const firstDuplicates = duplicateInventory(firstSections);
  const secondDuplicates = duplicateInventory(secondSections);

  record(
    'First pass has no high-confidence cross-section or publication duplicates',
    firstDuplicates.length === 0,
    firstDuplicates.join(' | '),
  );
  record(
    'Second pass has no high-confidence cross-section or publication duplicates',
    secondDuplicates.length === 0,
    secondDuplicates.join(' | '),
  );
  record(
    'Second pass does not introduce new exact duplicate keys',
    secondDuplicates.every(item => firstDuplicates.includes(item)),
    `${firstDuplicates.length} first-pass; ${secondDuplicates.length} second-pass`,
  );

  const reportPath = join(artifactDir, `${sourceStem}-roundtrip-report.json`);
  await writeFile(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourcePath,
    baseUrl,
    firstPass: {
      jobId: firstPass.jobId,
      state: firstPass.status.state,
      counts: sectionCounts(firstSections),
      duplicates: firstDuplicates,
      outputPath: firstOutputPath,
    },
    secondPass: {
      jobId: secondPass.jobId,
      state: secondPass.status.state,
      counts: sectionCounts(secondSections),
      duplicates: secondDuplicates,
      outputPath: secondOutputPath,
    },
    checks,
  }, null, 2));
  record('Roundtrip artifacts and comparison report written', true, artifactDir);
}

async function runPipelinePass(
  fileBytes: Buffer,
  fileName: string,
  baseUrl: string,
  label: string,
): Promise<PipelineRun | null> {
  let blobUrl: string;
  try {
    const blob = await put(fileName, fileBytes, {
      access: 'public',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      addRandomSuffix: true,
    });
    blobUrl = blob.url;
    record(`${label}: uploaded generated DOCX`, true, blobUrl);
  } catch (error) {
    record(`${label}: uploaded generated DOCX`, false, (error as Error).message);
    return null;
  }

  const uploadStartedAt = Date.now();
  const uploadResponse = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blobUrl, fileName }),
  });
  const uploadSeconds = (Date.now() - uploadStartedAt) / 1000;
  record(`${label}: upload dispatcher reached`, uploadResponse.ok, `status ${uploadResponse.status}`);
  record(`${label}: upload dispatcher remains fast`, uploadSeconds < 5, `${uploadSeconds.toFixed(2)}s`);

  const uploadBody = (await uploadResponse.json()) as { jobId?: string; error?: string };
  if (!uploadResponse.ok || !uploadBody.jobId) {
    record(`${label}: response has jobId`, false, uploadBody.error ?? '(no error field)');
    return null;
  }
  const jobId = uploadBody.jobId;
  record(`${label}: response has jobId`, true, jobId);

  const status = await pollForTerminalStatus(baseUrl, jobId, label);
  if (!status) return null;
  record(
    `${label}: job completed without total failure`,
    status.state !== 'failed',
    status.state === 'failed' ? status.error ?? '(no error message)' : status.state,
  );
  if (status.state === 'failed') return null;
  record(
    `${label}: every extraction slice completed`,
    status.state === 'complete',
    `state=${status.state}`,
  );
  if (status.state !== 'complete') return null;
  record(`${label}: response has result.sections`, !!status.result?.sections);
  record(`${label}: response has result.gaps array`, Array.isArray(status.result?.gaps));
  recordSectionPresence(status.result?.sections ?? {}, label);

  const download = await fetch(`${baseUrl}/api/download/${jobId}`);
  record(`${label}: download endpoint returns 2xx`, download.ok, `status ${download.status}`);
  if (!download.ok) return null;

  const output = Buffer.from(await download.arrayBuffer());
  const isDocx = output.slice(0, 2).toString('hex') === '504b';
  record(`${label}: downloaded file is a valid DOCX`, isDocx, `${output.length} bytes`);
  if (!isDocx) return null;
  await recordDocxChecks(output, label);
  return { jobId, status, output };
}

async function pollForTerminalStatus(
  baseUrl: string,
  jobId: string,
  label: string,
): Promise<StatusResponse | null> {
  const startedAt = Date.now();
  let lastStatus: StatusResponse | null = null;
  const printedTransitions = new Set<string>();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    const response = await fetch(`${baseUrl}/api/status/${jobId}`, { cache: 'no-store' });
    if (!response.ok) {
      record(`${label}: status endpoint reachable`, false, `status ${response.status}`);
      return null;
    }
    const status = (await response.json()) as StatusResponse;
    lastStatus = status;
    for (const [slice, state] of Object.entries(status.slices)) {
      const transition = `${slice}:${state}`;
      if (state !== 'pending' && !printedTransitions.has(transition)) {
        printedTransitions.add(transition);
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`       [${elapsed}s] ${label} slice "${slice}" → ${state}`);
      }
    }
    if (status.state !== 'pending' && status.state !== 'merging') break;
  }

  if (!lastStatus) {
    record(`${label}: reached terminal status`, false, 'no status received');
    return null;
  }
  record(
    `${label}: reached terminal status`,
    lastStatus.state !== 'pending' && lastStatus.state !== 'merging',
    `state=${lastStatus.state} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
  );
  return lastStatus;
}

function recordSectionPresence(sections: Record<string, unknown[]>, label: string): void {
  const counts = sectionCounts(sections);
  record(`${label}: employment entries extracted`, counts.employment > 0, `${counts.employment} entries`);
  record(`${label}: education entries extracted`, counts.education > 0, `${counts.education} entries`);
  record(`${label}: peer-reviewed publications extracted`, counts.peerReviewedJournals > 0, `${counts.peerReviewedJournals} entries`);
  record(`${label}: Section II content extracted`, counts.sectionII > 0, `${counts.sectionII} entries`);
  record(`${label}: Section III non-journal publications extracted`, counts.otherPublications > 0, `${counts.otherPublications} entries`);
}

async function recordDocxChecks(buffer: Buffer, label: string): Promise<void> {
  const outputText = await docxText(buffer);
  record(`${label}: DOCX does not expose source-number metadata`, !/\bsource\s+no\.?\b/i.test(outputText));
  record(`${label}: DOCX does not expose BioBib section metadata`, !/\bBioBib section:/i.test(outputText));
  record(`${label}: DOCX does not expose review-material metadata`, !/\breview material:/i.test(outputText));
  record(`${label}: DOCX does not render duplicate article labels`, !/\bARTICLE\s+ARTICLE\b/i.test(outputText));
  record(`${label}: DOCX uses explicit review text for unavailable table values`, outputText.includes('Not listed'));
}

function sectionCounts(sections: Record<string, unknown[]>): Record<string, number> & {
  employment: number;
  education: number;
  peerReviewedJournals: number;
  sectionII: number;
  otherPublications: number;
} {
  const count = (key: string) => Array.isArray(sections[key]) ? sections[key].length : 0;
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(sections)) {
    if (Array.isArray(value)) counts[key] = value.length;
  }
  return {
    ...counts,
    employment: count('employment'),
    education: count('education'),
    peerReviewedJournals: count('peerReviewedJournals'),
    sectionII: [
      'universityService', 'publicService', 'professionalActivities', 'memberships',
      'awards', 'teaching', 'studentInstructionalActivities', 'studentInstructionalGroups',
      'grants', 'externalProfessionalActivities', 'consulting', 'reviewerActivities',
      'presentations', 'invitedPresentations', 'diversityContributions', 'outreach',
      'clinicalActivities', 'otherActivities', 'externalReviews',
    ].reduce((total, key) => total + count(key), 0),
    otherPublications: [
      'reviewAndInvited', 'books', 'chapters', 'refereedProceedings', 'otherArticles',
      'otherProceedings', 'abstracts', 'popularWorks', 'additionalProducts', 'theses',
      'patents', 'workInProgress',
    ].reduce((total, key) => total + count(key), 0),
  };
}

function duplicateInventory(sections: Record<string, unknown[]>): string[] {
  const duplicates = new Set<string>();
  const serviceKeys = new Set(
    asRecords(sections.universityService).map(item =>
      normalizeServiceRecordForComparison(
        stringField(item, 'description'),
        stringField(item, 'dates'),
      ),
    ),
  );
  for (const item of [
    ...asStrings(sections.professionalActivities),
    ...asStrings(sections.externalProfessionalActivities),
  ]) {
    const key = normalizeServiceRecordForComparison(item);
    if (key && serviceKeys.has(key)) duplicates.add(`service/external:${key}`);
  }

  const publicationSections = [
    'peerReviewedJournals', 'reviewAndInvited', 'books', 'chapters',
    'refereedProceedings', 'otherArticles', 'otherProceedings', 'abstracts',
    'popularWorks', 'additionalProducts', 'theses', 'patents',
  ];
  for (const section of publicationSections) {
    addRepeatedPublicationKeys(section, sections[section], duplicates);
  }
  addRepeatedPublicationKeys('workInProgress', sections.workInProgress, duplicates);
  addRepeatedStringKeys(
    'external-professional-activities',
    [
      ...asStrings(sections.professionalActivities),
      ...asStrings(sections.externalProfessionalActivities),
    ],
    duplicates,
  );
  return [...duplicates].sort();
}

function addRepeatedPublicationKeys(
  section: string,
  value: unknown,
  duplicates: Set<string>,
): void {
  const seen = new Set<string>();
  for (const item of asRecords(value)) {
    const key = publicationKey(stringField(item, 'citation'));
    if (!key) continue;
    if (seen.has(key)) duplicates.add(`${section}:${key}`);
    seen.add(key);
  }
}

function addRepeatedStringKeys(
  section: string,
  values: string[],
  duplicates: Set<string>,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = normalizeRecordForComparison(value);
    if (!key) continue;
    if (seen.has(key)) duplicates.add(`${section}:${key}`);
    seen.add(key);
  }
}

function publicationKey(value: string): string {
  return normalizeRecordForComparison(
    value.replace(
      /(?:\s+)\*{1,2}\s*(?:co[- ]author|co[- ]corresponding author|corresponding author|senior author)[^.]*\.?$/i,
      '',
    ),
  );
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item),
    )
    : [];
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function stringField(value: Record<string, unknown>, key: string): string {
  return typeof value[key] === 'string' ? value[key] : '';
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

async function docxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('word/document.xml missing from generated DOCX');

  return documentXml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+\n/g, '\n')
    .trim();
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
