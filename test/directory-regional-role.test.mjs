import test from 'node:test';
import assert from 'node:assert/strict';
import { directoryRegionalRole } from '../src/directoryRegionalRole.js';

test('Roland remains a regional admin in the directory when browsing Alpenraum', () => {
  assert.deepEqual(directoryRegionalRole(new Set(['ennstal']), 'alpenraum'), { assigned: true, here: false, star: '/supporter-star.svg' });
});

test('regional admins have a red star in their assigned region', () => {
  assert.deepEqual(directoryRegionalRole(new Set(['ennstal']), 'ennstal'), { assigned: true, here: true, star: '/role-star-red.svg' });
  assert.equal(directoryRegionalRole(new Set(['ennstal', 'alpenraum']), 'alpenraum').here, true);
});

test('unassigned members never gain admin presentation', () => {
  assert.deepEqual(directoryRegionalRole(undefined, 'ennstal'), { assigned: false, here: false, star: null });
  assert.equal(directoryRegionalRole(new Set(), null).assigned, false);
});
