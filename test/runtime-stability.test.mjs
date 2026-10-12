import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRefreshScheduler } from '../src/refreshScheduler.js';
import { createNetworkFetch } from '../src/networkFetch.js';

test('auth refresh is deferred, burst events share one request and cleanup cancels work', async () => {
  let calls = 0;
  const schedule = createRefreshScheduler(() => { calls++; }, assert.fail, 0, 0);
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
  }, assert.fail, 0, 0);
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

test('default cooldown coalesces isolated realtime bursts after a refresh', async () => {
  let calls = 0;
  const schedule = createRefreshScheduler(() => { calls++; }, assert.fail, 0, 60);
  schedule();
  await wait(20);
  assert.equal(calls, 1);
  schedule(); schedule(); schedule();
  await wait(20);
  assert.equal(calls, 1, 'cooldown should hold back the trailing full refresh');
  await wait(70);
  assert.equal(calls, 2);
  schedule.dispose();
});

test('a failed refresh does not wedge subsequent updates', async () => {
  let calls = 0;
  const errors = [];
  const schedule = createRefreshScheduler(() => {
    if (++calls === 1) throw new Error('offline');
  }, error => errors.push(error.message), 0, 0);
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

test('score and announcement reads recover from transient failures and deduplicate concurrent callers', async () => {
  for (const rpc of ['ec_member_scores', 'community_activity_progress', 'ec_get_community_announcements']) {
    let calls = 0;
    const fetch = createNetworkFetch(async () => {
      calls++;
      if (calls === 1) throw new TypeError('Load failed');
      return new Response('[{"score":12}]', { status: 200 });
    });
    const url = `https://example.test/rest/v1/rpc/${rpc}`;
    const init = { method: 'POST', body: '{}', headers: { authorization: 'Bearer test' } };
    const [first, second] = await Promise.all([fetch(url, init), fetch(url, init)]);
    assert.equal(calls, 2);
    assert.equal(await first.text(), '[{"score":12}]');
    assert.equal(await second.text(), '[{"score":12}]');
  }
});

test('reward and home-region writes are not replayed after a network failure', async () => {
  for (const rpc of ['record_online_time', 'ec_change_home_region']) {
    let calls = 0;
    const fetch = createNetworkFetch(async () => { calls++; throw new TypeError('Failed to fetch'); });
    await assert.rejects(fetch(`https://example.test/rest/v1/rpc/${rpc}`, { method: 'POST', body: '{}' }));
    assert.equal(calls, 1);
  }
});

test('caller cancellation is not reported as a network fault and browser aborts retain timeout reasons', async () => {
  const originalWindow = globalThis.window;
  const originalEvent = globalThis.CustomEvent;
  const reports = [];
  globalThis.window = { dispatchEvent: event => reports.push(event.detail) };
  globalThis.CustomEvent = class { constructor(_name, options) { this.detail = options.detail; } };
  try {
    const fetch = createNetworkFetch((_url, { signal }) => new Promise((_resolve, reject) => {
      if (signal.aborted) return reject(new DOMException('Fetch is aborted', 'AbortError'));
      signal.addEventListener('abort', () => reject(new DOMException('Fetch is aborted', 'AbortError')));
    }), 5);
    const caller = new AbortController();
    const cancelled = fetch('https://example.test/rest/v1/rpc/ec_change_home_region', { method: 'POST', signal: caller.signal });
    caller.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    assert.equal(reports.length, 0);
    await assert.rejects(fetch('https://example.test/rest/v1/rpc/ec_change_home_region', { method: 'POST' }), { name: 'TimeoutError' });
    assert.equal(reports.length, 1);
    assert.equal(reports[0].kind, 'timeout');
  } finally {
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalEvent === undefined) delete globalThis.CustomEvent; else globalThis.CustomEvent = originalEvent;
  }
});
