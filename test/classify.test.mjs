/**
 * Unit tests for `dsh-ui-controller`'s client half.
 *
 * Everything here is pure: the module is loaded once with a React stub and a
 * tiny window, then the exported helpers are exercised directly. The real slot
 * registry never appears — `slotRows()` takes `entriesOf` as a parameter
 * precisely so the inventory logic can be tested without a host.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(new URL('./../client.js', import.meta.url), 'utf8');

const here = dirname(fileURLToPath(import.meta.url));

/* ----------------------------------------------------------------- stubs */

class MemoryStorage {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed));
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  get length() {
    return this.map.size;
  }
}

function element(tagName) {
  const node = {
    tagName: String(tagName).toUpperCase(),
    children: [],
    attributes: new Map(),
    style: {},
    textContent: '',
    className: '',
    id: '',
    parentElement: null,
    appendChild(child) {
      child.parentElement = node;
      node.children.push(child);
      return child;
    },
    removeChild(child) {
      node.children = node.children.filter((item) => item !== child);
      return child;
    },
    remove() {
      if (node.parentElement !== null) node.parentElement.removeChild(node);
    },
    setAttribute(name, value) {
      node.attributes.set(name, String(value));
      if (name === 'id') node.id = String(value);
      return undefined;
    },
    getAttribute(name) {
      return node.attributes.has(name) ? node.attributes.get(name) : null;
    },
    removeAttribute(name) {
      node.attributes.delete(name);
    },
    hasAttribute(name) {
      return node.attributes.has(name);
    },
    getAttributeNames() {
      return Array.from(node.attributes.keys());
    },
    getElementById(target) {
      const stack = [...node.children];
      while (stack.length > 0) {
        const item = stack.pop();
        if (item.id === target || item.attributes.get('id') === target) return item;
        stack.push(...item.children);
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return node;
}

const head = element('head');
const body = element('body');
const html = element('html');

globalThis.document = {
  documentElement: html,
  head,
  body,
  hidden: false,
  createElement: element,
  getElementById: (id) => head.getElementById(id) ?? body.getElementById(id),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
};

globalThis.localStorage = new MemoryStorage();

const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children }, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
};

const loaded = { id: null, api: null };
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      loaded.id = spec.id;
      loaded.api = spec.factory((name) => (name === 'react' ? ReactStub : undefined));
    },
  },
};

new Function('window', 'document', 'localStorage', source)(globalThis.window, globalThis.document, globalThis.localStorage);

const api = loaded.api;

/* ---------------------------------------------------------------- harness */

let groups = 0;
let failed = 0;

function test(name, fn) {
  groups += 1;
  try {
    fn();
    console.log('ok ' + name);
  } catch (error) {
    failed += 1;
    console.log('FAIL ' + name);
    console.log(error);
  }
}

function resetStorage(seed = {}) {
  globalThis.localStorage = new MemoryStorage(seed);
}

function sessionEntry(options = {}) {
  return { options: { ...options }, registrant: options.registrant ?? 'test-plugin' };
}

function fixture() {
  return {
    'settings.section': [sessionEntry({ id: 'dsh-better-notice', order: 30, label: '热表' })],
    'conversation.view': [
      sessionEntry({ id: 'hotlist-seat-a', order: 100, label: () => 'A' }),
      sessionEntry({ id: 'hotlist-seat-b', order: 200, label: () => 'B' }),
    ],
    'conversation.composer.dock': [sessionEntry({ key: 'dock', priority: 2 })],
    'conversation.approval.detail': [sessionEntry({ priority: 0, label: 'approval detail' })],
  };
}

function entriesOfOf(map) {
  return (key) => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : []);
}

/* ------------------------------------------------------------------ tests */

test('module id matches the package name', () => {
  assert.equal(loaded.id, 'dsh-ui-controller');
});

test('catalog is the shipped 109-slot directory', () => {
  assert.equal(api.SLOT_CATALOG.length, 109);
  assert.deepEqual(api.kindCounts(), { single: 43, list: 42, keyed: 20, chain: 4 });
  const risks = api.SLOT_CATALOG.filter((slot) => slot.risk === 'shadows-shipped-ui').length;
  assert.equal(risks, 50);
  const scopes = api.SLOT_CATALOG.reduce((into, slot) => ({ ...into, [slot.scope]: (into[slot.scope] ?? 0) + 1 }), {});
  assert.deepEqual(scopes, { root: 53, session: 51, 'session-maybe': 5 });
  const keys = new Set(api.SLOT_CATALOG.map((slot) => slot.key));
  assert.equal(keys.size, 109, 'no duplicate slot keys');
  assert.equal(api.SLOT_CATALOG.filter((slot) => slot.registrantStatic !== '').length, 93);
  assert.equal(api.SLOT_CATALOG.filter((slot) => slot.injectStatic !== '').length, 84);
  assert.ok(keys.has('settings.section'));
  assert.ok(keys.has('root'));
  assert.equal(api.SLOT_CATALOG.find((slot) => slot.key === 'root').risk, 'shadows-shipped-ui');
});

test('inventory rows are entries, and every other slot is listed as empty', () => {
  resetStorage();
  const settings = api.defaultSettings();
  const inventory = api.slotRows(entriesOfOf(fixture()), settings);
  assert.equal(inventory.rows.length, 5);
  assert.equal(inventory.totalSlots, 109);
  assert.equal(inventory.occupiedSlots, 4);
  assert.equal(inventory.empty.length, 105);
  assert.equal(inventory.catalogSource, 'static');
  const slotKeys = new Set(inventory.rows.map((row) => row.slotKey));
  assert.deepEqual([...slotKeys].sort(), [
    'conversation.approval.detail',
    'conversation.composer.dock',
    'conversation.view',
    'settings.section',
  ]);
});

