import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = (await fs.readFile(new URL('../src/role-region-polish.js', import.meta.url), 'utf8')).replace(/^import[^\n]+\n/, '');

test('inline identity decoration settles and never decorates its own nested strong', () => {
  let writes = 0, html = '', decorated = false;
  const outer = {
    dataset: {}, textContent: 'Erstellt von Example',
    closest() { return null; },
    querySelector() { return decorated ? {} : null; },
    classList: { add() {} },
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; decorated = true; writes++; }
  };
  const inner = { closest() { return {}; }, set innerHTML(_) { assert.fail('must not nest another identity'); } };
  const context = vm.createContext({
    document: { readyState: 'loading', addEventListener() {}, documentElement: { dataset: {} }, querySelectorAll: () => decorated ? [outer, inner] : [outer] },
    localStorage: { getItem() { return ''; } }
  });
  vm.runInContext(source, context);
  vm.runInContext("profiles = [{id:'one',nickname:'Example',role:'MEMBER'}]; polishInlinePeople();", context);
  for(let i = 0; i < 20; i++) vm.runInContext('polishInlinePeople()', context);
  assert.equal(writes, 1, 'an unchanged render must stop producing mutation records');
  vm.runInContext("profiles[0].role = 'SUPPORTER'; polishInlinePeople();", context);
  assert.equal(writes, 2, 'actual role changes must still update the identity');
  assert.ok(html.includes('supporter-star.svg'));
  decorated = false;
  vm.runInContext('polishInlinePeople()', context);
  assert.equal(writes, 3, 'a React replacement can be decorated again');
});
