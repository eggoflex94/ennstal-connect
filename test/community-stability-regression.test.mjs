import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('starter task counter distinguishes query failure from zero', async () => {
  const source = read('src/home-new-member-journey.js');
  const match = source.match(/async function count\(query\)\{[\s\S]*?\n\}/);
  assert.ok(match, 'count function must exist');
  const context = { console: { warn() {} } };
  vm.runInNewContext(match[0] + '\nthis.count = count;', context);
  assert.equal(await context.count(Promise.resolve({ count: 0, error: null })), 0);
  assert.equal(await context.count(Promise.resolve({ count: 4, error: null })), 4);
  assert.equal(await context.count(Promise.resolve({ count: null, error: { message: 'offline' } })), null);
  assert.equal(await context.count(Promise.reject(new Error('offline'))), null);
  assert.match(source, /task\.done===null/);
});

test('onboarding recommendations cannot block progress and region text is escaped', () => {
  const source = read('src/member-onboarding.js');
  assert.match(source, /try\{renderRecommendations\(box,await getRecommendations\(updated\)\);\}catch\(recommendationError\)/);
  assert.match(source, /escapeHtml\(r\.name\)/);
  assert.match(source, /escapeHtml\(r\.description/);
  assert.match(source, /escapeHtml\(r\.slug\)/);
  const match = source.match(/const escapeHtml = [^\n]+/);
  assert.ok(match);
  const context = {};
  vm.runInNewContext(match[0].replace(/^const escapeHtml/, 'this.escapeHtml'), context);
  assert.equal(context.escapeHtml('<img src="x" onerror=\'alert(1)\'>'), '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;');
});

test('growth hub only requests current user friendships', () => {
  const source = read('src/community-growth-hub.js');
  assert.match(source, /\.from\('friendships'\)[^\n]*\.or\(`requester_id\.eq\.\$\{ctx\.user\.id\},receiver_id\.eq\.\$\{ctx\.user\.id\}`\)/);
});