test('empty registry lists all 109 slots as empty, including the known empty seats', () => {
  resetStorage();
  const settings = api.defaultSettings();
  const inventory = api.slotRows(() => [], settings);
  assert.equal(inventory.rows.length, 0);
  assert.equal(inventory.empty.length, 109);
  const emptyKeys = new Set(inventory.empty.map((slot) => slot.key));
  for (const key of [
    'conversation.input.left',
    'conversation.input.right',
    'settings.section.icon',
    'plugins.detail.actions',
    'sidebar.workspaces.session.menu.item',
    'tool.view.cordis',
  ]) {
    assert.ok(emptyKeys.has(key), key);
  }
});

test('replaceRisk is carried onto every row and every empty slot', () => {
  resetStorage();
  const settings = api.defaultSettings();
  const inventory = api.slotRows(entriesOfOf(fixture()), settings);
  const row = inventory.rows.find((item) => item.slotKey === 'conversation.approval.detail');
  assert.equal(row.risk, 'shadows-shipped-ui');
  assert.equal(row.risky, true, 'the slot itself shadows shipped chrome');
  assert.equal(row.builtin, true, 'a single slot whose static registrar is shipped is built-in');
  const dock = inventory.rows.find((item) => item.slotKey === 'conversation.composer.dock');
  assert.equal(dock.builtin, false);
  assert.equal(dock.risky, false);
  const shell = inventory.rows.find((item) => item.slotKey === 'settings.section');
  assert.equal(shell.builtin, false, 'our own entry id is not a shipped package');
  assert.equal(shell.risky, false, 'settings.section is declared risk=none');
  assert.ok(inventory.empty.every((slot) => typeof slot.risk === 'string'));
  assert.ok(inventory.empty.some((slot) => slot.risk === 'shadows-shipped-ui'));
});

test('the hide toggle only exists for third-party entries with a bound element', () => {
  resetStorage();
  const settings = api.defaultSettings();
  const inventory = api.slotRows(entriesOfOf(fixture()), settings);
  const builtinRow = inventory.rows.find((item) => item.slotKey === 'conversation.approval.detail');
  const thirdParty = inventory.rows.find((item) => item.slotKey === 'conversation.view');
  assert.equal(api.canHide(builtinRow), false);
  assert.equal(api.canHide(thirdParty), false, 'no locator yet');
  const bound = { ...thirdParty, locator: '[data-test]' };
  assert.equal(api.canHide(bound), true);
  const boundSingle = { ...builtinRow, builtin: false, locator: '[data-test]' };
  assert.equal(api.canHide(boundSingle), false, 'a single slot has one occupant: hiding blanks it');
  assert.equal(api.canReorderRow(boundSingle), true, 're-ordering is pure CSS, so a bound seat may still move');
  assert.equal(api.canReorderRow({ ...thirdParty, locator: '[data-test]' }), true, 'a bound list entry can move');
  assert.equal(api.canReorderRow(builtinRow), false, 'built-in entries stay read-only');
  assert.equal(api.locatorReason(settings, builtinRow), 'built-in UI — touching it would shadow shipped chrome');
  assert.match(api.locatorReason(settings, thirdParty), /entry→DOM mapping/);
});

test('hiding is our own record; the entry object is never touched', () => {
  resetStorage();
  const entries = fixture();
  const settings = api.defaultSettings();
  const before = JSON.stringify(entries['conversation.view']);
  const hidden = api.toggleHidden(settings, 'conversation.view', 'hotlist-seat-a');
  const inventory = api.slotRows(entriesOfOf(entries), { ...settings, hidden });
  assert.equal(inventory.rows.filter((row) => row.hidden).length, 1);
  assert.equal(inventory.hiddenCount, 1);
  assert.equal(JSON.stringify(entries['conversation.view']), before);
  const back = api.toggleHidden({ ...settings, hidden }, 'conversation.view', 'hotlist-seat-a');
  assert.deepEqual(back, {}, 'toggling twice removes the slot key entirely');
});

test('hidden selectors require both a mark and a binding', () => {
  resetStorage();
  const settings = api.defaultSettings();
  const locators = api.setLocator(settings, 'conversation.view::hotlist-seat-a', '[data-x]');
  const hidden = api.toggleHidden({ ...settings, locators }, 'conversation.view', 'hotlist-seat-a');
  const list = api.hiddenSelectors({ ...settings, locators, hidden });
  assert.equal(list.length, 1);
  assert.equal(list[0].selector, '[data-x]');
  assert.deepEqual(api.hiddenSelectors({ ...settings, locators }), [], 'bound but not hidden');
});

function fakeDoc(map) {
  return {
    querySelectorAll: (selector) => (Object.prototype.hasOwnProperty.call(map, selector) ? map[selector] : []),
  };
}

function fakeElement(parent) {
  const node = { style: {}, parentElement: parent };
  return node;
}

