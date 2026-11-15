# Changelog

Notable changes to `dsh-ui-controller`.

## 0.2.2 — 2026-11-15

### Fixed

- **The More menu rows carry the panel's own icon.** The icon is cloned at
  runtime from the live sidebar row — the first child of
  `span[class*="panelGlyph"]` — into a reserved slot left of the name, so no
  SVG is shipped here and no host class name is hardcoded. The slot is emptied
  before each fill (a host remount cannot stack copies), ids are stripped from
  the clone, and a panel without a readable glyph keeps an empty slot silently.
- **Folding takes the icon with the text.** `applyFoldState` now hides the
  element that actually wraps both: the row button normally, or the wrapper when
  the host draws the glyph beside the button. `nav` is never hidden, and
  unfolding restores every element it touched.

## 0.2.1 — 2026-11-15

### Fixed

- **The More button now carries its count, and folding survives a reload.**
  The launcher is found by its own `aria-label` under
  `nav[class*="panelList"]` — the wide rail has no
  `[data-shortcut-modal="sidebar"]` wrapper, so the previous lookup never
  matched and the count was never painted (and the aria-label is left untouched).
- **Folded panels are actually hidden now.** Writing the host's pin only happens
  while the menu is mounted, so a reload lost it; folding is now a
  `display:none` pass over the live panel rows, matched by `aria-label` /
  title, re-applied by a MutationObserver, and undone on teardown. A row we
  cannot identify is left alone.
- **The More menu rows look host-drawn.** The row class list and fixed sizes are
  sampled from a real host menu item at runtime (never a hardcoded hashed class);
  our own class is used until one is on screen.

### Removed

- **The two bulk buttons in the More menu.** Fold-all / unfold-all move to the
  settings page only (`sidebarMore.foldAll`); the menu keeps one per-row toggle,
  so the three conflicting controls the user saw cannot appear together.

## 0.2.0 — 2026-11-15

### Added

- **Left column folded behind the More button.** A new entry in
  `sidebar.panellist.actions` renders rows for every panel: click jumps and
  dismisses, a pin button per row folds/restores through the host's
  `onPinnedChange`, and fold-all / unfold-all actions cover the whole list. The
  folded ids are persisted (`dsh.uic.sidebarMore.v1`, `{ folded: string[] }`)
  because the host's own pin state is in-memory only, cleaned against the live
  panel set on every read, and replayed on every menu open / panel-list change.
  `sidebarMore.foldAll` (default on) decides the shape for fresh installs. The
  host's "More" launcher label gains a painted count (`更多 (3)`), only when the
  number changes.
- `window.__UI_CONTROLLER__` additions: none — the menu is a slot entry, not an
  API; the record lives under the normal settings storage.

### Removed

- **Three-state settings rail** (0.1.1's `nav` field, its CSS, its settings-page
  block and its i18n keys). The user chose the left column of the chat page over
  the settings dialog, so the whole width block is gone; `SETTINGS_VERSION`
  stays at 1 and the unknown-key preservation rules keep an old `nav` record
  harmless if it was ever written.

## 0.1.1 — 2026-11-14

### Added

- **Three-state settings rail.** The left column of the settings dialog is now
  `full` (188px), an `icon rail` (56px — labels hidden, each button keeps its
  name as a tooltip) or `collapsed` (0px). It defaults to **following the host
  sidebar**, using the same two readings the shipped code uses (an explicit
  `data-sidebar-collapsed` marker, or a sidebar measured 1–64px wide); turn
  following off to pick a state yourself. New settings field `nav`, stored with
  the rest, with no settings-version bump.

## 0.1.0 — 2026-11-14

First release with the inventory page.

### Added

- **Inventory of every slot in the running build.** 109 slots, grouped into a
  risk zone and a safe zone, with the entries the host is holding right now
  (`slots.snapshot()`) and a bundled 109-key table as the fallback.
- **Hide an entry** with a CSS rule you can undo, plus a locator you bind by
  clicking the element once (the host exposes no entry→DOM mapping, so a
  binding is required before a row can be hidden).
- **Visual order inside one container** via `style.order`; the host gives no
  runtime hook to change another plugin's registration order, and the UI says so.
- **Three filters** (search, risk, bound/unbound) and collapsible zones and slot
  groups; the collapse state survives the host's 30-second refresh because it is
  kept in module scope, not in component state.
- **Presets** that save and restore the whole hidden/order state.
- Display metadata: a Chinese title and description, plus an icon, for the
  plugin list (`locale/zh.json`, `locale/en.json`, `package.json` `icon`).

### Deliberately not done

- Registering on another plugin's behalf, rewriting another plugin's React tree,
  or disabling a bundle. A bundle-level toggle needs a restart and belongs to the
  host, not to this plugin.
