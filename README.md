# dsh-ui-controller

> Inspect and control the UI that other plugins register into DeepSeek Harness slots.

DSH renders its interface from **slots**: named seats that plugins register entries
into. This plugin shows you every seat, who is sitting in it, and lets you hide or
re-order the ones you did not write yourself — without touching their code, their
registration, or their React tree.

It is a plugin-*management* tool, not a theming tool. If you want to restyle DSH,
use CSS. If you want to know why the same entry appears twice, or why the gear menu
is missing, this is the plugin that answers that.

## What it does

1. **Inventory (read-only).** A settings section lists every slot of the running
   build — **109** of them in this one: `single 43 · list 42 · keyed 20 · chain 4`,
   scoped `root 53 · session 51 · session-maybe 5`. The list comes from
   `slots.snapshot()` at runtime; the bundled table (same 109 keys, generated from
   `CLIENT_SLOT_API`) is only the fallback when the registry is unavailable, plus the
   source of the `replaceRisk` and `purpose` annotations, which are documentation
   rather than runtime state.

   The page is **grouped by slot**, because 269 entries in one flat list is not a
   directory, it is a haystack. Three zones, in this order: **risky**
   (`shadows-shipped-ui` seats, hatched), **safe**, and **empty seats**. Every zone
   and every slot starts **folded**; the slot head already tells you the key, the
   kind, the declared risk and how many entries are inside, so scanning the folded
   list is the fast path. Unfolding is per slot, and the state lives outside the
   component (`openNodes`), so a host re-render or the two-second inventory tick
   does **not** spring it back open.

   Three filters sit above the zones and combine: a **search** box (matches the slot
   key, the declared purpose, the entry id, and either registrant column), a **risk**
   filter (`all` / `risky` / `safe`), and a **binding** filter (`all` / `bound` /
   `unbound`; empty seats cannot be bound, so they drop out of `bound`). The count
   next to them is the number of entries that survived, not the number of slots —
   that is the number you were hunting for.

   Each entry row shows the entry id, the live registrant with the static inference
   beside it, priority, host order, our visual order, state tags, and the controls.
2. **Visibility switches (CSS layer).** For a **third-party** entry in a repeatable
   (`list` / `keyed` / `chain`) slot you can bind the element it renders once, then
   hide and restore it at will. Hiding sets one `data-uic-hidden` attribute and one
   stylesheet rule; it never unmounts the component, never removes somebody else's
   node, and is undone by a single click. Entries we cannot locate honestly say
   **"cannot locate"** and explain why: the host exposes no entry→DOM mapping, so a
   binding is required first.
3. **Visual order (CSS `order`).** For any bound third-party entry, `↑`/`↓` step a
   number that is written to the element's inline `style.order`. Elements are
   re-read on every pass and grouped by `parentElement`; only containers whose
   computed `display` is `flex`, `inline-flex` or `grid` are touched, because those
   are the only ones where CSS can re-order children. Slot entries sit inside a
   `[data-slot]` anchor with `display: contents`, so the search walks outward past
   every `contents` ancestor until it finds the element that actually lays out the
   box — judging the anchor would refuse every entry the host renders. Nothing is normalised: negative values
   are kept (they paint before the shipped entries), and a value of `0` drops the key
   instead of being stored. Unbinding, restoring defaults or tearing the plugin down
   clears `style.order` on every node we wrote to.
4. **Binding and unbinding.** An entry only becomes controllable once you bind it
   to a DOM element (the host publishes no entry→DOM map). A bound row carries an
   **Unbind** button; unbinding drops the binding *and* the visual order stored for
   that key in the same write, so no number is left behind that could never be
   applied again.
5. **Presets.** Hide-marks and visual order can be captured as named presets, applied,
   and deleted; storage follows the same rules as `better-notice` (unknown keys are
   preserved, user changes are marked, upgrades do not overwrite).
6. **Chat scrolling: wheel damping.** A wheel over the chat pane is eased instead of
   jumping: each tick is normalised (`deltaMode` 0 px / 1 ×16 px per line / 2 ×90% of
   the viewport), added to a target `scrollTop`, and stepped toward it in
   `requestAnimationFrame` with an exponential factor. Strength 1–5 maps to
   `k = [0.10, 0.14, 0.18, 0.24, 0.32]` (default 3), and `chatScroll.damping`
   (default on) switches it off entirely; both apply live. The container is the
   host's `[data-conversation-scroll]` — the class beside it is hashed and is never
   used. Three rules keep it from fighting the page: **the host always wins** (a
   `scroll` that lands more than 2px from the value we last wrote cancels the easing
   and re-syncs — autofollow while streaming keeps working), **the page is never
   trapped** (up at the top or down at the bottom leaves the event alone, so native
   overscroll stays), and **nested scrollers keep their own wheel** (a terminal, an
   overflowing code block or an inner list is not ours to slow down). Keys
   (PageUp/PageDown/Home/End/arrows/space), pointerdown, touchstart and window blur
   all cancel immediately; `prefers-reduced-motion: reduce` installs no listener at
   all.

## What it deliberately does **not** do

- **No moving other plugins' entries.** An entry's props come from the slot spec
  that declared it. Re-registering it elsewhere loses that context and is how you
  get a blank panel instead of a working one.
- **No unregistering, no unmounting.** Everything this plugin does is reversible by
  removing an attribute, an inline style, or a stylesheet rule.
- **No switch on a `single` slot.** A `single` slot has exactly one occupant, so
  re-registering it *replaces* that occupant: the shipped UI leaves the DOM. Rows
  for an occupied `single` show the reason and no controls at all — hiding there is
  shadowing, and `sidebar.settings` already taught the project what that costs
  (`TypeError: c is not a function`, gear row and settings panel gone together).