test('visual order writes CSS order and steps one at a time', () => {
  resetStorage();
  const base = api.defaultSettings();
  const oneUp = api.stepVisualOrder(base, 'conversation.view::a', 1);
  assert.deepEqual(oneUp, { 'conversation.view::a': 1 });
  const twoUp = api.stepVisualOrder({ ...base, visualOrder: oneUp }, 'conversation.view::a', 1);
  assert.deepEqual(twoUp, { 'conversation.view::a': 2 });
  const back = api.stepVisualOrder({ ...base, visualOrder: twoUp }, 'conversation.view::a', -2);
  assert.deepEqual(back, {}, 'returning to zero drops the key instead of storing it');
  const negative = api.stepVisualOrder(base, 'conversation.view::a', -3);
  assert.deepEqual(negative, { 'conversation.view::a': -3 }, 'negatives are allowed: they paint first');
  const targets = api.visualTargets({ ...base, locators: { 'conversation.view::a': '[data-a]' }, visualOrder: oneUp });
  assert.deepEqual(targets, [{ key: 'conversation.view::a', selector: '[data-a]', value: 1 }]);
  assert.deepEqual(api.visualTargets({ ...base, visualOrder: oneUp }), [], 'a mark without a binding is not a target');
});

test('visual order only touches flex parents and never leaves a stale value', () => {
  resetStorage();
  const parent = { display: 'flex' };
  const elementA = fakeElement(parent);
  const elementB = fakeElement({ display: 'block' });
  const doc = fakeDoc({ '[data-a]': [elementA], '[data-b]': [elementB] });
  const previousView = globalThis.document.defaultView;
  globalThis.document.defaultView = { getComputedStyle: (target) => ({ display: target.display }) };
  try {
    const settings = {
      ...api.defaultSettings(),
      locators: { 'conversation.view::a': '[data-a]', 'conversation.view::b': '[data-b]' },
      visualOrder: { 'conversation.view::a': 2, 'conversation.view::b': 1 },
    };
    const touched = api.applyVisualOrder(doc, settings, []);
    assert.equal(elementA.style.order, '2');
    assert.deepEqual(touched, [elementA], 'only the flex child is written');
    assert.equal(elementB.style.order, undefined, 'a block parent is never re-ordered');
    api.applyVisualOrder(doc, api.defaultSettings(), touched);
    assert.equal(elementA.style.order, '', 'unbinding clears the host element again');
    assert.equal(touched.length, 0);
  } finally {
    if (previousView === undefined) delete globalThis.document.defaultView;
    else globalThis.document.defaultView = previousView;
  }
});

test('a display:contents anchor still re-orders the element inside it', () => {
  resetStorage();
  const flexParent = { display: 'flex' };
  const anchor = { style: {}, display: 'contents', parentElement: flexParent };
  const seat = fakeElement(anchor);
  const doc = fakeDoc({ '[data-seat]': [seat] });
  const previousView = globalThis.document.defaultView;
  globalThis.document.defaultView = { getComputedStyle: (target) => ({ display: target.display }) };
  try {
    assert.equal(api.canReorder(anchor), true, 'the anchor takes no box: judge the grandparent');
    assert.equal(api.canReorder({ display: 'contents', parentElement: { display: 'block' } }), false);
    const settings = {
      ...api.defaultSettings(),
      locators: { 'conversation.view::seat': '[data-seat]' },
      visualOrder: { 'conversation.view::seat': 5 },
    };
    const touched = api.applyVisualOrder(doc, settings, []);
    assert.equal(seat.style.order, '5', 'the element the anchor wraps actually moves');
    assert.deepEqual(touched, [seat]);
    api.applyVisualOrder(doc, api.defaultSettings(), touched);
    assert.equal(seat.style.order, '', 'and the same element is cleared again');
  } finally {
    if (previousView === undefined) delete globalThis.document.defaultView;
    else globalThis.document.defaultView = previousView;
  }
});

test('builtin is read from the static entry id, never from the live registrant', () => {
  resetStorage();
  assert.equal(api.builtinOf('@deepseek-ai/dsh-client-ui-deliverables', 'list', ''), true);
  assert.equal(api.builtinOf('dsh-experimental-client-ui-stats', 'list', ''), true);
  assert.equal(api.builtinOf('hotlist-table', 'list', ''), false, 'our own entries are not shipped UI');
  assert.equal(api.builtinOf('message-quotes', 'list', ''), false);
  assert.equal(api.builtinOf('', 'single', 'dsh-client-ui-chat ×1'), true, 'a single slot inherits its registrar');
  assert.equal(api.builtinOf('', 'list', 'dsh-client-ui-chat ×1'), false, 'a list slot does not');
  const entries = {
    'conversation.view': [
      sessionEntry({ id: '@deepseek-ai/dsh-client-ui-deliverables', registrant: 'tk' }),
      sessionEntry({ id: 'message-quotes', registrant: 'tk' }),
    ],
  };
  const inventory = api.slotRows((key) => entries[key] ?? [], api.defaultSettings());
  const shipped = inventory.rows.find((row) => row.entryId === '@deepseek-ai/dsh-client-ui-deliverables');
  const thirdParty = inventory.rows.find((row) => row.entryId === 'message-quotes');
  assert.equal(shipped.builtin, true, 'the runner name says nothing: the id does');
  assert.equal(shipped.registrantLive, 'tk', 'the live registrant is still recorded, just not trusted');
  assert.equal(thirdParty.builtin, false);
  assert.equal(inventory.builtinCount, 1);
});

