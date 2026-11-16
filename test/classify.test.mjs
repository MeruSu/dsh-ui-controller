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
    querySelectorAll(selector) {
      if (selector !== '[id]') return [];
      const found = [];
      const stack = [...node.children];
      while (stack.length > 0) {
        const item = stack.pop();
        if (typeof item.getAttribute === 'function' && item.getAttribute('id') !== null) found.push(item);
        if (Array.isArray(item.children)) stack.push(...item.children);
      }
      return found;
    },
    querySelector() {
      return null;
    },
    get firstChild() {
      return node.children.length > 0 ? node.children[0] : null;
    },
    get firstElementChild() {
      const first = node.children.length > 0 ? node.children[0] : null;
      return first !== null && typeof first.getAttribute === 'function' ? first : null;
    },
    cloneNode(deep) {
      const copy = element(node.tagName);
      for (const [name, value] of node.attributes) copy.attributes.set(name, value);
      copy.className = node.className;
      copy.id = node.id;
      copy.textContent = node.textContent;
      if (deep === true) for (const child of node.children) copy.appendChild(child.cloneNode(true));
      return copy;
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
  if (globalThis.localStorage instanceof MemoryStorage) {
    globalThis.localStorage.clear();
    for (const [k, v] of Object.entries(seed)) globalThis.localStorage.setItem(k, v);
    return globalThis.localStorage;
  }
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
  assert.deepEqual(fresh, {
    version: api.SETTINGS_VERSION,
    hidden: {},
    locators: {},
    visualOrder: {},
    presets: {},
    activePreset: null,
    sidebarMore: { foldAll: true },
  });
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

/* ------------------------------------------------- sidebar More (task-80) */

/* The wide rail has no [data-shortcut-modal="sidebar"]: the launcher sits
     under nav.panelList and carries its own aria-label (task-83 dump). */
function hostLauncher(label) {
  const row = element('button');
  row.setAttribute('class', 'panelRow');
  row.setAttribute('aria-label', label);
  const title = element('span');
  title.setAttribute('class', 'panelTitle');
  title.textContent = label;
  row.appendChild(title);
  row.querySelector = (selector) => (selector === 'span[class*="panelTitle"]' ? title : null);
  return { row, title };
}

function hostPanel(label) {
  return hostLauncher(label).row;
}

function sidebarDoc(options = {}) {
  const nav = element('nav');
  nav.setAttribute('class', 'panelList');
  const anchor = element('span');
  anchor.setAttribute('class', 'moreAnchor');
  const { row: button, title } = hostLauncher(options.label ?? '更多');
  anchor.appendChild(button);
  nav.appendChild(anchor);
  const rows = (options.panels ?? []).map((label) => {
    const row = hostPanel(label);
    nav.appendChild(row);
    return row;
  });
  const doc = {
    querySelector: (selector) => (selector === 'nav[class*="panelList"]' ? nav : null),
    querySelectorAll: (selector) => {
      if (selector === 'button[aria-label="更多"], button[aria-label="More"]') return [button];
      if (selector === 'nav[class*="panelList"] button[class*="panelRow"]') return [button, ...rows];
      return [];
    },
  };
  return { doc, nav, button, title, rows };
}

test('sidebar more: the folded record round-trips and stale ids are dropped', () => {
  resetStorage();
  const store = globalThis.localStorage;
  api.writeSidebarMore(store, ['a', 'b', 'gone']);
  assert.deepEqual(api.readSidebarMore(store), { folded: ['a', 'b', 'gone'] });
  assert.deepEqual(api.cleanFolded(['a', 'b', 'gone'], ['a', 'b']), ['a', 'b'], 'unknown ids are cleaned');
  assert.deepEqual(api.readSidebarMore(null), { folded: [] }, 'no storage, no crash');
  store.setItem(api.SIDEBAR_MORE_KEY, '{nope');
  assert.deepEqual(api.readSidebarMore(store), { folded: [] }, 'bad json falls back to an empty record');
  assert.equal(api.SIDEBAR_MORE_KEY, 'dsh.uic.sidebarMore.v1');
});

test('sidebar more: foldAll decides the fold set, and off keeps the record', () => {
  resetStorage();
  const settingsOn = { ...api.defaultSettings(), sidebarMore: { foldAll: true } };
  const settingsOff = { ...api.defaultSettings(), sidebarMore: { foldAll: false } };
  assert.deepEqual(api.computeFold(['plugins', 'a', 'b'], settingsOn), ['a', 'b'], 'foldAll folds everything except plugins');
  assert.deepEqual(api.computeFold(['plugins', 'a', 'b'], settingsOff), [], 'off folds nothing');
  assert.deepEqual(api.computeFold(['plugins', 'a', 'b'], api.defaultSettings()), ['a', 'b'], 'foldAll is the default');
  api.writeSidebarMore(globalThis.localStorage, ['a']);
  assert.deepEqual(api.readSidebarMore(globalThis.localStorage), { folded: ['a'] });
  assert.deepEqual(api.computeFold(['plugins', 'a', 'b'], settingsOff), [], 'off still folds nothing');
  assert.deepEqual(api.readSidebarMore(globalThis.localStorage), { folded: ['a'] }, 'the record survives an off flip');
});

test('sidebar more: the launcher never shows a number', () => {
  resetStorage();
  const sourceText = source;
  assert.equal(sourceText.includes('function foldedRowCount('), false, 'the DOM counter is gone');
  assert.equal(sourceText.includes('function paintMoreCount('), false, 'the painter is gone');
  assert.equal(sourceText.includes('moreLabel('), false, 'the label combinator is gone');
  const harness = sidebarDoc({ label: '更多', panels: ['Panels A', 'Panels B'] });
  for (const row of harness.rows) row.style.display = 'none';
  api.normalizeMoreTitle(harness.doc);
  assert.equal(harness.title.textContent, '更多', 'rows hidden or not, the label stays bare');
  const harness2 = sidebarDoc({ label: 'More', panels: ['Panels A', 'Panels B'] });
  api.normalizeMoreTitle(harness2.doc);
  assert.equal(harness2.title.textContent, 'More', 'English label stays bare too');
  const blind = { querySelectorAll: () => [] };
  api.normalizeMoreTitle(blind);
  assert.ok(true, 'no launcher, no crash');
});
test('sidebar more: the menu rows fold, unfold and jump through the host callbacks', () => {
  resetStorage();
  globalThis.window.__UI_CONTROLLER__.settings.set({ sidebarMore: { foldAll: false } });
  const events = [];
  const props = {
    entries: [
      { id: 'a', label: 'Panels A', pinned: true, active: false },
      { id: 'b', label: 'Panels B', pinned: true, active: false },
    ],
    onOpen: (id) => events.push(['open', id]),
    onPinnedChange: (id, pinned) => events.push(['pin', id, pinned]),
    onDismiss: () => events.push(['dismiss']),
  };
  const menu = api.SidebarMoreMenu(props);
  assert.equal(menu.props['data-uic-sidebar-more-menu'], '1');
  const rows = menu.children.filter((child) => child.props?.['data-uic-more-row'] !== undefined);
  assert.equal(rows.length, 2, 'one row per panel');
  const rowA = rows[0];
  assert.equal(rowA.props['data-uic-more-row'], 'a');
  rowA.props.onClick();
  assert.deepEqual(events.slice(-2), [['open', 'a'], ['dismiss']], 'a row click jumps and dismisses');
  const pinB = rows.find((row) => row.props.children.find((child) => child.props?.['data-uic-more-pin'] === 'b'));
  const pinButton = pinB.props.children.find((child) => child.props?.['data-uic-more-pin'] === 'b');
  pinButton.props.onClick({ stopPropagation: () => {} });
  const lastPin = events.filter((item) => item[0] === 'pin').pop();
  assert.deepEqual(lastPin, ['pin', 'b', false], 'pinned=true folds into More');
  assert.deepEqual(api.readSidebarMore(globalThis.localStorage).folded, ['b'], 'the fold lands in the record');
  const walk = (node, into) => {
    if (node === null || node === undefined) return into;
    if (typeof node === 'object' && Array.isArray(node.children)) {
      into.push(node);
      for (const child of node.children) walk(child, into);
    }
    return into;
  };
  const flat = walk(menu, []);
  assert.equal(flat.some((child) => child.props?.['data-uic-more-foldall'] !== undefined), false, 'no fold-all bulk button');
  assert.equal(flat.some((child) => child.props?.['data-uic-more-unfoldall'] !== undefined), false, 'no unfold-all bulk button');
  const toggles = flat.filter((child) => child.props?.['data-uic-more-pin'] !== undefined);
  assert.equal(toggles.length, 2, 'exactly one per-row toggle per panel');
  const zh = api.translator('zh');
  const rowB = rows.find((row) => row.props['data-uic-more-row'] === 'b');
  const toggleB = rowB.props.children.find((child) => child.props?.['data-uic-more-pin'] === 'b');
  assert.equal(toggleB.props.children[0], zh('settings.sidebarMore.fold'), 'an empty record reads as foldable');
  /* The next test reads the cached settings again; hand the default back. */
  globalThis.window.__UI_CONTROLLER__.settings.set({ sidebarMore: { foldAll: true } });
});

test('sidebar more: replay folds only what the record and foldAll ask for', () => {
  resetStorage();
  const on = api.defaultSettings();
  const off = { ...on, sidebarMore: { foldAll: false } };
  const entries = [
    { id: 'a', pinned: true },
    { id: 'b', pinned: true },
    { id: 'plugins', pinned: true },
  ];
  assert.deepEqual(api.sidebarMoreReplay(entries, on, globalThis.localStorage), ['a', 'b'], 'foldAll replays every panel but plugins');
  assert.deepEqual(api.sidebarMoreReplay(entries, off, globalThis.localStorage), [], 'off replays nothing');
  api.writeSidebarMore(globalThis.localStorage, ['b']);
  assert.deepEqual(api.sidebarMoreReplay(entries, off, globalThis.localStorage), ['b'], 'off replays the record');
  const alreadyFolded = [{ id: 'a', pinned: false }];
  assert.deepEqual(api.sidebarMoreReplay(alreadyFolded, on, globalThis.localStorage), [], 'already folded is left alone');
});

test('sidebar more: a stale painted count is restored to the bare label', () => {
  resetStorage();
  const harness = sidebarDoc({ label: '更多', panels: ['Panels A', 'Panels B'] });
  harness.title.textContent = '更多 (2)';
  api.normalizeMoreTitle(harness.doc);
  assert.equal(harness.title.textContent, '更多', 'the old "(2)" painted by an older build is taken back off');
  harness.title.textContent = '更多';
  api.normalizeMoreTitle(harness.doc);
  assert.equal(harness.title.textContent, '更多', 'already bare stays bare');
  assert.equal(harness.button.getAttribute('aria-label'), '更多', 'the aria-label is never touched');
});
test('sidebar more: only the host launcher is ever normalised', () => {
  resetStorage();
  const other = sidebarDoc({ label: 'Something else', panels: ['Panels A'] });
  other.title.textContent = 'Something else (7)';
  api.normalizeMoreTitle(other.doc);
  assert.equal(other.title.textContent, 'Something else (7)', 'an unrelated row keeps its own text');
});
test('sidebar more: folded panels are hidden on the list and restored on the way out', () => {
  resetStorage();
  const a = hostPanel('Panels A');
  const b = hostPanel('Panels B');
  const nav = element('nav');
  nav.setAttribute('class', 'panelList');
  nav.appendChild(a);
  nav.appendChild(b);
  const doc = {
    querySelectorAll: (selector) => (selector === 'nav[class*="panelList"] button[class*="panelRow"]' ? [a, b] : []),
  };
  const panels = [
    { id: 'a', label: 'Panels A' },
    { id: 'b', label: 'Panels B' },
  ];
  const touched = new Map();
  const on = api.defaultSettings();
  api.applyFoldState(doc, panels, on, globalThis.localStorage, touched);
  assert.equal(a.style.display, 'none', 'foldAll hides every panel but plugins');
  assert.equal(b.style.display, 'none');
  assert.equal(touched.size, 2);
  const off = { ...on, sidebarMore: { foldAll: false } };
  api.applyFoldState(doc, panels, off, globalThis.localStorage, touched);
  assert.equal(a.style.display, '', 'turning foldAll off restores the row');
  assert.equal(b.style.display, '');
  assert.equal(touched.size, 0, 'restored rows leave the touched map');
  const stranger = hostPanel('Somebody Else');
  const doc2 = { querySelectorAll: (selector) => (selector.includes('panelList') ? [a, stranger] : []) };
  api.applyFoldState(doc2, panels, on, globalThis.localStorage, touched);
  assert.equal(a.style.display, 'none', 'the known row folds again');
  assert.equal(stranger.style.display, undefined, 'a row with no matching panel id is left alone');
  assert.equal(touched.size, 1, 'only the known row is tracked');
});

test('sidebar more: the host item look is sampled, never hardcoded', () => {
  const host = element('button');
  host.setAttribute('class', '_item_1p5el_105 menuItem');
  host.textContent = '浏览更多插件';
  const ours = element('button');
  ours.setAttribute('class', 'uic-moreRow');
  const menu = element('div');
  menu.setAttribute('class', 'moreMenu');
  menu.appendChild(host);
  menu.appendChild(ours);
  menu.querySelectorAll = (selector) => (selector === 'button' ? [host, ours] : []);
  const styles = {
    height: '32px',
    'line-height': '20px',
    'padding-left': '12px',
    'padding-right': '12px',
    'font-size': '14px',
    'border-radius': '6px',
    color: 'rgb(10, 10, 10)',
  };
  const doc = {
    querySelector: (selector) => (selector === '[class*="moreMenu"]' ? menu : null),
    querySelectorAll: () => [],
    defaultView: { getComputedStyle: () => ({ getPropertyValue: (name) => styles[name] ?? '' }) },
  };
  const sample = api.sampleMoreItem(doc);
  assert.equal(sample.className, '_item_1p5el_105 menuItem', 'the live class list is copied');
  assert.equal(sample.style.height, '32px');
  assert.equal(sample.style.fontSize, '14px');
  assert.equal(api.sampleMoreItem(null), null, 'no document');
  assert.equal(api.sampleMoreItem({ querySelector: () => null, defaultView: { getComputedStyle: () => ({}) } }), null, 'no menu');
  assert.equal(api.sampleMoreItem({ querySelector: () => menu }), null, 'no computed style view');
  const onlyOurs = element('button');
  onlyOurs.setAttribute('class', 'uic-moreRow');
  const emptyMenu = element('div');
  emptyMenu.setAttribute('class', 'moreMenu');
  emptyMenu.appendChild(onlyOurs);
  emptyMenu.querySelectorAll = (selector) => (selector === 'button' ? [onlyOurs] : []);
  assert.equal(
    api.sampleMoreItem({ querySelector: () => emptyMenu, defaultView: { getComputedStyle: () => ({}) } }),
    null,
    'a menu with only our own rows has no sample',
  );
});

test('sidebar more: the settings page carries the foldAll switch', () => {
  resetStorage();
  const ctx = fakeCtx({});
  api.apply(ctx.scope, {});
  const registered = ctx.registered.find((item) => item.spec.id === 'ui-controller');
  const slot = registered.component({ t: api.translator('en') });
  const page = typeof slot.type === 'function' ? slot.type({ ...slot.props, t: api.translator('en') }) : slot;
  const flatten = (node, into) => {
    if (node === null || node === undefined || typeof node !== 'object') return into;
    into.push(node);
    for (const child of Array.isArray(node.props?.children) ? node.props.children.flat(3) : []) flatten(child, into);
    return into;
  };
  const nodes = flatten(page, []);
  const block = nodes.filter((item) => item.props?.['data-uic-sidebar-more'] === '1');
  assert.equal(block.length, 1, 'exactly one sidebarMore block');
  const box = nodes.filter((item) => item.props?.['data-uic-sidebar-more-foldall'] !== undefined);
  assert.equal(box.length, 1, 'exactly one foldAll checkbox');
  assert.equal(box[0].props['data-uic-sidebar-more-foldall'], 'true', 'foldAll defaults on');
  for (const dispose of ctx.disposes) dispose();
});


test('sidebar more: the menu row borrows the host glyph and stays a copy', () => {
  resetStorage();
  const rowA = element('button');
  rowA.setAttribute('class', 'panelRow');
  rowA.setAttribute('aria-label', 'Panels A');
  const titleA = element('span');
  titleA.setAttribute('class', 'panelTitle');
  titleA.textContent = 'Panels A';
  rowA.appendChild(titleA);
  const glyphA = element('span');
  glyphA.setAttribute('class', 'panelGlyph');
  const svgA = element('svg');
  svgA.setAttribute('id', 'host-icon');
  glyphA.appendChild(svgA);
  rowA.appendChild(glyphA);
  rowA.querySelector = (selector) => {
    if (selector === 'span[class*="panelGlyph"]') return glyphA;
    if (selector === 'span[class*="panelTitle"]') return titleA;
    return null;
  };
  const rowB = element('button');
  rowB.setAttribute('class', 'panelRow');
  rowB.setAttribute('aria-label', 'Panels B');
  rowB.querySelector = () => null;
  const doc = {
    querySelectorAll: (selector) =>
      selector === 'nav[class*="panelList"] button[class*="panelRow"]' ? [rowA, rowB] : [],
  };
  const placeholder = element('span');
  assert.equal(api.mountMoreGlyph(placeholder, doc, 'Panels A'), true, 'the host glyph is copied');
  assert.equal(placeholder.children.length, 1, 'exactly one clone');
  assert.equal(placeholder.children[0].tagName, 'SVG', 'the first child of the host glyph is what gets cloned');
  assert.equal(placeholder.children[0].getAttribute('id'), null, 'ids are stripped from the clone');
  assert.equal(api.mountMoreGlyph(placeholder, doc, 'Panels A'), true, 'a second mount still succeeds');
  assert.equal(placeholder.children.length, 1, 'a remount replaces the clone instead of stacking');
  assert.equal(svgA.getAttribute('id'), 'host-icon', 'the host node itself is untouched');
  assert.equal(api.mountMoreGlyph(placeholder, doc, 'Panels B'), false, 'no glyph on the host row means no clone');
  assert.equal(placeholder.children.length, 0, 'the placeholder is left empty');
  assert.equal(api.mountMoreGlyph(null, doc, 'Panels A'), false, 'no placeholder, no crash');
  api.clearMoreGlyphs();
  assert.equal(api.mountMoreGlyph(placeholder, null, 'Panels A'), false, 'no document and nothing remembered, no crash');
  /* The host stops rendering a row once its panel is pinned away; the icon has
     to survive that, so the last clone is remembered per panel id. */
  api.clearMoreGlyphs();
  const emptyDoc = { querySelectorAll: () => [] };
  assert.equal(api.mountMoreGlyph(placeholder, emptyDoc, 'Panels A', 'a'), false, 'nothing remembered yet');
  assert.equal(api.mountMoreGlyph(placeholder, doc, 'Panels A', 'a'), true, 'a live row is captured');
  assert.equal(api.mountMoreGlyph(placeholder, emptyDoc, 'Panels A', 'a'), true, 'the remembered glyph fills the slot');
  assert.equal(placeholder.children.length, 1, 'still exactly one clone');
  assert.equal(placeholder.children[0].tagName, 'SVG');
  api.clearMoreGlyphs();
  assert.equal(api.mountMoreGlyph(placeholder, emptyDoc, 'Panels A', 'a'), false, 'forgetting the glyph empties the slot');
  assert.equal(placeholder.children.length, 0);
  /* The fold pass runs while the row is still rendered; that is the moment the
     icon has to be remembered, because pinning the panel away removes the row. */
  /* The real host puts its slot anchor (display:contents) between the glyph span
     and the drawing: the clone must be the drawing, never a duplicated slot. */
  const anchor = element('div');
  anchor.setAttribute('data-slot', 'sidebar.panellist');
  anchor.setAttribute('style', 'display: contents;');
  const nestedSvg = element('svg');
  nestedSvg.setAttribute('id', 'nested-icon');
  anchor.appendChild(nestedSvg);
  anchor.querySelector = (selector) => (selector === 'svg, img, canvas' ? nestedSvg : null);
  const wrapped = element('span');
  wrapped.setAttribute('class', 'panelGlyph');
  wrapped.appendChild(anchor);
  assert.equal(api.glyphIconNodeOf(wrapped), nestedSvg, 'the drawing inside the slot anchor is the icon');
  const wrappedRow = element('button');
  wrappedRow.setAttribute('class', 'panelRow');
  wrappedRow.setAttribute('aria-label', 'Panels C');
  wrappedRow.appendChild(wrapped);
  wrappedRow.querySelector = (selector) => (selector === 'span[class*="panelGlyph"]' ? wrapped : null);
  const wrappedDoc = {
    querySelectorAll: (selector) =>
      selector === 'nav[class*="panelList"] button[class*="panelRow"]' ? [wrappedRow] : [],
  };
  assert.equal(api.mountMoreGlyph(placeholder, wrappedDoc, 'Panels C', 'c'), true, 'a wrapped glyph still clones');
  assert.equal(placeholder.children[0].tagName, 'SVG', 'the clone is the drawing, not the anchor');
  assert.equal(placeholder.children[0].getAttribute('data-slot'), null, 'no slot marker is duplicated');
  assert.equal(placeholder.children[0].getAttribute('id'), null, 'nested ids are stripped too');
  api.clearMoreGlyphs();
  api.applyFoldState(doc, [{ id: 'a', label: 'Panels A' }], api.defaultSettings(), globalThis.localStorage, new Map());
  assert.equal(
    api.mountMoreGlyph(placeholder, emptyDoc, 'Panels A', 'a'),
    true,
    'the fold pass remembers the glyph before the row disappears',
  );
  assert.equal(placeholder.children.length, 1, 'the remembered clone is what the slot gets');
  api.clearMoreGlyphs();
  assert.equal(api.panelRowOf(doc, 'Panels B'), rowB, 'the row is found by its aria-label');
  assert.equal(api.panelRowOf(doc, 'Nobody'), null, 'an unknown panel has no row');
  const menu = api.SidebarMoreMenu({
    entries: [{ id: 'a', label: 'Panels A', pinned: true }],
    onOpen: () => {},
    onPinnedChange: () => {},
    onDismiss: () => {},
  });
  const row = menu.children.find((child) => child.props?.['data-uic-more-row'] === 'a');
  const main = row.props.children[0];
  const slot = main.props.children.find((child) => child.props?.['data-uic-more-glyph'] === 'a');
  assert.ok(slot, 'the row reserves a glyph slot left of the name');
  assert.equal(typeof slot.props.ref, 'function', 'the slot is filled by a ref once it is in the document');
  const original = globalThis.document.querySelectorAll;
  globalThis.document.querySelectorAll = doc.querySelectorAll;
  try {
    const mounted = element('span');
    slot.props.ref(mounted);
    assert.equal(mounted.children.length, 1, 'mounting the slot fills it with the clone');
    slot.props.ref(mounted);
    assert.equal(mounted.children.length, 1, 'a re-render refills it without stacking');
    slot.props.ref(null);
  } finally {
    globalThis.document.querySelectorAll = original;
  }
});

test('sidebar more: folding takes the icon with the text', () => {
  resetStorage();
  const inner = element('button');
  inner.setAttribute('class', 'panelRow');
  inner.setAttribute('aria-label', 'Panels A');
  const innerGlyph = element('span');
  innerGlyph.setAttribute('class', 'panelGlyph');
  inner.appendChild(innerGlyph);
  inner.querySelector = (selector) => (selector === 'span[class*="panelGlyph"]' ? innerGlyph : null);
  const wrap = element('div');
  const outerGlyph = element('span');
  outerGlyph.setAttribute('class', 'panelGlyph');
  wrap.appendChild(outerGlyph);
  const outside = element('button');
  outside.setAttribute('class', 'panelRow');
  outside.setAttribute('aria-label', 'Panels B');
  outside.querySelector = () => null;
  wrap.appendChild(outside);
  wrap.querySelector = (selector) => (selector === 'span[class*="panelGlyph"]' ? outerGlyph : null);
  const nav = element('nav');
  nav.setAttribute('class', 'panelList');
  nav.appendChild(inner);
  nav.appendChild(wrap);
  const doc = {
    querySelectorAll: (selector) =>
      selector === 'nav[class*="panelList"] button[class*="panelRow"]' ? [inner, outside] : [],
  };
  const panels = [
    { id: 'a', label: 'Panels A' },
    { id: 'b', label: 'Panels B' },
  ];
  const touched = new Map();
  const on = api.defaultSettings();
  api.applyFoldState(doc, panels, on, globalThis.localStorage, touched);
  assert.equal(api.foldUnitOf(inner), inner, 'a row that owns its glyph is its own unit');
  assert.equal(api.foldUnitOf(outside), wrap, 'an icon beside the button folds through the wrapper');
  assert.equal(inner.style.display, 'none', 'the whole row goes, icon included');
  assert.equal(wrap.style.display, 'none', 'the wrapper goes, so the icon goes too');
  assert.equal(outside.style.display, undefined, 'the button is not touched when the wrapper carries the icon');
  assert.equal(nav.style.display, undefined, 'nav is never hidden');
  const off = { ...on, sidebarMore: { foldAll: false } };
  api.applyFoldState(doc, panels, off, globalThis.localStorage, touched);
  assert.equal(inner.style.display, '', 'the row comes back');
  assert.equal(wrap.style.display, '', 'the wrapper comes back');
  assert.equal(touched.size, 0, 'nothing stays tracked after unfolding');
  const orphan = element('button');
  orphan.setAttribute('class', 'panelRow');
  orphan.querySelector = () => null;
  nav.appendChild(orphan);
  assert.equal(api.foldUnitOf(orphan), orphan, 'a row directly under nav is its own unit');
});

test('sidebar more: the first frame already looks host-drawn, so nothing flashes', () => {
  const css = source;
  assert.ok(
    css.includes('.uic-moreRow{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:34px;padding:0 8px'),
    'the fallback row keeps the host metrics and no extra padding',
  );
  assert.equal(css.includes('.uic-moreRow + .uic-moreRow'), false, 'the old border between fallback rows is gone');
  assert.equal(css.includes('padding:4px 2px'), false, 'the old cramped padding is gone');
  assert.equal(css.includes('setTimeout(() => setSampled('), false, 'the sample no longer waits for a timer tick');
  assert.equal(css.split('setSampled(').length - 1, 1, 'the sample lands in exactly one place, so there is no mid-way state');
  assert.ok(css.includes('ref: ensureSample'), 'every row takes the sample in its ref, before the browser paints');

  const props = {
    entries: [{ id: 'a', label: 'Panels A', pinned: true, active: false }],
    onOpen: () => {},
    onPinnedChange: () => {},
    onDismiss: () => {},
  };
  const savedDoc = globalThis.document;
  const blindDoc = { querySelector: () => null, querySelectorAll: () => [] };
  let menuEl = null;
  try {
    globalThis.document = blindDoc;
    menuEl = api.SidebarMoreMenu(props);
  } finally {
    globalThis.document = savedDoc;
  }
  const row = menuEl.children.find((child) => child.props?.['data-uic-more-row'] !== undefined);
  assert.ok(row, 'the menu still renders a row');
  assert.equal(typeof row.props.ref, 'function', 'the row samples the host in its ref, before the browser paints');
  try {
    globalThis.document = blindDoc;
    assert.equal(row.props.ref(), false, 'with no host item yet it says so instead of inventing a style');
  } finally {
    globalThis.document = savedDoc;
  }
});

test('sidebar more: a clone keeps the ids its own drawing references', () => {
  const svg = element('svg');
  svg.setAttribute('id', 'decorative-id');
  const symbol = element('symbol');
  symbol.setAttribute('id', 'sprite-clock');
  const use = element('use');
  use.setAttribute('href', '#sprite-clock');
  svg.appendChild(symbol);
  svg.appendChild(use);
  const row = element('button');
  row.setAttribute('class', 'panelRow');
  row.setAttribute('aria-label', 'Panels A');
  const glyph = element('span');
  glyph.setAttribute('class', 'panelGlyph');
  glyph.appendChild(svg);
  row.querySelector = (selector) => (selector === 'span[class*="panelGlyph"]' ? glyph : null);

  const clone = api.glyphCloneOf(row);
  assert.ok(clone, 'the drawing is cloned');
  const walk = (item, into) => {
    into.push(item);
    for (const child of item.children ?? []) walk(child, into);
    return into;
  };
  const all = walk(clone, []);
  const names = all.map((item) => item.getAttribute?.('id')).filter(Boolean);
  assert.deepEqual(names, ['sprite-clock'], 'referenced ids stay, decorative ones go');
  assert.ok(
    all.some((item) => item.getAttribute?.('href') === '#sprite-clock'),
    'the <use> still points at the symbol it kept',
  );
});

test('a host without a settings page gets no page instead of a crash', () => {
  resetStorage();
  /* `ui-settings: enabled: false` is a legal profile: `settings.section` is then
   * never declared. Registering into it throws, and a throwing entry takes the
   * whole web boot down — measured on meru-test 2026-11-17. */
  const ctx = fakeCtx({});
  const injected = [];
  ctx.scope.slots.spec = () => undefined;
  ctx.scope.slots.inject = (key, callback) => {
    injected.push(key);
    callback();
    return () => {};
  };
  api.apply(ctx.scope, {});
  assert.ok(injected.includes('settings.section'), 'the slot was asked for');
  assert.equal(ctx.registered.length, 0, 'nothing is registered into a slot that does not exist');
  for (const dispose of ctx.disposes) dispose();
});


console.log('');
if (failed > 0) {
  console.log('FAILED — ' + failed + ' of ' + groups + ' groups');
  process.exit(1);
}
console.log('PASS — ' + groups + ' groups');