- **No controls on built-in entries.** Two independent flags decide what a row may
  do, and neither is the live registrant:
  - `builtin` — the entry id *is* a shipped package (`@deepseek-ai/dsh…`,
    `dsh-client-ui-…`, `dsh-experimental-…`), or the slot is `single` and its
    static registrar is a shipped package. Such rows are read-only and say
    **"built-in UI · hiding it removes shipped chrome"**.
  - `risky` — the *slot* is marked `shadows-shipped-ui`. That is an annotation
    about the seat, not about the entry in it, so a third-party entry sitting in a
    risky slot keeps its controls and only carries a risk tag.
  - `shippedSlot` — every registrar listed for this (non-`single`) slot is a
    shipped package. That is a *note*, not a gate: keyed slots register per key
    with no entry→registrar map, so the slot cannot say which row came from where.
    Rows there say **"shipped slot"** and keep their controls, because cleaning up
    host menu items is the whole point — the three states never impersonate one
    another.

  The live registrant cannot answer this question: every dynamically loaded plugin
  reports the same runner name (`tk`), so both our own entries and the shipped ones
  look identical there.
- **No registration into `root`** — the one slot in this build marked
  "DO NOT register".
- **No disabling plugins.** That is the profile's job (`dsh plugin remove`), and
  doing it from the browser half would leave the host half loaded.

Honest limits of v1: hiding and re-ordering work only for entries you have bound by
hand (the host does not publish an entry→DOM map); visual order only changes paint
order, so keyboard Tab order is unaffected; the inventory refreshes on a 2-second
timer rather than pushing.

## Install

```
dsh plugin --profile <profile> add dsh-ui-controller
```

Then reload that profile's window (`Ctrl+R` is enough for a client-only change).
The new **界面控制 / UI controller** section appears in Settings. Do not install it
into the profile you use as your production desktop unless you want to experiment
on it.

## JavaScript API

```js
const api = window.__UI_CONTROLLER__;

api.version                                  // '0.2.1'
api.catalog()                                // → [{ key, kind, scope, risk, purpose, registrantStatic, injectStatic }]
api.catalogSummary()                         // → { total: 109, kinds: {...} }
api.inventory()                              // → { rows, empty, totalSlots, occupiedSlots, hiddenCount,
                                             //     riskyCount, locatorCount, orderedCount, catalogSource }

api.settings.get()                           // → { version, hidden, locators, visualOrder, presets, activePreset }
api.settings.set({ hidden: {...} })          // merge, then apply immediately
api.settings.reset()                         // back to defaults
api.settings.presets()                       // → ['compact', ...]
api.settings.savePreset('compact')           // → { ok, presets, activePreset }
api.settings.applyPreset('compact')          // → { ok, hidden, visualOrder, activePreset }

api.apply()                                  // re-run the CSS layer now
```

Entry keys in `hidden`, `locators` and `visualOrder` are `"<slotKey>::<entryId>"`.
The field used to be called `order`; old saves are read through an alias, so nothing
has to be re-entered (settings version stays `1`).

### For an assistant reading this on a user's behalf

Everything the settings page shows is also in `api.inventory()` as plain data, so
you can answer "why is my gear menu gone" or "which slot is this plugin using"
without scraping the DOM. When a user wants an entry hidden, prefer the settings
page (it binds the element by clicking); when they want an audit, read
`api.inventory()` and filter by `registrant` or `risk`.

Two sentences that belong in any answer about ordering:

- **Visual order only changes CSS `order`; the keyboard Tab order does not change.**
- **Where another plugin's entry sits is decided by that plugin at registration
  time — the host exposes no runtime hook for it.** This plugin can only change
  paint order inside a shared parent.

## Test

```
node --check client.js
node --check index.js
node --check test/classify.test.mjs
node test/classify.test.mjs        # expect: PASS — 35 groups
node ..\..\cangku\tmp\261114_gate_ui_controller.mjs   # static gate, separate script
```

The unit tests load the real `client.js` with a React stub and a tiny DOM. They pin
the catalog shape (109 slots, 50 `shadows-shipped-ui`, the kind/scope split, the
`registrantStatic` 93 / `injectStatic` 84 coverage), the runtime-snapshot-over-static
priority, the inventory/empty split, the hide gate (no switch on shipped entries or
`single` slots), that hiding writes only our own record, the CSS order layer (flex
parents only, stale value cleared when the binding goes away), presets, sanitising
with the old `order` alias, and the zh/en dictionary parity. The grouped page has
its own groups: entries group under their slot with empty seats in their own zone,
the three filters count what they keep, folding starts closed and survives a
re-render, and the static fallback still draws slot heads when no live snapshot is
available.

## Known limits

1. **No entry→DOM mapping.** The slots core renders entries itself and marks
   nothing, so binding is manual. Rows without a binding show "cannot locate" with
   the reason instead of a control that does nothing.
2. **Hiding is not unloading.** A hidden entry still runs. If it is expensive, this
   plugin is not the tool — talk to the plugin's author.
3. **Visual order is CSS only.** It applies inside one flex/grid parent; a child of
   a `display: contents` or block parent is skipped, and nothing outside our bound
   elements is touched.
4. **Hash class names change every build.** Nothing here keys off them; only
   `data-*`, `role`, `aria-label`, `name` and `id` are used to build selectors.
5. **`root` is off limits.** Listing it is fine; registering into it is not.
6. **`registrant` is an inference.** The live value (`entry.registrant`) is only
   readable at runtime for entries present in the registry; the column shows the
   static proxy scanned out of the shipped bundles, so an entry registered by code
   that ships no literal key can read as "—".

## License

MIT