test('a slot only shipped packages register into is labelled, never gated', () => {
  resetStorage();
  assert.equal(api.shippedSlotOf('keyed', 'dsh-client-ui-open-in-app×2; dsh-client-ui-file-actions×1'), true);
  assert.equal(api.shippedSlotOf('list', 'dsh-client-ui-workspace×3; @deepseek-ai/x×1'), true);
  assert.equal(api.shippedSlotOf('keyed', 'dsh-client-ui-conversation×2; dsh-message-quotes×1'), false, 'one third party clears it');
  assert.equal(api.shippedSlotOf('single', 'dsh-client-ui-chat×1'), false, 'single slots are judged per entry');
  assert.equal(api.shippedSlotOf('keyed', ''), false, 'an unknown registrar proves nothing');

  const live = new Map([
    [
      'contextMenu.icon',
      {
        key: 'contextMenu.icon',
        kind: 'keyed',
        scope: 'root',
        occupants: [
          sessionEntry({ key: 'file-actions.copy', priority: 0 }),
          sessionEntry({ key: 'sidebar.close', priority: 1 }),
        ],
      },
    ],
    [
      'conversation.view',
      {
        key: 'conversation.view',
        kind: 'list',
        scope: 'root',
        occupants: [sessionEntry({ id: 'hotlist-table', order: 10000, label: '热表' })],
      },
    ],
  ]);
  const inventory = api.slotRows(() => [], api.defaultSettings(), live);
  const menuRows = inventory.rows.filter((row) => row.slotKey === 'contextMenu.icon');
  assert.equal(menuRows.length, 2);
  for (const row of menuRows) {
    assert.equal(row.shippedSlot, true, 'every registrar of this slot is ours');
    assert.equal(row.builtin, false, 'but this row itself cannot be proven built-in');
    assert.equal(api.canHide({ ...row, locator: '[data-x]' }), true, 'so the controls stay on: that is the point');
  }
  const ourRow = inventory.rows.find((row) => row.entryId === 'hotlist-table');
  assert.equal(ourRow.builtin, false, 'our own entry is not built-in UI');
  assert.equal(ourRow.shippedSlot, true, 'and its slot is honestly labelled as all-shipped');
  assert.equal(inventory.shippedSlotCount, 3);
});

test('unbinding drops the visual order it could no longer apply', () => {
  resetStorage();
  const seat = { style: {}, display: 'contents', parentElement: { display: 'flex', parentElement: null } };
  const doc = { querySelectorAll: (selector) => (selector === '[data-seat]' ? [seat] : []) };
  const previousView = globalThis.document.defaultView;
  globalThis.document.defaultView = { getComputedStyle: (target) => ({ display: target.display }) };
  try {
    const bound = api.sanitizeSettings({
      locators: { 'conversation.view::a': '[data-seat]' },
      visualOrder: { 'conversation.view::a': 5, 'conversation.view::b': 9 },
    });
    const touched = api.applyVisualOrder(doc, bound, []);
    assert.equal(seat.style.order, '5', 'the bound row really moves first');

    /* The page's unbind handler: clear the locator and the order in one write. */
    const unbound = api.sanitizeSettings({
      locators: api.setLocator(bound, 'conversation.view::a', ''),
      visualOrder: api.dropKey(bound.visualOrder, 'conversation.view::a'),
    });
    assert.equal('conversation.view::a' in unbound.locators, false);
    assert.equal('conversation.view::a' in unbound.visualOrder, false, 'no stale number survives the unbind');
    assert.equal(unbound.visualOrder['conversation.view::b'], 9, 'other keys are untouched');
    assert.deepEqual(api.visualTargets(unbound), [], 'nothing left to apply');
    api.applyVisualOrder(doc, unbound, touched);
    assert.equal(seat.style.order, '', 'and the element is put back');

    /* The same rule through the public write path: clearing a locator with an
       empty selector must not leave a number nobody can apply. */
    const ctx = fakeCtx({});
    api.apply(ctx.scope, {});
    const ui = globalThis.window.__UI_CONTROLLER__;
    ui.settings.set({ locators: { 'conversation.view::a': '[data-seat]' } });
    ui.settings.set({ visualOrder: { 'conversation.view::a': 2 } });
    assert.equal(ui.settings.get().visualOrder['conversation.view::a'], 2, 'the number lands while bound');
    ui.settings.set({ locators: { 'conversation.view::a': '' } });
    const after = ui.settings.get();
    assert.equal('conversation.view::a' in after.locators, false, 'the binding is gone');
    assert.equal('conversation.view::a' in after.visualOrder, false, 'and so is the order it carried');
    for (const dispose of ctx.disposes) dispose();
  } finally {
    if (previousView === undefined) delete globalThis.document.defaultView;
    else globalThis.document.defaultView = previousView;
  }
});

test('the unbound hint does not repeat the button next to it', () => {
  const zh = api.translator('zh');
  const en = api.translator('en');
  assert.equal(zh('settings.unbound'), '无法定位：宿主不暴露 entry→DOM 映射');
  assert.equal(en('settings.unbound'), 'Cannot locate: the host exposes no entry→DOM mapping');
  assert.equal(/绑定/.test(zh('settings.unbound')), false, 'the button already says 绑定元素');
  assert.equal(/Bind the element/.test(en('settings.unbound')), false);
  assert.equal(zh('settings.unbind'), '解绑');
  assert.equal(en('settings.unbind'), 'Unbind');
});

