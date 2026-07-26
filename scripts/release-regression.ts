/**
 * Mandatory live release gate for production-visible conversion changes.
 *
 * Required environment:
 *   BLOB_READ_WRITE_TOKEN
 *   CONTINETTI_CV_PATH
 *   NIEH_CV_PATH
 *
 * Optional:
 *   BIOBIB_URL (defaults to production)
 *   BIOBIB_ADDITIONAL_CV_PATHS (newline-separated paths; three or more gives
 *   the full five-CV release cohort)
 */

import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const PRODUCTION_URL = 'https://biobib-formatter.vercel.app';

interface RegressionCase {
  path: string;
  profile?: 'continetti' | 'nieh';
  reviewPeriodStart?: string;
}

async function main(): Promise<void> {
  const required = [
    requiredPath('CONTINETTI_CV_PATH', 'continetti'),
    requiredPath('NIEH_CV_PATH', 'nieh'),
  ];
  const additional = (process.env.BIOBIB_ADDITIONAL_CV_PATHS ?? '')
    .split('\n')
    .map(value => value.trim())
    .filter(Boolean)
    .map(path => ({ path }));
  const cases = [...required, ...additional];

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN must be set.');
  }
  await Promise.all(cases.map(async testCase => {
    const info = await stat(resolve(testCase.path));
    if (!info.isFile()) throw new Error(`CV path is not a file: ${testCase.path}`);
  }));

  const baseUrl = process.env.BIOBIB_URL || PRODUCTION_URL;
  console.log(`Running ${cases.length}-CV live release gate against ${baseUrl}.`);
  if (additional.length < 3) {
    console.log(
      'Note: semantic gates will run, but set BIOBIB_ADDITIONAL_CV_PATHS to at least ' +
      'three newline-separated CV paths for the full five-CV cohort.',
    );
  }

  for (const testCase of cases) {
    await runCase(testCase, baseUrl);
  }
}

function requiredPath(
  variable: 'CONTINETTI_CV_PATH' | 'NIEH_CV_PATH',
  profile: 'continetti' | 'nieh',
): RegressionCase {
  const path = process.env[variable]?.trim();
  if (!path) throw new Error(`${variable} must be set.`);
  return {
    path,
    profile,
    ...(profile === 'continetti' ? { reviewPeriodStart: '2020-01-01' } : {}),
  };
}

async function runCase(testCase: RegressionCase, baseUrl: string): Promise<void> {
  const args = [
    'run',
    'test:regression',
    '--',
    resolve(testCase.path),
    '--roundtrip',
  ];
  if (testCase.profile) args.push('--profile', testCase.profile);
  if (testCase.reviewPeriodStart) {
    args.push('--review-period-start', testCase.reviewPeriodStart);
  }

  console.log(`\nRelease gate CV: ${resolve(testCase.path)}`);
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('npm', args, {
      env: {
        ...process.env,
        BIOBIB_URL: baseUrl,
      },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Regression case failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}

main().catch(error => {
  console.error(`Live release gate failed: ${(error as Error).message}`);
  process.exit(1);
});
