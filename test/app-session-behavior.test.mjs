import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { loadSections } from '../src/sectionLoader.js';
import { createRefreshScheduler } from '../src/refreshScheduler.js';

const source = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'jsx', format: 'cjs' });
const names = [...source.matchAll(/const \[(\w+),\s*\w+\] = useState\(/g)].map(match => match[1]);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function mountApp(getSession, responseForTable) {
  const state = {}, refs = [], effects = [];
  let stateIndex = 0, authListener;
  const React = {
    createElement: () => null,
    useState(initial) {
      const name = names[stateIndex++];
      state[name] = initial;
      return [initial, value => { state[name] = typeof value === 'function' ? value(state[name]) : value; }];
    },
    useMemo: fn => fn(),
    useRef: value => { const ref = { current: value }; refs.push(ref); return ref; },
    useEffect: fn => effects.push(fn)
  };
  const supabase = {
    auth: {
      getSession,
      onAuthStateChange: fn => { authListener = fn; return { data: { subscription: { unsubscribe() {} } } }; }
    },
    rpc: async () => ({ data: [], error: null }),
    from(table) {
      let id;
      const query = new Proxy({}, { get(_target, key) {
        if (key === 'then') return (resolve, reject) => Promise.resolve(responseForTable?.(table, id) ?? {
          data: table === 'profiles' ? { id, role: 'MEMBER', account_status: 'ACTIVE' } : [], error: null
        }).then(resolve, reject);
        return (...args) => { if (key === 'eq' && args[0] === 'id') id = args[1]; return query; };
      } });
      return query;
    }
  };
  const context = {
    module: { exports: {} }, exports: {}, console, setTimeout, clearTimeout,
    location: { hash: '' },
    window: { setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} },
    require(name) {
      if (name === 'react') return React;
      if (name.includes('supabaseClient')) return { supabase, supabaseUnavailableMessage: 'offline' };
      if (name.includes('sectionLoader')) return { loadSections };
      if (name.includes('refreshScheduler')) return { createRefreshScheduler };
      return { default() {} };
    }
  };
  vm.runInNewContext(code, context);
  context.module.exports.default();
  const load = refs.find(ref => typeof ref.current === 'function').current;
  const authEffect = effects.find(effect => effect.toString().includes('onAuthStateChange'));
  return { state, load, subscribe: () => authEffect(), auth: (...args) => authListener(...args) };
}

test('a delayed response from an older session cannot overwrite the newer account', async () => {
  const oldSession = deferred();
  let calls = 0;
  const app = mountApp(() => ++calls === 1 ? oldSession.promise : Promise.resolve({ data: { session: { user: { id: 'new-user' } } } }));
  const oldLoad = app.load();
  await app.load();
  assert.equal(app.state.profile.id, 'new-user');
  oldSession.resolve({ data: { session: { user: { id: 'old-user' } } } });
  await oldLoad;
  assert.equal(app.state.user.id, 'new-user');
  assert.equal(app.state.profile.id, 'new-user');
});

test('sign-out clears private state immediately and invalidates an in-flight load', async () => {
  const session = deferred();
  const app = mountApp(() => session.promise);
  const cleanup = app.subscribe();
  app.state.messages = [{ content: 'private' }];
  app.state.memberEmails = { admin: 'private@example.test' };
  const pending = app.load();
  app.auth('SIGNED_OUT', null);
  assert.equal(app.state.messages.length, 0);
  assert.equal(Object.keys(app.state.memberEmails).length, 0);
  assert.equal(app.state.user, null);
  session.resolve({ data: { session: { user: { id: 'old-user' } } } });
  await pending;
  assert.equal(app.state.user, null);
  assert.equal(app.state.profile, null);
  cleanup();
});

test('profile and other sections appear while one data request is still pending', async () => {
  const slow = deferred();
  const app = mountApp(async () => ({ data: { session: { user: { id: 'member' } } } }), table => table === 'messages' ? slow.promise : undefined);
  const loading = app.load();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.state.profile.id, 'member');
  assert.ok(app.state.sectionStatus.pending.includes('Nachrichten'));
  assert.ok(!app.state.sectionStatus.pending.includes('Forum'));
  slow.resolve({ data: [{ id: 'message' }], error: null });
  await loading;
  assert.equal(app.state.messages[0].id, 'message');
  assert.equal(app.state.sectionStatus.pending.length, 0);
});

test('failed background reload preserves existing messages and exposes a retry state', async () => {
  const app = mountApp(async () => ({ data: { session: { user: { id: 'member' } } } }), table => table === 'messages' ? { data: null, error: { message: 'offline' } } : undefined);
  app.state.messages = [{ id: 'existing' }];
  await app.load();
  assert.equal(app.state.messages[0].id, 'existing');
  assert.ok(app.state.sectionStatus.failed.includes('Nachrichten'));
  assert.equal(app.state.sectionStatus.pending.length, 0);
});