test('the runtime snapshot is the directory, the static table is the fallback', () => {
  resetStorage();
  const settings = api.defaultSettings();
  const snapshot = [
    {
      type: 'slot',
      name: 'conversation.view',
      kind: 'list',
      scope: 'session',
      occupants: [
        { id: 'a', order: 100, priority: 0, active: true, registrant: 'live-plugin' },
        { id: 'b', order: 200, priority: 0, active: true },
      ],
      children: [],
    },
    { type: 'slot', name: 'brand.new.slot', kind: 'single', scope: 'root', occupants: [], children: [] },
  ];
  const live = api.runtimeCatalog({ snapshot: () => snapshot });
  assert.equal(live.size, 2);
  const inventory = api.slotRows(() => [], settings, live);
  assert.equal(inventory.catalogSource, 'runtime');
  assert.equal(inventory.totalSlots, 2, 'the live registry decides how many slots exist');
  assert.deepEqual(inventory.rows.map((row) => row.entryId), ['a', 'b']);
  assert.equal(inventory.rows[0].registrantLive, 'live-plugin');
  assert.match(inventory.rows[0].registrant, /dsh-client-ui-chat/, 'the static proxy still names the registrar');
  assert.deepEqual(inventory.empty.map((slot) => slot.key), ['brand.new.slot']);
  assert.equal(api.runtimeCatalog({}), null, 'no snapshot() means no runtime directory');
  assert.equal(api.runtimeCatalog({ snapshot: () => { throw new Error('boom'); } }), null, 'a throwing snapshot falls back');
  assert.equal(api.slotRows(() => [], settings).catalogSource, 'static');
});

test('presets save, apply and drop the whole hidden/order state', () => {
  resetStorage();
  const base = api.defaultSettings();
  const marked = { ...base, hidden: { 'conversation.view': { a: true } }, visualOrder: { 'conversation.view::a': 5 } };
  const saved = api.savePreset(marked, 'compact');
  assert.equal(saved.ok, true);
  assert.deepEqual(Object.keys(saved.presets), ['compact']);
  assert.equal(saved.activePreset, 'compact');
  const withPreset = { ...marked, presets: saved.presets, activePreset: saved.activePreset };
  const other = { ...withPreset, hidden: {}, visualOrder: {} };
  const applied = api.applyPreset(other, 'compact');
  assert.equal(applied.ok, true);
  assert.deepEqual(applied.hidden, { 'conversation.view': { a: true } });
  assert.deepEqual(applied.visualOrder, { 'conversation.view::a': 5 });
  assert.equal(api.applyPreset(other, 'nope').reason, 'missing');
  const dropped = api.dropPreset(withPreset, 'compact');
  assert.equal(dropped.ok, true);
  assert.deepEqual(dropped.presets, {});
  assert.equal(dropped.activePreset, null);
  assert.equal(api.savePreset(base, '   ').reason, 'invalid');
});

test('settings are sanitised: unknown slots, bad selectors and junk values drop', () => {
  resetStorage();
  const clean = api.sanitizeSettings({
    version: 99,
    hidden: { 'not.a.slot': { a: true }, 'conversation.view': { a: true, b: false, '': true } },
    locators: { 'conversation.view::a': '[data-a]', 'not.a.slot::a': '[data-b]', 'conversation.view::bad': 'a{b}' },
    visualOrder: { 'conversation.view::a': '12.4', 'conversation.view::b': 'nope', 'nope::x': 3 },
    presets: { compact: { hidden: { 'conversation.view': { a: true } }, visualOrder: {} }, '': { hidden: {} } },
    activePreset: 'compact',
  });
  assert.equal(clean.version, api.SETTINGS_VERSION);
  assert.deepEqual(clean.hidden, { 'conversation.view': { a: true } });
  assert.deepEqual(clean.locators, { 'conversation.view::a': '[data-a]' });
  assert.deepEqual(clean.visualOrder, { 'conversation.view::a': 12 });
  assert.equal('order' in clean, false, 'the old field name is not kept around');
  const aliased = api.sanitizeSettings({ order: { 'conversation.view::a': -4 } });
  assert.deepEqual(aliased.visualOrder, { 'conversation.view::a': -4 }, 'old saves keep their numbers');
  assert.deepEqual(Object.keys(clean.presets), ['compact']);
  assert.equal(clean.activePreset, 'compact');
  assert.equal(api.sanitizeSettings({ activePreset: 'missing' }).activePreset, null);
  assert.equal(api.sanitizeLocatorKey('conversation.view::a'), 'conversation.view::a');
  assert.equal(api.sanitizeLocatorKey('nope::a'), '');
  assert.equal(api.sanitizeSelector('  [data-x]  '), '[data-x]');
  assert.equal(api.sanitizeSelector('a'.repeat(400)), '');
});

test('restoring defaults drops every mark, binding and preset', () => {
  resetStorage();
  const dirty = { ...api.defaultSettings(), hidden: { 'conversation.view': { a: true } }, presets: { p: { hidden: {}, visualOrder: {} } } };
  globalThis.localStorage.setItem(api.SETTINGS_KEY, JSON.stringify(dirty));
  const fresh = api.defaultSettings();
  assert.deepEqual(fresh, { version: api.SETTINGS_VERSION, hidden: {}, locators: {}, visualOrder: {}, presets: {}, activePreset: null });
  assert.equal(api.SETTINGS_KEY, 'dsh.uiController.settings.v1');
});

