import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the real route handlers with isolated storage/network dependencies.
// Deferred fetches reproduce a serverless invocation ending before dispatch.
function loadRoute(path, overrides = {}) {
  const callbacks = [];
  const errors = [];
  const exports = {};
  const dependencies = {
    'next/server': {
      after: callback => callbacks.push(callback),
      NextResponse: Response,
    },
    '@vercel/blob': { head: async () => ({}), BlobNotFoundError: class extends Error {} },
    crypto: { randomUUID: () => 'test-job' },
    '@/lib/docx/reader': {},
    '@/lib/pipeline/slices': { SLICE_KEYS: ['meta_and_I'], isSliceKey: () => true },
    '@/lib/pipeline/converter': { callSliceWithSignal: async () => ({}) },
    '@/lib/constants': { MAX_FILE_SIZE_BYTES: 10_000_000 },
    '@/lib/jobs/auth': {
      checkInternalSecret: () => null,
      getInternalSecret: () => 'test-secret',
      getInternalFetchHeaders: () => ({ 'x-internal-secret': 'test-secret' }),
    },
    '@/lib/jobs/store': {
      computeStatus: async () => ({ state: 'merging', needsFinalizeKick: true }),
      sliceAlreadyHandled: async () => false,
      readManifest: async () => ({ sliceKeys: ['meta_and_I'] }),
      readCvText: async () => 'Synthetic test CV',
      writeSliceResult: async () => {},
    },
    ...overrides.dependencies,
  };
  const source = readFileSync(path, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unmocked dependency: ${name}`);
      return dependencies[name];
    },
    process: { env: overrides.env ?? { LITELLM_ON_PREM_API_KEY: 'test-key' } },
    fetch: overrides.fetch ?? (() => { throw new Error('Unexpected network request'); }),
    console: { error: (...args) => errors.push(args) },
    URL, Response, Buffer, AbortController, setTimeout, clearTimeout,
  }, { filename: path });
  return { route: exports, callbacks, errors };
}

const request = { nextUrl: { origin: 'https://example.invalid' } };
const context = { params: Promise.resolve({ jobId: 'test-job', sliceKey: 'meta_and_I' }) };

for (const [label, path, method] of [
  ['status recovery', 'app/api/status/[jobId]/route.ts', 'GET'],
  ['last slice', 'app/api/slice/[jobId]/[sliceKey]/route.ts', 'POST'],
]) {
  test(`${label} keeps background work alive until finalization acknowledges`, async () => {
    let acknowledge;
    let fetchCalled = false;
    const harness = loadRoute(path, {
      fetch: (url, options) => {
        assert.equal(url, 'https://example.invalid/api/finalize/test-job');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['x-internal-secret'], 'test-secret');
        fetchCalled = true;
        return new Promise(resolve => { acknowledge = resolve; });
      },
    });
    const response = await harness.route[method](request, context);
    assert.ok(response.ok);
    assert.equal(fetchCalled, false, 'response must not wait for background work');
    assert.equal(harness.callbacks.length, 1);
    if (method === 'GET') {
      assert.equal((await response.json()).needsFinalizeKick, undefined);
    }
    let completed = false;
    const work = harness.callbacks[0]().then(() => { completed = true; });
    await setImmediate();
    assert.equal(fetchCalled, true);
    assert.equal(completed, false, 'serverless lifetime must include the pending dispatch');
    acknowledge(new Response(null, { status: 202 }));
    await work;
    assert.equal(completed, true);
    assert.equal(harness.errors.length, 0);
  });

  test(`${label} reports a rejected finalization dispatch`, async () => {
    const harness = loadRoute(path, { fetch: async () => new Response(null, { status: 503 }) });
    await harness.route[method](request, context);
    await harness.callbacks[0]();
    assert.equal(harness.errors.length, 1);
    assert.match(String(harness.errors[0][1]), /HTTP 503/);
  });
}

test('status polling does not dispatch finalization when recovery is unnecessary', async () => {
  const harness = loadRoute('app/api/status/[jobId]/route.ts', {
    dependencies: { '@/lib/jobs/store': { computeStatus: async () => ({ state: 'complete' }) } },
  });
  const response = await harness.route.GET(request, context);
  assert.equal(response.status, 200);
  assert.equal(harness.callbacks.length, 0);
});

test('malformed upload bodies return validation errors before storage or model access', async () => {
  const { route } = loadRoute('app/api/upload/route.ts');
  const validFields = { blobUrl: 'https://test.public.blob.vercel-storage.com/cv.docx', fileName: 'cv.docx' };
  for (const body of [
    null, [], 'invalid', 42,
    { ...validFields, fileName: 42 },
    { ...validFields, blobUrl: {} },
    { ...validFields, reviewPeriodStart: 2020 },
    { ...validFields, reviewPeriodStart: {} },
    { ...validFields, reviewPeriodStart: null },
    { ...validFields, reviewPeriodStart: '2026-02-30' },
  ]) {
    const response = await route.POST({ json: async () => body });
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  const response = await route.POST({ json: async () => { throw new SyntaxError('invalid JSON'); } });
  assert.equal(response.status, 400);
});

test('gateway throttling retries the same request and respects Retry-After', async () => {
  const waits = [];
  const responses = [
    new Response('busy', { status: 429, headers: { 'Retry-After': '45' } }),
    new Response('busy', { status: 429, headers: { 'Retry-After': new Date(Date.now() + 90_000).toUTCString() } }),
    new Response('{}', { status: 200 }),
  ];
  const original = responses.slice();
  const options = { method: 'POST', body: 'unchanged payload' };
  const harness = loadRoute('lib/pipeline/fetch-with-retry.ts', {
    dependencies: { 'node:timers/promises': { setTimeout: async ms => waits.push(ms) } },
    fetch: async (_url, actual) => { assert.equal(actual, options); return responses.shift(); },
  });
  const result = await harness.route.fetchWithRateLimitRetry('https://example.invalid', options);
  assert.equal(result.status, 200);
  assert.equal(waits.length, 2);
  assert.ok(waits[0] >= 45_000);
  assert.ok(waits[1] >= 88_000);
  assert.equal(original[0].bodyUsed, true, 'discard throttled response bodies');
});

test('persistent throttling has a finite retry limit', async () => {
  let requests = 0;
  const waits = [];
  const harness = loadRoute('lib/pipeline/fetch-with-retry.ts', {
    dependencies: { 'node:timers/promises': { setTimeout: async ms => waits.push(ms) } },
    fetch: async () => { requests += 1; return new Response('busy', { status: 429 }); },
  });
  const result = await harness.route.fetchWithRateLimitRetry('https://example.invalid', {});
  assert.equal(result.status, 429);
  assert.equal(requests, 17);
  assert.equal(waits.length, 16);
  assert.ok(waits.every(ms => ms >= 2000 && ms < 32000));
});

test('non-throttling errors do not get retried by the gateway retry helper', async () => {
  let requests = 0;
  const harness = loadRoute('lib/pipeline/fetch-with-retry.ts', {
    dependencies: { 'node:timers/promises': { setTimeout: () => assert.fail('must not wait') } },
    fetch: async () => { requests += 1; return new Response('invalid model', { status: 400 }); },
  });
  const result = await harness.route.fetchWithRateLimitRetry('https://example.invalid', {});
  assert.equal(result.status, 400);
  assert.equal(requests, 1);
});

test('the existing slice deadline interrupts rate-limit waiting', async () => {
  const controller = new AbortController();
  let requests = 0;
  const harness = loadRoute('lib/pipeline/fetch-with-retry.ts', {
    dependencies: { 'node:timers/promises': { setTimeout: async (_ms, _value, { signal }) => {
      assert.equal(signal, controller.signal);
      controller.abort();
      signal.throwIfAborted();
    } } },
    fetch: async () => { requests += 1; return new Response('busy', { status: 429 }); },
  });
  await assert.rejects(harness.route.fetchWithRateLimitRetry('https://example.invalid', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(requests, 1);
});


test('a legacy cloud key cannot start extraction without the on-prem key', async () => {
  const harness = loadRoute('app/api/slice/[jobId]/[sliceKey]/route.ts', {
    env: { LITELLM_API_KEY: 'legacy-cloud-key' },
  });
  const response = await harness.route.POST(request, context);
  assert.equal(response.status, 500);
  assert.equal(harness.callbacks.length, 0);
});
