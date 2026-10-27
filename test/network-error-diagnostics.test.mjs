import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const monitor=readFileSync(new URL('../src/error-monitor.js',import.meta.url),'utf8');
const center=readFileSync(new URL('../src/admin-error-center.js',import.meta.url),'utf8');
test('network endpoint strips query parameters and provides useful diagnostics',()=>{
 assert.match(monitor,/url\.origin \+ url\.pathname/);
 assert.match(monitor,/endpoint: safeEndpoint/);
 assert.match(monitor,/occurred_at: new Date\(\)\.toISOString\(\)/);
 assert.match(center,/ec-error-hint/);
});