test('translator fills placeholders and falls back to the key', () => {
  const zh = api.translator('zh');
  const en = api.translator('en');
  assert.equal(zh('settings.nav'), '界面控制');
  assert.equal(en('settings.nav'), 'UI controller');
  assert.equal(en('settings.zoneMeta', { slots: 3, entries: 7 }), '3 slots · 7 entries');
  assert.equal(en('nope.key'), 'nope.key');
});

test('every dictionary key exists in both languages', () => {
  const zh = Object.keys(api.DICTS.zh).sort();
  const en = Object.keys(api.DICTS.en).sort();
  assert.deepEqual(zh, en);
});

/* ------------------------------------------------------- the settings page */

function fakeCtx(fixtureMap) {
  const registered = [];
  const disposes = [];
  const scope = {
    get(name) {
      if (name === 'slots') {
        return {
          entriesOfSlot: (key) => fixtureMap[key] ?? [],
          snapshot: () => [],
        };
      }
      return undefined;
    },
    effect(factory) {
      const result = factory();
      if (typeof result === 'function') disposes.push(result);
      return () => {};
    },
    locale: {
      register: () => () => {},
    },
    slots: {
      inject: (key, callback) => {
        if (key === 'settings.section') callback();
        return () => {};
      },
      register: (spec, component) => {
        registered.push({ spec, component });
        return () => {};
      },
    },
  };
  return { scope, registered, disposes };
}

test('the settings page renders with controls only where they can act', () => {
  resetStorage();
  const ctx = fakeCtx({
    'conversation.view': [
      { options: { id: 'third-party', priority: 0, order: 100 }, registrant: 'someone' },
    ],
    'conversation.approval.detail': [{ options: { priority: 0 }, registrant: 'shipped' }],
  });
  api.apply(ctx.scope, {});
  assert.equal(ctx.registered.length, 1);
  const slot = ctx.registered[0].component({ t: api.translator('en') });
  /* The registered component closes over its own translator; render one level
   * down and hand it English so the header assertions read the shipped copy. */
  const page = typeof slot.type === 'function' ? slot.type({ ...slot.props, t: api.translator('en') }) : slot;

  const flatten = (node, into) => {
    if (node === null || node === undefined || typeof node !== 'object') return into;
    into.push(node);
    for (const child of Array.isArray(node.props?.children) ? node.props.children.flat(3) : []) flatten(child, into);
    return into;
  };
  const collapsed = flatten(page, []);
  assert.equal(
    collapsed.filter((node) => node.props?.['data-uic-row'] !== undefined).length,
    0,
    'every zone starts folded, so no entry row is drawn yet',
  );
  const zoneNames = collapsed.filter((node) => node.props?.['data-uic-zone'] !== undefined).map((node) => node.props['data-uic-zone']);
  assert.deepEqual(zoneNames, ['risky', 'safe', 'empty'], 'the three zones are drawn in risk order, all folded');
  const foldedBody = collapsed.filter((node) => node.props?.['data-uic-zone-open'] === 'true');
  assert.equal(foldedBody.length, 0, 'no zone renders its body until it is clicked');
  api.toggleOpen('zone:risky');
  api.toggleOpen('zone:safe');
  api.toggleOpen('slot:conversation.view');
  api.toggleOpen('slot:conversation.approval.detail');
  const opened = flatten(
    typeof slot.type === 'function' ? slot.type({ ...slot.props, t: api.translator('en') }) : slot,
    [],
  );
  const nodes = opened;
  const rows = nodes.filter((node) => node.props?.['data-uic-row'] !== undefined);
  assert.equal(rows.length, 2, 'one row per live occupant');

  const shippedRow = rows.find((row) => String(row.props['data-uic-row']).includes('approval'));
  const thirdRow = rows.find((row) => String(row.props['data-uic-row']).includes('third-party'));
  const inRow = (row, prop) => {
    const found = flatten(row, []).filter((node) => node.props?.[prop] !== undefined);
    return found;
  };
  assert.equal(inRow(shippedRow, 'data-uic-toggle').length, 0, 'shipped entries get no switch');
  assert.equal(inRow(shippedRow, 'data-uic-order-up').length, 0, 'and no stepper');
  assert.equal(inRow(thirdRow, 'data-uic-toggle').length, 0, 'unbound third-party row cannot be hidden yet');
  assert.equal(inRow(thirdRow, 'data-uic-pick').length, 1, 'but it can be bound');

  const label = (value) => (Array.isArray(value) ? value.join('') : String(value ?? ''));
  const heads = nodes.filter((node) => node.props?.['data-uic-group'] !== undefined).map((node) => node.props['data-uic-group']);
  assert.deepEqual(heads, ['conversation.approval.detail', 'conversation.view'], 'one head per occupied slot');
  const counts = nodes
    .filter((node) => node.props?.['data-uic-group-count'] !== undefined)
    .map((node) => String(node.props['data-uic-group-count']));
  assert.deepEqual(counts, ['1', '1'], 'each head carries how many entries are folded inside it');
  assert.equal(
    nodes.filter((node) => label(node.props?.children) === 'entries (1)').length >= 2,
    true,
    'the count reads as a sentence, not a bare number',
  );

  for (const dispose of ctx.disposes) dispose();
  api.resetOpen();
  resetStorage();

  /* Once bound, the same row swaps the pick button for a hide switch, a stepper
     and an unbind button. */
  resetStorage();
  const boundCtx = fakeCtx({
    'conversation.view': [{ options: { id: 'third-party', priority: 0, order: 100 }, registrant: 'someone' }],
  });
  api.apply(boundCtx.scope, {});
  /* Go through the public write path so the cached settings pick the binding up. */
  globalThis.window.__UI_CONTROLLER__.settings.set({ locators: { 'conversation.view::third-party': '[data-x]' } });
  api.toggleOpen('zone:risky');
  api.toggleOpen('zone:safe');
  api.toggleOpen('slot:conversation.view');
  const boundPage = boundCtx.registered[0].component({ t: api.translator('en') });
  const boundNodes = flatten(
    typeof boundPage.type === 'function' ? boundPage.type({ ...boundPage.props, t: api.translator('en') }) : boundPage,
    [],
  );
  const boundRow = boundNodes.find((node) => String(node.props?.['data-uic-row'] ?? '').includes('third-party'));
  const boundIn = (prop) => flatten(boundRow, []).filter((node) => node.props?.[prop] !== undefined).length;
  assert.equal(boundIn('data-uic-toggle'), 1, 'a bound entry can be hidden');
  assert.equal(boundIn('data-uic-order-up'), 1, 'and moved');
  assert.equal(boundIn('data-uic-unbind'), 1, 'and released again');
  assert.equal(boundIn('data-uic-pick'), 0, 'the pick button is gone once bound');
  for (const dispose of boundCtx.disposes) dispose();
  api.resetOpen();
  resetStorage();
});


