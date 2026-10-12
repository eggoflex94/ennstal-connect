import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimationFrameTask } from '../src/animationFrameTask.js';

function frames() {
  const pending = new Map();
  let id = 0;
  return {
    requestAnimationFrame(callback) { pending.set(++id, callback); return id; },
    cancelAnimationFrame(frame) { pending.delete(frame); },
    flush() { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback()); },
    get count() { return pending.size; }
  };
}

test('resize delivery does not run layout writes inline and bursts share one frame', () => {
  const runtime = frames(); let writes = 0;
  const task = createAnimationFrameTask(() => writes++, runtime);
  task.schedule(); task.schedule(); task.schedule();
  assert.equal(writes, 0); assert.equal(runtime.count, 1);
  runtime.flush(); assert.equal(writes, 1);
  task.schedule(); runtime.flush(); assert.equal(writes, 2);
});

test('notifications caused by measuring are deferred to the following frame', () => {
  const runtime = frames(); let writes = 0;
  const task = createAnimationFrameTask(() => { writes++; if (writes === 1) task.schedule(); }, runtime);
  task.schedule(); runtime.flush();
  assert.equal(writes, 1); assert.equal(runtime.count, 1);
  runtime.flush(); assert.equal(writes, 2);
});

test('closing a preview cancels pending measurements and ignores later notifications', () => {
  const runtime = frames(); let writes = 0;
  const task = createAnimationFrameTask(() => writes++, runtime);
  task.schedule(); task.dispose(); task.schedule(); runtime.flush();
  assert.equal(writes, 0); assert.equal(runtime.count, 0);
});
