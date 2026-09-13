import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSections } from '../src/sectionLoader.js';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('a stalled section does not delay ready sections and concurrency is bounded', async () => {
  const slow = deferred();
  const committed = [], started = [], settled = [];
  let active = 0, peak = 0;
  const tasks = ['slow', 'fast', 'third', 'fourth'].map(name => ({
    name,
    async load() { started.push(name); peak = Math.max(peak, ++active); if (name === 'slow') await slow.promise; --active; return name; },
    commit(data) { committed.push(data); }
  }));
  const done = loadSections(tasks, { isCurrent: () => true, onError: assert.fail, onSettled: name => settled.push(name) }, 2);
  await tick();
  assert.deepEqual(committed, ['fast', 'third', 'fourth']);
  assert.equal(peak, 2);
  slow.resolve(); await done;
  assert.equal(committed.at(-1), 'slow');
  assert.equal(settled.length, 4);
});

test('a failed section does not erase data or block the rest of the queue', async () => {
  const data = { news: ['previous'], forum: [] }, errors = [];
  await loadSections([
    { name: 'news', load: async () => { throw Error('offline'); }, commit: value => { data.news = value; } },
    { name: 'forum', load: async () => ['ready'], commit: value => { data.forum = value; } }
  ], { isCurrent: () => true, onError: (name, error) => errors.push([name, error.message]), onSettled() {} }, 1);
  assert.deepEqual(data, { news: ['previous'], forum: ['ready'] });
  assert.deepEqual(errors, [['news', 'offline']]);
});

test('switching session discards old results and stops queued requests', async () => {
  const slow = deferred();
  let current = true, calls = 0;
  const done = loadSections([
    { name: 'old', load: () => slow.promise, commit: assert.fail },
    { name: 'queued', load: () => { calls++; }, commit: assert.fail }
  ], { isCurrent: () => current, onError: assert.fail, onSettled: assert.fail }, 1);
  current = false; slow.resolve('private'); await done;
  assert.equal(calls, 0);
});