/* ------------------------------------------------------------- grouping */

test('entries group under their slot, and empty seats stay in their own zone', () => {
  const rows = [
    { key: 'a::1', slotKey: 'a', kind: 'list', scope: 'root', risk: 'shadows-shipped-ui', purpose: '', entryId: '1', registrant: '', registrantLive: '', priority: 0, order: 0, visualOrder: null, hidden: false, locator: '', risky: true, builtin: false, shippedSlot: false },
    { key: 'a::0', slotKey: 'a', kind: 'list', scope: 'root', risk: 'shadows-shipped-ui', purpose: '', entryId: '0', registrant: '', registrantLive: '', priority: 0, order: 0, visualOrder: null, hidden: false, locator: '', risky: true, builtin: false, shippedSlot: false },
    { key: 'b::x', slotKey: 'b', kind: 'single', scope: 'session', risk: 'none', purpose: 'p', entryId: 'x', registrant: '', registrantLive: '', priority: 0, order: 0, visualOrder: null, hidden: false, locator: '', risky: false, builtin: true, shippedSlot: false },
  ];
  const empty = [{ key: 'c', kind: 'keyed', scope: 'root', risk: 'none', purpose: '', registrantStatic: '' }];
  const zones = api.slotGroups(rows, empty);
  assert.deepEqual(zones.risky.map((slot) => slot.slotKey), ['a'], 'a risky slot lands in the risky zone');
  assert.deepEqual(zones.safe.map((slot) => slot.slotKey), ['b'], 'a safe slot lands in the safe zone');
  assert.deepEqual(zones.empty.map((slot) => slot.slotKey), ['c'], 'an empty seat is its own row, kept apart');
  assert.deepEqual(zones.risky[0].entries.map((row) => row.entryId), ['1', '0'], 'entries keep the order the inventory gave them');
  assert.equal(zones.empty[0].entries.length, 0, 'an empty seat has no entries to show');
});

