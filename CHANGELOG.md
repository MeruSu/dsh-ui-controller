# Changelog

Notable changes to `dsh-ui-controller`.

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
