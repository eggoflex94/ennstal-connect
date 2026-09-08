import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRefreshScheduler } from '../src/refreshScheduler.js';
import { createNetworkFetch } from '../src/networkFetch.js';

test('auth refresh is deferred, burst events share one request and cleanup cancels work', async () => {
  let calls = 0;
  const schedule = createRefreshScheduler(() => { calls++; }, assert.fail, 0);
  schedule(); schedule(); schedule();
  assert.equal(calls, 0, 'must not call Supabase within its auth callback');
  await wait(20);
  assert.equal(calls, 1);
  schedule(); schedule.dispose();
  await wait(20);
  assert.equal(calls, 1);
});

test('events during a request produce one trailing refresh without overlap', async () => {
  let calls = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const schedule = createRefreshScheduler(async () => {
    calls++;
    if (calls === 1) await pending;
  }, assert.fail, 0);
  schedule();
  await wait(20);
  schedule(); schedule(); schedule();
  await wait(20);
  assert.equal(calls, 1);
  release();
  await wait(20);
  assert.equal(calls, 2);
  schedule.dispose();
});

test('a failed refresh does not wedge subsequent updates', async () => {
  let calls = 0;
  const errors = [];
  const schedule = createRefreshScheduler(() => {
    if (++calls === 1) throw new Error('offline');
  }, error => errors.push(error.message), 0);
  schedule(); await wait(20);
  schedule(); await wait(20);
  assert.equal(calls, 2);
  assert.deepEqual(errors, ['offline']);
  schedule.dispose();
});

test('stalled writes abort once and are never automatically retried', async () => {
  let calls = 0;
  const fetch = createNetworkFetch((_url, options) => {
    calls++;
    assert.equal(options.method, 'POST');
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)));
  }, 5);
  await assert.rejects(fetch('https://example.test/rpc', { method: 'POST' }), { name: 'TimeoutError' });
  assert.equal(calls, 1);
});

test('caller cancellation is preserved for both init signals and Request inputs', async () => {
  const fetch = createNetworkFetch((_url, { signal }) => {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  });
  const controller = new AbortController();
  const pending = fetch('https://example.test', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  const request = new Request('https://example.test', { signal: controller.signal });
  await assert.rejects(fetch(request), { name: 'AbortError' });
});

test('successful HTTP responses and server errors pass through without retry', async () => {
  for (const status of [200, 401, 500]) {
    const response = new Response('body', { status });
    let calls = 0;
    const fetch = createNetworkFetch(async () => { calls++; return response; });
    assert.equal(await fetch('https://example.test'), response);
    assert.equal(calls, 1);
  }
});