test('the three filters count what they keep', () => {
  const rows = [
    { key: 'a::1', slotKey: 'a', kind: 'list', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Pairing', entryId: 'one', registrant: '', registrantLive: 'alpha', priority: 0, order: 0, visualOrder: null, hidden: false, locator: '[x]', risky: true, builtin: false, shippedSlot: false },
    { key: 'b::2', slotKey: 'b', kind: 'list', scope: 'root', risk: 'none', purpose: 'Chat', entryId: 'two', registrant: '', registrantLive: 'beta', priority: 0, order: 0, visualOrder: null, hidden: false, locator: '', risky: false, builtin: false, shippedSlot: false },
  ];
  const empty = [{ key: 'c', kind: 'keyed', scope: 'root', risk: 'none', purpose: '', registrantStatic: '' }];
  const zones = api.slotGroups(rows, empty);

  let view = api.filterGroups(zones, { query: '', risk: 'all', bound: 'all' });
  assert.deepEqual(view.counts, { entries: 2, slots: 2, empty: 1 }, 'nothing filtered: every row and the empty seat are counted');

  view = api.filterGroups(zones, { query: 'alpha', risk: 'all', bound: 'all' });
  assert.deepEqual(view.counts, { entries: 1, slots: 1, empty: 0 }, 'a registrant name narrows it to that one row');

  view = api.filterGroups(zones, { query: 'chat', risk: 'all', bound: 'all' });
  assert.deepEqual(view.counts, { entries: 1, slots: 1, empty: 0 }, 'a slot purpose matches the slot, not just the ids');

  view = api.filterGroups(zones, { query: '', risk: 'risky', bound: 'all' });
  assert.deepEqual(view.counts, { entries: 1, slots: 1, empty: 0 }, 'the risky filter drops the safe slots and every empty seat');

  view = api.filterGroups(zones, { query: '', risk: 'all', bound: 'unbound' });
  assert.deepEqual(view.counts, { entries: 1, slots: 1, empty: 1 }, 'binding is a per-row filter; empty seats survive it');

  view = api.filterGroups(zones, { query: '', risk: 'all', bound: 'bound' });
  assert.deepEqual(view.counts, { entries: 1, slots: 1, empty: 0 }, 'an empty seat cannot be bound, so it drops out here');

  view = api.filterGroups(zones, { query: 'nothing matches this', risk: 'all', bound: 'all' });
  assert.deepEqual(view.counts, { entries: 0, slots: 0, empty: 0 }, 'a miss reports zero everywhere');
});

test('collapse starts closed and survives a re-render', () => {
  api.resetOpen();
  assert.equal(api.isOpen('zone:safe'), false, 'nothing is open before the first click');
  assert.equal(api.toggleOpen('zone:safe'), true, 'one click opens it');
  assert.equal(api.isOpen('zone:safe'), true, 'and the state is kept outside the component');
  /* A re-render is a fresh call of the page function; the module-level set is
   * what makes the panel come back still open. */
  resetStorage();
  const ctx = fakeCtx({ 'conversation.view': [{ options: { id: 'x', priority: 0, order: 0 }, registrant: 'someone' }] });
  api.apply(ctx.scope, {});
  const render = () => {
    const slot = ctx.registered[0].component({ t: api.translator('en') });
    const page = typeof slot.type === 'function' ? slot.type({ ...slot.props, t: api.translator('en') }) : slot;
    const into = [];
    const walk = (node) => {
      if (node === null || node === undefined || typeof node !== 'object') return;
      into.push(node);
      for (const child of Array.isArray(node.props?.children) ? node.props.children.flat(3) : []) walk(child);
    };
    walk(page);
    return into;
  };
  const first = render().filter((node) => node.props?.['data-uic-zone'] === 'safe');
  assert.equal(first.length, 1);
  assert.equal(first[0].props['data-uic-zone-open'], 'true', 'the zone stays open across a re-render');
  assert.equal(api.toggleOpen('zone:safe'), false, 'a second click folds it again');
  const second = render().filter((node) => node.props?.['data-uic-zone'] === 'safe');
  assert.equal(second[0].props['data-uic-zone-open'], 'false', 'and it stays folded across a re-render');
  for (const dispose of ctx.disposes) dispose();
  api.resetOpen();
  resetStorage();
});

test('the static fallback still renders slot rows', () => {
  resetStorage();
  const ctx = fakeCtx({ 'conversation.view': [{ options: { id: 'solo', priority: 0, order: 0 }, registrant: 'someone' }] });
  api.apply(ctx.scope, {});
  api.toggleOpen('zone:safe');
  const slot = ctx.registered[0].component({ t: api.translator('en') });
  const page = typeof slot.type === 'function' ? slot.type({ ...slot.props, t: api.translator('en') }) : slot;
  const into = [];
  const walk = (node) => {
    if (node === null || node === undefined || typeof node !== 'object') return;
    into.push(node);
    for (const child of Array.isArray(node.props?.children) ? node.props.children.flat(3) : []) walk(child);
  };
  walk(page);
  const catalog = into.find((node) => node.props?.['data-uic-catalog'] !== undefined);
  assert.equal(catalog.props['data-uic-catalog'], 'static', 'with no live snapshot we are on the static table');
  const heads = into.filter((node) => node.props?.['data-uic-group'] !== undefined);
  assert.equal(heads.length > 0, true, 'slot heads are still drawn from the static catalogue');
  const zones = into.filter((node) => node.props?.['data-uic-zone'] !== undefined);
  assert.equal(zones.length >= 2, true, 'the empty zone is drawn too, so the page is never blank');
  for (const dispose of ctx.disposes) dispose();
  api.resetOpen();
  resetStorage();
});

//#region 12. display metadata (locale + icon)
/**
 * The host reads plugin display name/icon without evaluating any JavaScript:
 * `pluginPackages.metaOf()` reads `locale/<lang>.json` for `meta.title` and
 * `meta.description`, and `package.json` `icon` (or the exported `./icon`) for
 * the artwork. Both must be reachable through `exports`, or the packaged copy
 * will not have them and the plugin list falls back to the package name.
 */
{
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'))

  test('package.json declares the display metadata the host reads', () => {
    assert.equal(pkg.icon, './icon.svg', 'manifest icon')
    assert.ok(pkg.exports, 'exports present')
    assert.equal(pkg.exports['./icon'], './icon.svg', 'exported icon')
    assert.ok(pkg.exports['./locale/*.json'], 'exported locale glob')
  })

  test('the icon ships inside the npm package', () => {
    assert.ok(pkg.files.includes('icon.svg'), 'files includes icon.svg')
    assert.ok(pkg.files.includes('locale'), 'files includes locale/')
    const svg = readFileSync(join(here, '..', 'icon.svg'), 'utf8')
    assert.ok(svg.startsWith('<svg'), 'icon.svg is an SVG')
    assert.ok(Buffer.byteLength(svg) <= 256 * 1024, 'icon stays under the hosts 256 KiB cap')
  })

  test('locale files carry a title and a description in both languages', () => {
    for (const lang of ['en', 'zh']) {
      const meta = JSON.parse(readFileSync(join(here, '..', 'locale', lang + '.json'), 'utf8')).meta
      assert.ok(meta && typeof meta.title === 'string' && meta.title.trim(), lang + ' title')
      assert.ok(meta && typeof meta.description === 'string' && meta.description.trim(), lang + ' description')
    }
  })
}
//#endregion

console.log('');
if (failed > 0) {
  console.log('FAILED — ' + failed + ' of ' + groups + ' groups');
  process.exit(1);
}
console.log('PASS — ' + groups + ' groups');
