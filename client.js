/**
 * `dsh-ui-controller` — client half.
 *
 * What this plugin does: it *reads* the host's slot registry and shows you what
 * every slot currently holds, lets you hide or re-order entries you did not
 * write yourself, and stores those decisions as named presets.
 *
 * What it deliberately does NOT do — read this before "improving" it:
 *
 *  - It never moves another plugin's entry. An entry's props come from the slot
 *    spec that declared it; re-registering it elsewhere loses that context.
 *  - It never unregisters or unmounts somebody else's entry. Hiding is a CSS
 *    class on the element plus an attribute we can remove again.
 *  - It never shadows a `single` slot. `sidebar.settings` taught us what
 *    happens: `TypeError: c is not a function` and the gear menu and the whole
 *    settings panel disappear together.
 *  - It never registers into `root`, the one slot in this build that says
 *    "DO NOT register".
 *  - It never mutates the array `slots.entries()` returns; that is the internal
 *    live array, and writing to it bypasses `markDirty`, so the UI never
 *    refreshes.
 *
 * Host facts this file depends on (verified against the shipped
 * `dsh-client-ui-slots/lib/index.js`): `entriesOfSlot(key)` is the safe
 * snapshot, sorted by `priority`; `spec(key)` gives `{kind, scope}`; an entry is
 * `{ options: { id?, key?, order?, label?, priority? }, registrant? }`; `list`
 * slots sort by `priority → order`, everything else by `priority` alone.
 */

const VERSION = '0.1.1';

const NS = 'uiController';
const SECTION_ID = 'ui-controller';
const SECTION_ORDER = 45;

const SETTINGS_KEY = 'dsh.uiController.settings.v1';
const PRESERVED_KEY = 'dsh.uiController.preserved.v1';
const BACKUP_KEY = 'dsh.uiController.backup.v1';
const BACKUP_LIMIT = 5;
const SETTINGS_VERSION = 1;

const HIDDEN_ATTR = 'data-uic-hidden';
const STYLE_ID = 'ui-controller-style';
const ROW_ATTR = 'data-uic-row';

const HIDE_CSS = [
  '[' + HIDDEN_ATTR + '="1"]{display:none !important}',
  '[' + HIDDEN_ATTR + '="1"]:is(li,tr){display:none !important}',
].join('\n');

const PAGE_CSS = [
  '.uic-page{display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary);contain:content}',
  '.uic-title{margin:0;font-size:16px;font-weight:600;line-height:24px}',
  '.uic-lead{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
  '.uic-summary{margin:0;font-size:12px;line-height:18px}',
  '.uic-dim{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.uic-h3{margin:10px 0 0;font-size:13px;font-weight:600;line-height:20px}',
  '.uic-mono{font-family:var(--ds-font-family-code);font-size:11px}',
  '.uic-num{text-align:right}',
  '.uic-ctl{display:inline-flex;gap:2px}',
  '.uic-ctl .uic-btn{min-width:22px;padding:0 4px}',
  '.uic-tag{display:inline-block;margin-right:4px;padding:0 5px;height:16px;line-height:16px;border-radius:4px;font-size:10px;border:1px solid var(--dsw-alias-border-l4);color:var(--dsw-alias-label-secondary)}',
  '.uic-tag-on{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}',
  '.uic-tag-risk{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
  '.uic-btn{height:26px;padding:0 9px;border-radius:6px;font-size:11px;cursor:pointer;border:1px solid var(--dsw-alias-border-l4);background:transparent;color:var(--dsw-alias-label-primary)}',
  '.uic-btn:hover{background:var(--dsw-alias-bg-layer-3)}',
  '.uic-btn-quiet{color:var(--dsw-alias-label-secondary)}',
  '.uic-why{display:inline-flex;align-items:center;gap:4px;font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
  '.uic-presets{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
  '.uic-input{height:26px;min-width:120px;padding:0 7px;border-radius:6px;font-size:11px;border:1px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
  '.uic-preset{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l4)}',
  '.uic-preset-name{font-size:11px}',
  '.uic-page{container-type:inline-size}',
  '.uic-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:2px 0}',
  '.uic-search{flex:1 1 180px;min-width:140px}',
  '.uic-filterGroup{display:inline-flex;gap:2px}',
  '.uic-filter{height:26px;padding:0 8px;border-radius:6px;font-size:11px;cursor:pointer;border:1px solid var(--dsw-alias-border-l4);background:transparent;color:var(--dsw-alias-label-secondary)}',
  '.uic-filter[data-on="true"]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}',
  '.uic-navSection{display:flex;flex-direction:column;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2)}',
  '.uic-navFollow{display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer}',
  '.uic-navStates{display:flex;gap:6px;flex-wrap:wrap}',
  '.uic-zone{border-top:.5px solid var(--dsw-alias-border-l2);padding:2px 0}',
  '.uic-zoneHead{display:flex;align-items:center;gap:6px;width:100%;height:32px;padding:0 2px;border:0;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;font-size:12px;font-weight:600}',
  '.uic-zoneName{flex:none}',
  '.uic-zoneHint{flex:1 1 auto;min-width:0;font-size:10px;font-weight:400;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.uic-zoneMeta{flex:none;font-size:10px;font-weight:400;color:var(--dsw-alias-label-tertiary)}',
  '.uic-zone-risky{background:repeating-linear-gradient(45deg,rgba(146,64,14,.045) 0 6px,transparent 6px 12px)}',
  '.uic-zoneBody{display:flex;flex-direction:column;gap:1px;padding:1px 0 4px}',
  '.uic-slot{border-top:.5px solid var(--dsw-alias-border-l2)}',
  '.uic-slotHead{display:grid;grid-template-columns:14px 12px minmax(0,1fr) 46px 58px 96px;align-items:center;gap:6px;width:100%;height:32px;padding:0 4px;border:0;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;font-size:11px}',
  '.uic-slotRisk{box-shadow:inset 3px 0 0 #b45309;color:#92400e}',
  '.uic-slotKey{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.uic-kind{font-size:10px;color:var(--dsw-alias-label-tertiary)}',
  '.uic-count{justify-self:end;font-size:10px;color:var(--dsw-alias-label-tertiary)}',
  '.uic-mark{font-size:10px;text-align:center}',
  '.uic-arrow{font-size:9px;text-align:center;color:var(--dsw-alias-label-tertiary)}',
  '.uic-entries{display:flex;flex-direction:column;gap:1px;padding:1px 0 3px 26px}',
  '.uic-entry{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 40px 40px 40px minmax(0,1fr) auto;align-items:center;gap:6px;min-height:32px;padding:0 4px;border-top:.5px solid var(--dsw-alias-border-l2)}',
  '.uic-entryId{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.uic-entryLive{font-size:10px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.uic-entryState{display:flex;gap:2px;flex-wrap:wrap}',
  '.uic-entryActions{display:flex;align-items:center;gap:4px;justify-self:end}',
  '@container (max-width:620px){.uic-slotHead{grid-template-columns:14px 12px minmax(0,1fr) 46px minmax(0,1fr);height:auto;min-height:44px}.uic-slotHead .uic-kind{display:none}.uic-entry{grid-template-columns:minmax(0,1fr) auto auto;min-height:44px}.uic-entry .uic-entryLive,.uic-entry .uic-num{display:none}}',
].join('\n');

/* ------------------------------------------------- settings page left rail */

const NAV_ATTR = 'data-uic-nav';
const PANEL_SELECTOR = 'div[data-shortcut-modal="settings"]';
const PANEL_NAV_STATES = ['expanded', 'rail', 'hidden'];
const NAV_WIDTHS = { expanded: 188, rail: 56, hidden: 0 };
const HOST_SIDEBAR_RAIL_MAX = 64;

/** Width of the settings rail, in px, for one of the three states. */
function navWidthOf(state) {
  return hasOwn(NAV_WIDTHS, state) ? NAV_WIDTHS[state] : NAV_WIDTHS.expanded;
}

/**
 * First grid track of the settings modal.
 *
 * Longhand on purpose: the host's shorthand also carries grid area names that
 * are hashed per build, so copying the whole declaration would break on the
 * next release. Only the first track belongs to us.
 */
function navColumnsOf(state) {
  return navWidthOf(state) + 'px minmax(0, 1fr)';
}

/*
 * Collapsing only means something while the host draws the rail as a vertical
 * column; below 768px it becomes a horizontal tab strip, where hiding the
 * labels would leave an unlabelled bar. Same breakpoint the host uses.
 *
 * Only the two collapsed states claim a track. Leaving `expanded` untouched
 * means the host keeps ownership of its own width: if a later build widens the
 * rail, we inherit it instead of pinning an old number.
 */
const NAV_CSS = [
  '@media (min-width:768px){',
  ...PANEL_NAV_STATES.filter((state) => state !== 'expanded').map(
    (state) =>
      PANEL_SELECTOR + '[' + NAV_ATTR + '="' + state + '"]{grid-template-columns:' + navColumnsOf(state) + ' !important}',
  ),
  PANEL_SELECTOR + '[' + NAV_ATTR + '="rail"] > nav{padding:10px 6px 0;overflow:hidden}',
  PANEL_SELECTOR + '[' + NAV_ATTR + '="rail"] > nav button{justify-content:center;padding:8px 0;gap:0}',
  PANEL_SELECTOR +
    '[' +
    NAV_ATTR +
    '="rail"] > nav button > span:nth-child(2){position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}',
  PANEL_SELECTOR + '[' + NAV_ATTR + '="hidden"]{overflow:hidden}',
  PANEL_SELECTOR + '[' + NAV_ATTR + '="hidden"] > nav{display:none}',
  '}',
].join('\n');

/** Only the three stored states are meaningful; anything else is "expanded". */
function stateOr(value) {
  return PANEL_NAV_STATES.includes(value) ? value : 'expanded';
}

/**
 * Whether the host's own session sidebar is currently a rail.
 *
 * Two readings, both taken from the shipped behaviour rather than invented
 * here: an explicit `data-sidebar-collapsed` marker anywhere in the document,
 * or a sidebar element measured between 1px and 64px. The three sidebar
 * selectors are the ones the shipped code probes, in the same order; a
 * different threshold would make the two disagree the moment the host changes
 * its width.
 */
function hostSidebarCollapsed(doc) {
  if (doc === null || doc === undefined || typeof doc.querySelector !== 'function') return false;
  try {
    if (doc.querySelector('[data-sidebar-collapsed]') !== null) return true;
    const sidebar =
      doc.querySelector('[data-slot="sidebar"]') ??
      doc.querySelector('div[class*="sidebarCol"]') ??
      doc.querySelector('div[class*="hHd-Xa_root"]');
    if (sidebar === null || sidebar === undefined || typeof sidebar.getBoundingClientRect !== 'function') return false;
    const measured = sidebar.getBoundingClientRect().width;
    return Number.isFinite(measured) && measured > 0 && measured <= HOST_SIDEBAR_RAIL_MAX;
  } catch {
    return false;
  }
}

/**
 * Which of the three states applies right now.
 *
 * `follow` on (the default) means the rail mirrors the host sidebar, and the
 * stored three-way choice is deliberately not read at all — that is the whole
 * point of following.
 */
function resolveNavState(settings, doc) {
  const nav = isPlainObject(settings) && isPlainObject(settings.nav) ? settings.nav : {};
  if (nav.follow !== false) return stateOr(hostSidebarCollapsed(doc) ? 'rail' : 'expanded');
  return stateOr(nav.state);
}

const PRESET_NAME_MAX = 40;
const SELECTOR_MAX = 240;
const LOCATOR_LIMIT = 400;

const SLOT_CATALOG = [
  /* Generated from cangku/tmp/261114_p8v_slots_catalog.tsv (109 rows, 12 columns).
     `registrant` is a runtime-only field (entry.registrant = options.registrant ?? fiber.name)
     and no inspect channel exposes it, so the two static proxies below are what we can
     honestly show: who declares the slot and who injects it, derived at build time. */
    { key: 'contextMenu.content', kind: 'keyed', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Optional React rows for existing extension positions; data contributions need no renderer.', registrantStatic: 'dsh-client-ui-sidebar-right×1; dsh-client-ui-workspace×1', injectStatic: 'dsh-client-ui-sidebar-right×1; dsh-client-ui-workspace×1' },
    { key: 'contextMenu.icon', kind: 'keyed', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Business-owned glyph or image selected by the action\'s icon key.', registrantStatic: 'dsh-client-ui-open-in-app×2; dsh-client-ui-file-actions×1; dsh-client-ui-sidebar-right×1; dsh-client-ui-workspace×1', injectStatic: 'dsh-client-ui-file-actions×1; dsh-client-ui-open-in-app×1; dsh-client-ui-sidebar-right×1; dsh-client-ui-workspace×1' },
    { key: 'conversation.approval.detail', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Optional detail for the Tool call correlated with an approval request.', registrantStatic: 'dsh-client-ui-chat×1', injectStatic: 'dsh-client-ui-chat×1' },
    { key: 'conversation.chat.assistant-actions', kind: 'list', scope: 'session', risk: 'none', purpose: 'Ordered actions for one finalized assistant message.', registrantStatic: 'dsh-client-ui-message-feedback×1', injectStatic: 'dsh-client-ui-message-feedback×1' },
    { key: 'conversation.chat.commandview', kind: 'keyed', scope: 'session', risk: 'none', purpose: 'Command row keyed by the command name.', registrantStatic: '', injectStatic: '' },
    { key: 'conversation.chat.flow', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Ordered Chat rows and local echoes with viewport-bound visibility hooks.', registrantStatic: 'dsh-client-ui-chat×1', injectStatic: 'dsh-client-ui-chat×1' },
    { key: 'conversation.chat.message.images', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Renderer for one consecutive group of durable message images.', registrantStatic: 'dsh-client-ui-attachment×1', injectStatic: 'dsh-client-ui-attachment×1' },
    { key: 'conversation.chat.node', kind: 'keyed', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Final Chat node renderer, keyed by `ChatNodeKind`.', registrantStatic: 'dsh-client-ui-chat×15; dsh-client-ui-goal×1; dsh-client-ui-tool×1; dsh-client-ui-user-questions×1; dsh-client-ui-workflow-run×1', injectStatic: 'dsh-client-ui-chat×15; dsh-client-ui-goal×1; dsh-client-ui-tool×1; dsh-client-ui-user-questions×1; dsh-client-ui-workflow-run×1' },
    { key: 'conversation.chat.reasoning.body', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Expanded reasoning body with raw and display-ready text.', registrantStatic: 'dsh-client-ui-chat×1; dsh-experimental-client-ui-cot-translation×1', injectStatic: 'dsh-client-ui-chat×1; dsh-experimental-client-ui-cot-translation×1' },
    { key: 'conversation.chat.text-interaction', kind: 'keyed', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Area-local text gestures and surfaces; each consumer registers its own synchronous admission.', registrantStatic: 'dsh-message-quotes×1', injectStatic: 'dsh-message-quotes×1' },
    { key: 'conversation.chat.turnTail', kind: 'list', scope: 'session', risk: 'none', purpose: 'Ordered feature contributions before a completed Turn\'s action row.', registrantStatic: 'dsh-client-ui-action-cards×1; dsh-client-ui-deliverables×1; dsh-client-ui-plan×1; dsh-client-ui-schedule×1', injectStatic: 'dsh-client-ui-action-cards×1; dsh-client-ui-deliverables×1; dsh-client-ui-plan×1; dsh-client-ui-schedule×1' },
    { key: 'conversation.chat.user.before', kind: 'chain', scope: 'session', risk: 'none', purpose: 'Message-source decoration owned and rendered by the user Node entry.', registrantStatic: 'dsh-experimental-liveshare×1', injectStatic: 'dsh-experimental-liveshare×1' },
    { key: 'conversation.chat.user.images', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'User-message images, including pending and local-echo previews, independently replaceable from output images.', registrantStatic: 'dsh-client-ui-attachment×1', injectStatic: 'dsh-client-ui-attachment×1' },
    { key: 'conversation.composer', kind: 'chain', scope: 'session', risk: 'none', purpose: 'Selector-routed replacements for the current Session\'s resident composer; fixed overlays must portal to the document body because the docked composer contains ', registrantStatic: 'dsh-client-ui-approval×1; dsh-client-ui-subagent×1; dsh-client-ui-user-questions×1', injectStatic: 'dsh-client-ui-approval×1; dsh-client-ui-subagent×1; dsh-client-ui-user-questions×1' },
    { key: 'conversation.composer.bar', kind: 'single', scope: 'session-maybe', risk: 'shadows-shipped-ui', purpose: 'Resident composer body, including the no-Session inert state; fixed overlays must portal to the document body because the docked composer contains them.', registrantStatic: 'dsh-client-ui-conversation×1', injectStatic: '' },
    { key: 'conversation.composer.dock', kind: 'list', scope: 'session', risk: 'none', purpose: 'Ambient entries below the composer card; fixed overlays must portal to the document body because the docked composer contains them.', registrantStatic: 'dsh-client-ui-chat×2', injectStatic: 'dsh-client-ui-chat×1' },
    { key: 'conversation.header', kind: 'single', scope: 'session-maybe', risk: 'shadows-shipped-ui', purpose: 'Resident navigation container, including when no Session is selected.', registrantStatic: 'dsh-client-ui-conversation×1', injectStatic: '' },
    { key: 'conversation.header.leading', kind: 'single', scope: 'root', risk: 'none', purpose: 'Global navigation before the Session title, available without a Session.', registrantStatic: '', injectStatic: '' },
    { key: 'conversation.hero.agentPreset', kind: 'single', scope: 'session-maybe', risk: 'shadows-shipped-ui', purpose: 'Agent-preset control staged for a New Session.', registrantStatic: 'dsh-client-ui-agent-preset×1', injectStatic: '' },
    { key: 'conversation.hero.brand.mark', kind: 'single', scope: 'root', risk: 'none', purpose: 'Brand mark shown before the blank-session headline.', registrantStatic: '', injectStatic: '' },
    { key: 'conversation.hero.options', kind: 'list', scope: 'session', risk: 'none', purpose: 'Compact options right-aligned in the New Session row after the workspace and preset controls; rendered only with a Session.', registrantStatic: 'dsh-experimental-client-ui-forge×1', injectStatic: 'dsh-experimental-client-ui-forge×1' },
    { key: 'conversation.hero.workspace', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Workspace picker shown by the blank-session Hero.', registrantStatic: 'dsh-client-ui-workspace×1', injectStatic: 'dsh-client-ui-workspace×1' },
    { key: 'conversation.hero.workspace.directoryFlow', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Directory-flow hole under the conversation empty-state picker (declared by the WorkspacePicker entry).', registrantStatic: 'dsh-client-ui-directory-picker-browse×1; dsh-client-ui-directory-picker-native×1', injectStatic: 'dsh-client-ui-directory-picker-browse×1; dsh-client-ui-directory-picker-native×1' },
    { key: 'conversation.input.activity', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Compact action after the model selector; it can expand across the toolbar while retaining the editor and submit action, and fixed overlays must portal to the do', registrantStatic: 'dsh-experimental-client-ui-voice-input×1', injectStatic: 'dsh-experimental-client-ui-voice-input×1' },
    { key: 'conversation.input.attachments', kind: 'single', scope: 'session-maybe', risk: 'shadows-shipped-ui', purpose: 'Optional draft-attachment rail and drop target; fixed overlays must portal to the document body because the docked composer contains them.', registrantStatic: 'dsh-client-ui-attachment×1', injectStatic: 'dsh-client-ui-attachment×1' },
    { key: 'conversation.input.dock', kind: 'list', scope: 'session', risk: 'none', purpose: 'Full-width entries above the composer card; fixed overlays must portal to the document body because the docked composer contains them.', registrantStatic: 'dsh-client-ui-conversation×2; dsh-client-ui-goal×1; dsh-experimental-client-ui-forge×1', injectStatic: 'dsh-client-ui-conversation×2; dsh-client-ui-goal×1; dsh-experimental-client-ui-forge×1' },
    { key: 'conversation.input.left', kind: 'list', scope: 'session', risk: 'none', purpose: 'Compact controls at the left of the composer tool row; fixed overlays must portal to the document body because the docked composer contains them.', registrantStatic: '', injectStatic: '' },
    { key: 'conversation.input.model', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Model selector inside the composer tool row.', registrantStatic: 'dsh-client-ui-model-selection×1; dsh-experimental-liveshare×1', injectStatic: 'dsh-client-ui-model-selection×1; dsh-experimental-liveshare×1' },
    { key: 'conversation.input.model.label', kind: 'single', scope: 'session', risk: 'none', purpose: 'Non-interactive inline model label; selection controls remain owner-managed.', registrantStatic: '', injectStatic: '' },
    { key: 'conversation.input.overlay', kind: 'list', scope: 'session', risk: 'none', purpose: 'Floating entries rendered inside the resident composer card; fixed overlays must portal to the document body because the docked composer contains them.', registrantStatic: 'dsh-client-ui-commands×1; dsh-client-ui-input-trigger×1; dsh-client-ui-message-feedback×1', injectStatic: 'dsh-client-ui-commands×1; dsh-client-ui-input-trigger×1; dsh-client-ui-message-feedback×1' },
    { key: 'conversation.input.permission', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Current-session permission control inside the composer tool row; fixed overlays must portal to the document body because the docked composer contains them.', registrantStatic: 'dsh-client-ui-permission-presets×1; dsh-experimental-liveshare×1', injectStatic: 'dsh-client-ui-permission-presets×1; dsh-experimental-liveshare×1' },
    { key: 'conversation.input.plan', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Plan control inside the composer tool row; fixed overlays must portal to the document body because the docked composer contains them.', registrantStatic: 'dsh-client-ui-plan×1', injectStatic: 'dsh-client-ui-plan×1' },
    { key: 'conversation.input.right', kind: 'list', scope: 'session', risk: 'none', purpose: 'Compact controls before the composer submit action; fixed overlays must portal to the document body because the docked composer contains them.', registrantStatic: '', injectStatic: '' },
    { key: 'conversation.plan-review.actions', kind: 'list', scope: 'session', risk: 'none', purpose: 'Actions for the exact plan under review; approval remains with the question composer.', registrantStatic: 'dsh-client-ui-plan×1', injectStatic: 'dsh-client-ui-plan×1' },
    { key: 'conversation.session', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Strict per-Session Conversation body.', registrantStatic: 'dsh-client-ui-conversation×1', injectStatic: '' },
    { key: 'conversation.session.header', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Strict per-Session title, actions, and View navigation.', registrantStatic: 'dsh-client-ui-conversation×1', injectStatic: '' },
    { key: 'conversation.session.header.actions', kind: 'list', scope: 'session', risk: 'none', purpose: 'Title-adjacent Session actions in ascending order; overflow is clipped and faded before the utilities, so overlays must portal.', registrantStatic: 'dsh-client-ui-agent-preset×1; dsh-client-ui-jobs×1; dsh-client-ui-subagent×1; dsh-experimental-client-ui-agent-team×1', injectStatic: 'dsh-client-ui-jobs×1; dsh-client-ui-subagent×1; dsh-experimental-client-ui-agent-team×1' },
    { key: 'conversation.session.header.corner', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'The header\'s far-right corner, past the utilities\' edge and into the header\'s own padding, for one control.', registrantStatic: 'dsh-client-ui-sidebar-right×1', injectStatic: 'dsh-client-ui-sidebar-right×1' },
    { key: 'conversation.session.header.lineage', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Optional replacement for one Session breadcrumb title; overlays must portal because the title area clips overflow.', registrantStatic: 'dsh-client-ui-subagent×1', injectStatic: 'dsh-client-ui-subagent×1' },
    { key: 'conversation.session.header.utilities', kind: 'list', scope: 'session', risk: 'none', purpose: 'Right-aligned Session utilities in ascending order.', registrantStatic: 'dsh-client-ui-open-in-app×1; dsh-client-ui-schedule×1; dsh-experimental-client-ui-forge×1; dsh-experimental-liveshare×1; dsh-session-log-export×1', injectStatic: 'dsh-client-ui-open-in-app×1; dsh-client-ui-schedule×1; dsh-experimental-client-ui-forge×1; dsh-experimental-liveshare×1; dsh-session-log-export×1' },
    { key: 'conversation.session.header.views.actions', kind: 'list', scope: 'root', risk: 'none', purpose: 'Rows of the View tab row\'s More menu; the header shows More only while this list has registrations.', registrantStatic: 'dsh-client-ui-entry-customization×1', injectStatic: 'dsh-client-ui-entry-customization×1' },
    { key: 'conversation.trajectory.images', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Renderer for one group of durable record images in the Trajectory ledger.', registrantStatic: 'dsh-client-ui-attachment×1', injectStatic: 'dsh-client-ui-attachment×1' },
    { key: 'conversation.user.text.node', kind: 'keyed', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'One business-owned inline renderer for a pure JSON text node.', registrantStatic: 'dsh-client-ui-conversation×2; dsh-client-ui-reference×2; dsh-client-ui-goal×1; dsh-client-ui-secret-mask×1; dsh-client-ui-skill×1; dsh-message-quotes×1', injectStatic: 'dsh-client-ui-goal×1; dsh-client-ui-reference×1; dsh-client-ui-secret-mask×1; dsh-client-ui-skill×1; dsh-message-quotes×1' },
    { key: 'conversation.view', kind: 'list', scope: 'session', risk: 'none', purpose: 'Registered Conversation target Views, rendered one at a time.', registrantStatic: 'dsh-client-ui-chat×1; dsh-client-ui-trajectory×1; dsh-experimental-client-ui-stats×1', injectStatic: 'dsh-client-ui-chat×1; dsh-client-ui-trajectory×1; dsh-experimental-client-ui-stats×1' },
    { key: 'deliverables.file.actions', kind: 'list', scope: 'session', risk: 'none', purpose: 'Open one file through its authorized Session event coordinates.', registrantStatic: 'dsh-client-ui-open-in-app×1', injectStatic: 'dsh-client-ui-open-in-app×1' },
    { key: 'deliverables.review.file.actions', kind: 'list', scope: 'session', risk: 'none', purpose: 'The same file actions owned by a changed-file review tab.', registrantStatic: 'dsh-client-ui-open-in-app×1', injectStatic: 'dsh-client-ui-open-in-app×1' },
    { key: 'main', kind: 'keyed', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Central panel selected by sidebar entry id.', registrantStatic: 'dsh-client-ui-conversation×1; dsh-client-ui-plugin-manager×1; dsh-client-ui-schedule×1', injectStatic: 'dsh-client-ui-plugin-manager×1; dsh-client-ui-schedule×1' },
    { key: 'main.conversation', kind: 'single', scope: 'session-maybe', risk: 'shadows-shipped-ui', purpose: 'Conversation shell beneath its root-scoped main-panel entry.', registrantStatic: 'dsh-client-ui-conversation×1', injectStatic: '' },
    { key: 'plugins.add.actions', kind: 'list', scope: 'root', risk: 'none', purpose: 'Additional MenuItemButton rows after installation: 72px high, with a title and a description capped at two lines.', registrantStatic: 'dsh-client-ui-agent-preset×1', injectStatic: 'dsh-client-ui-agent-preset×1' },
    { key: 'plugins.bundle.activation', kind: 'keyed', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Optional guidance after the user enables a bundle from the list, keyed by npm package name.', registrantStatic: 'dsh-experimental-client-ui-voice-input×1', injectStatic: 'dsh-experimental-client-ui-voice-input×1' },
    { key: 'plugins.bundle.config', kind: 'keyed', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'A bundle\'s own configuration, keyed by the bundle\'s package name and rendered on the bundle\'s page between its description and its rows (`view: \'page\'` onl', registrantStatic: 'dsh-bridge-next×1; dsh-experimental-client-ui-cot-translation×1; dsh-experimental-client-ui-voice-input×1', injectStatic: 'dsh-experimental-client-ui-cot-translation×1; dsh-experimental-client-ui-voice-input×1' },
    { key: 'plugins.detail.actions', kind: 'list', scope: 'root', risk: 'none', purpose: 'Controls at the head of a detail page, before the page\'s own switch and uninstall, rendered with the page\'s subject.', registrantStatic: 'dsh-bridge-next×1', injectStatic: '' },
    { key: 'plugins.detail.badge', kind: 'list', scope: 'root', risk: 'none', purpose: 'Tags beside a detail page\'s title, after the version, beta, and problem tags the page draws itself, rendered with the page\'s subject.', registrantStatic: '', injectStatic: '' },
    { key: 'plugins.detail.section', kind: 'list', scope: 'root', risk: 'none', purpose: 'Sections under a detail page\'s own content: after the source on a bundle\'s page, after the configuration on a row\'s or an official plugin\'s page.', registrantStatic: '', injectStatic: '' },
    { key: 'plugins.item', kind: 'list', scope: 'root', risk: 'none', purpose: 'One official plugin the Plugins page lists in its Official group after the official bundles: `label` is the card\'s title and `order` its place.', registrantStatic: 'dsh-client-ui-settings-agent-loop×1; dsh-client-ui-settings-shell×1; dsh-client-ui-settings-subagent×1; dsh-client-ui-settings-web-search×1', injectStatic: 'dsh-client-ui-settings-agent-loop×1; dsh-client-ui-settings-shell×1; dsh-client-ui-settings-subagent×1; dsh-client-ui-settings-web-search×1' },
    { key: 'plugins.row.config', kind: 'keyed', scope: 'root', risk: 'none', purpose: 'The configuration of one row a bundle declares, keyed by `<package name>#<row id>` with the row id as the bundle\'s patch declares it: the row on the bundle\'s ', registrantStatic: '', injectStatic: '' },
    { key: 'plugins.tab', kind: 'list', scope: 'root', risk: 'none', purpose: 'Tabs after the page\'s own Installed tab, such as Discover: `label` names the tab and `order` places it.', registrantStatic: 'dsh-client-ui-plugin-market×1', injectStatic: 'dsh-client-ui-plugin-market×1' },
    { key: 'rightbar', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'The right column: a track the centre makes room for, or nothing.', registrantStatic: 'dsh-client-ui-sidebar-right×1', injectStatic: 'dsh-client-ui-sidebar-right×1' },
    { key: 'rightbar.session', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Session content selected by the root-scoped right Sidebar controller.', registrantStatic: 'dsh-client-ui-sidebar-right×1', injectStatic: '' },
    { key: 'root', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'The built-in render-tree root hole (seeded by SlotCore): the one slot the shell itself renders, and the ancestor of every other seat.', registrantStatic: 'dsh-client-ui-layout×1', injectStatic: '' },
    { key: 'settings.action', kind: 'list', scope: 'root', risk: 'none', purpose: 'Optional actions rendered in the content-column header before Close.', registrantStatic: 'dsh-client-ui-settings-general×1', injectStatic: 'dsh-client-ui-settings-general×1' },
    { key: 'settings.close', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'The close button\'s visually-hidden label text (the button itself — icon, geometry, focus — is shell chrome).', registrantStatic: 'dsh-client-ui-settings-general×1', injectStatic: 'dsh-client-ui-settings-general×1' },
    { key: 'settings.general.item', kind: 'list', scope: 'root', risk: 'none', purpose: 'One preference row inside the General section — the additive seat for a single setting that needs no page of its own (a whole page is `settings.section`), contr', registrantStatic: 'dsh-client-ui-chat×3; dsh-client-ui-settings-general×2; dsh-client-ui-theme×2; dsh-client-locale×1; dsh-client-ui-conversation×1; dsh-client-ui-permission-presets×1; dsh-client-ui-settings-session-log×1; dsh-client-ui-shortcuts×1', injectStatic: 'dsh-client-ui-chat×3; dsh-client-ui-settings-general×2; dsh-client-ui-theme×2; dsh-client-locale×1; dsh-client-ui-conversation×1; dsh-client-ui-permission-presets×1; dsh-client-ui-settings-session-log×1; dsh-client-ui-shortcuts×1' },
    { key: 'settings.header', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'The panel title text seat.', registrantStatic: 'dsh-client-ui-settings-general×1', injectStatic: 'dsh-client-ui-settings-general×1' },
    { key: 'settings.launcher', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Optional sidebar account launcher; opens the shell-owned settings panel.', registrantStatic: 'dsh-client-ui-settings-account×1', injectStatic: 'dsh-client-ui-settings-account×1' },
    { key: 'settings.models.footer', kind: 'list', scope: 'root', risk: 'none', purpose: 'Ordered extension area after the provider rows and the add controls.', registrantStatic: '', injectStatic: '' },
    { key: 'settings.models.provider-card', kind: 'keyed', scope: 'root', risk: 'none', purpose: 'One provider card\'s adapter extension area, dispatched with `entryKey = settingsNs` on every card that renders a directory row: a saved row\'s card (its first-', registrantStatic: '', injectStatic: '' },
    { key: 'settings.models.sign-in', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Optional account login choice before the credential editor.', registrantStatic: 'dsh-client-ui-settings-account×1', injectStatic: 'dsh-client-ui-settings-account×1' },
    { key: 'settings.onboarding', kind: 'list', scope: 'root', risk: 'none', purpose: 'Root-scoped onboarding steps contributed by settings features.', registrantStatic: 'dsh-client-ui-settings-models×2', injectStatic: 'dsh-client-ui-settings-models×2' },
    { key: 'settings.plugins.tab', kind: 'list', scope: 'root', risk: 'none', purpose: 'One page inside the Plugins settings section.', registrantStatic: 'dsh-client-ui-settings-plugin-inventory×1; dsh-community-market×1', injectStatic: 'dsh-client-ui-settings-plugin-inventory×1; dsh-community-market×1' },
    { key: 'settings.section', kind: 'list', scope: 'root', risk: 'none', purpose: 'One settings page per list entry.', registrantStatic: 'dsh-client-ui-agent-preset×1; dsh-client-ui-settings-account×1; dsh-client-ui-settings-general×1; dsh-client-ui-settings-models×1; dsh-client-ui-settings-plugins×1', injectStatic: 'dsh-client-ui-agent-preset×1; dsh-client-ui-settings-account×1; dsh-client-ui-settings-general×1; dsh-client-ui-settings-models×1; dsh-client-ui-settings-plugins×1' },
    { key: 'settings.section.icon', kind: 'list', scope: 'root', risk: 'none', purpose: 'Optional navigation icons addressed by the matching settings.section id.', registrantStatic: '', injectStatic: '' },
    { key: 'settings.trigger', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'The sidebar-foot trigger row content: icon + label, supplied as slot content (the accessible name comes from the content — rail state renders the label visually', registrantStatic: 'dsh-client-ui-settings-general×1', injectStatic: 'dsh-client-ui-settings-general×1' },
    { key: 'shell.bottom', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Full-width bottom content below all three columns.', registrantStatic: 'dsh-experimental-inspector×1', injectStatic: 'dsh-experimental-inspector×1' },
    { key: 'shell.leading', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Window-chrome seat at the frame\'s top-left, over every main panel.', registrantStatic: 'dsh-client-ui-sidebar×1', injectStatic: 'dsh-client-ui-sidebar×1' },
    { key: 'shell.overlay', kind: 'list', scope: 'root', risk: 'none', purpose: 'Frame-wide floating layer, above every column and outside their scroll containers.', registrantStatic: 'dsh-client-ui-workspace×3; dsh-client-ui-settings-account×2; dsh-client-ui-chat×1; dsh-client-ui-context-menu×1; dsh-client-ui-file-drag×1; dsh-client-ui-open-in-app×1; dsh-client-ui-plugin-manager×1; dsh-client-ui-schedule×1; dsh-client-ui-settings-general×1; dsh-client-ui-settings-session-log×1; dsh-client-ui-shortcuts×1; dsh-community-market×1; dsh-experimental-client-ui-forge×1; dsh-session-log-export×1', injectStatic: 'dsh-client-ui-settings-account×2; dsh-client-ui-chat×1; dsh-client-ui-context-menu×1; dsh-client-ui-file-drag×1; dsh-client-ui-open-in-app×1; dsh-client-ui-plugin-manager×1; dsh-client-ui-schedule×1; dsh-client-ui-settings-general×1; dsh-client-ui-settings-session-log×1; dsh-client-ui-shortcuts×1; dsh-client-ui-workspace×1; dsh-community-market×1; dsh-experimental-client-ui-forge×1; dsh-session-log-export×1' },
    { key: 'shell.quota-notice', kind: 'chain', scope: 'root', risk: 'none', purpose: 'Frame-wide quota notice chain.', registrantStatic: 'dsh-client-ui-settings-account×1', injectStatic: 'dsh-client-ui-settings-account×1' },
    { key: 'sidebar', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'The whole left column.', registrantStatic: 'dsh-client-ui-sidebar×1', injectStatic: 'dsh-client-ui-sidebar×1' },
    { key: 'sidebar.brand.mark', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Brand mark rendered in the expanded brand row and collapsed rail.', registrantStatic: 'dsh-client-ui-brand-official×1; dsh-experimental-liveshare×1', injectStatic: 'dsh-client-ui-brand-official×1; dsh-experimental-liveshare×1' },
    { key: 'sidebar.brand.name', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Brand name rendered beside the expanded mark.', registrantStatic: 'dsh-client-ui-brand-official×1; dsh-experimental-liveshare×1', injectStatic: 'dsh-client-ui-brand-official×1; dsh-experimental-liveshare×1' },
    { key: 'sidebar.chat.conversation', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Session-scoped Conversation occurrence hosted by one Sidebar chat tab.', registrantStatic: 'dsh-client-ui-subagent×1', injectStatic: 'dsh-client-ui-subagent×1' },
    { key: 'sidebar.footer.action', kind: 'list', scope: 'root', risk: 'none', purpose: 'Optional actions beside Settings at the sidebar foot.', registrantStatic: 'dsh-bridge-next×1; dsh-client-ui-cordis×1; dsh-community-market×1', injectStatic: 'dsh-bridge-next×1; dsh-client-ui-cordis×1; dsh-community-market×1' },
    { key: 'sidebar.panellist', kind: 'list', scope: 'root', risk: 'none', purpose: 'Global panel icons.', registrantStatic: 'dsh-client-ui-plugin-manager×1; dsh-client-ui-schedule×1', injectStatic: 'dsh-client-ui-plugin-manager×1; dsh-client-ui-schedule×1' },
    { key: 'sidebar.panellist.actions', kind: 'list', scope: 'root', risk: 'none', purpose: 'Rows of the panel list\'s More menu; the sidebar shows More only while this list has registrations.', registrantStatic: 'dsh-client-ui-entry-customization×1', injectStatic: 'dsh-client-ui-entry-customization×1' },
    { key: 'sidebar.right.pane.tab', kind: 'keyed', scope: 'session', risk: 'none', purpose: 'One tab\'s body, dispatched with the `id` of the type in force for `tab.kind`.', registrantStatic: 'dsh-experimental-client-ui-forge×2; dsh-client-ui-deliverables×1; dsh-client-ui-plan×1; dsh-client-ui-schedule×1; dsh-client-ui-sidebar-browser×1; dsh-client-ui-sidebar-documentpreview×1; dsh-client-ui-sidebar-files×1; dsh-client-ui-sidebar-right×1; dsh-client-ui-sidebar-terminal×1; dsh-client-ui-subagent×1; dsh-experimental-liveshare×1; dsh-experimental-session-inspector×1', injectStatic: 'dsh-experimental-client-ui-forge×2; dsh-client-ui-deliverables×1; dsh-client-ui-plan×1; dsh-client-ui-schedule×1; dsh-client-ui-sidebar-browser×1; dsh-client-ui-sidebar-documentpreview×1; dsh-client-ui-sidebar-files×1; dsh-client-ui-sidebar-right×1; dsh-client-ui-sidebar-terminal×1; dsh-client-ui-subagent×1; dsh-experimental-liveshare×1; dsh-experimental-session-inspector×1' },
    { key: 'sidebar.right.pane.tab.title', kind: 'keyed', scope: 'session', risk: 'none', purpose: 'A tab\'s title as its chip (and a floating panel\'s header) shows it, dispatched with the same key and information hook as the body.', registrantStatic: 'dsh-experimental-client-ui-forge×2; dsh-client-ui-plan×1; dsh-client-ui-schedule×1; dsh-client-ui-sidebar-browser×1; dsh-client-ui-sidebar-documentpreview×1; dsh-client-ui-sidebar-files×1; dsh-client-ui-sidebar-right×1; dsh-client-ui-sidebar-terminal×1', injectStatic: 'dsh-experimental-client-ui-forge×2; dsh-client-ui-plan×1; dsh-client-ui-schedule×1; dsh-client-ui-sidebar-browser×1; dsh-client-ui-sidebar-documentpreview×1; dsh-client-ui-sidebar-files×1; dsh-client-ui-sidebar-right×1; dsh-client-ui-sidebar-terminal×1' },
    { key: 'sidebar.right.tab.document', kind: 'keyed', scope: 'session', risk: 'none', purpose: 'Document body selected by a registered implementation id.', registrantStatic: 'dsh-client-ui-sidebar-documentpreview×8', injectStatic: 'dsh-client-ui-sidebar-documentpreview×8' },
    { key: 'sidebar.right.tab.document.action', kind: 'keyed', scope: 'session', risk: 'none', purpose: 'Renderer-specific controls before the document toolbar\'s reload button.', registrantStatic: 'dsh-client-ui-sidebar-documentpreview×1', injectStatic: 'dsh-client-ui-sidebar-documentpreview×1' },
    { key: 'sidebar.right.tab.document.actions', kind: 'list', scope: 'session', risk: 'none', purpose: 'Header toolbar contributions acting on the previewed file, rendered after the preview\'s own controls once the file\'s Host path is known.', registrantStatic: 'dsh-client-ui-open-in-app×1', injectStatic: 'dsh-client-ui-open-in-app×1' },
    { key: 'sidebar.right.tab.document.office.pdf', kind: 'keyed', scope: 'session', risk: 'none', purpose: 'PDF presentation supplied with Office-owned converted bytes.', registrantStatic: 'dsh-client-ui-sidebar-documentpreview×1', injectStatic: 'dsh-client-ui-sidebar-documentpreview×1' },
    { key: 'sidebar.right.tab.document.unpreviewable', kind: 'list', scope: 'session', risk: 'none', purpose: 'Empty-state contributions for a file this preview cannot render, offered where Retry would stand once the file\'s Host path is known.', registrantStatic: 'dsh-client-ui-open-in-app×1', injectStatic: 'dsh-client-ui-open-in-app×1' },
    { key: 'sidebar.right.tab.files.actions', kind: 'list', scope: 'session', risk: 'none', purpose: 'Workspace directory actions after the `files` page\'s reload control.', registrantStatic: 'dsh-client-ui-open-in-app×1', injectStatic: 'dsh-client-ui-open-in-app×1' },
    { key: 'sidebar.right.tab.guide', kind: 'chain', scope: 'session', risk: 'none', purpose: 'The guide tab\'s body.', registrantStatic: '', injectStatic: '' },
    { key: 'sidebar.right.tab.guide.actions', kind: 'list', scope: 'root', risk: 'none', purpose: 'Rows of the guide\'s More menu; the guide shows More only while this list has registrations.', registrantStatic: 'dsh-client-ui-entry-customization×1', injectStatic: 'dsh-client-ui-entry-customization×1' },
    { key: 'sidebar.right.tab.guide.entry', kind: 'keyed', scope: 'session', risk: 'none', purpose: 'One provider\'s guide card, with the standard card as the owner\'s fallback.', registrantStatic: 'dsh-client-ui-sidebar-terminal×1', injectStatic: 'dsh-client-ui-sidebar-terminal×1' },
    { key: 'sidebar.right.tab.menu.item', kind: 'list', scope: 'session', risk: 'none', purpose: 'Extra items at the end of one tab\'s actions menu, in registration order.', registrantStatic: '', injectStatic: '' },
    { key: 'sidebar.session.row.hover', kind: 'list', scope: 'root', risk: 'none', purpose: 'Section of the Session row\'s hover card between its relative time and its trailing status line.', registrantStatic: 'dsh-client-ui-schedule×1; dsh-experimental-client-ui-forge×1', injectStatic: 'dsh-client-ui-schedule×1; dsh-experimental-client-ui-forge×1' },
    { key: 'sidebar.session.row.leading', kind: 'list', scope: 'root', risk: 'none', purpose: 'Leading decoration of one Session row, in the 16px cell before the title that the row\'s own state dot otherwise occupies.', registrantStatic: 'dsh-client-ui-schedule×1; dsh-experimental-liveshare×1', injectStatic: 'dsh-client-ui-schedule×1; dsh-experimental-liveshare×1' },
    { key: 'sidebar.session.row.trailing', kind: 'list', scope: 'root', risk: 'none', purpose: 'Non-interactive icons after the row\'s time label, before its pin marker, in ascending `order`.', registrantStatic: 'dsh-experimental-client-ui-forge×1', injectStatic: 'dsh-experimental-client-ui-forge×1' },
    { key: 'sidebar.settings', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'The settings seat at the sidebar foot.', registrantStatic: 'dsh-client-ui-settings-general×1', injectStatic: 'dsh-client-ui-settings-general×1' },
    { key: 'sidebar.toggle.badge', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Non-interactive notification inside the collapsed sidebar expand button.', registrantStatic: 'dsh-client-ui-settings-general×1', injectStatic: 'dsh-client-ui-settings-general×1' },
    { key: 'sidebar.workspaces', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'The workspace/session browsing region: section header, search, the grouped/flat session list, and every workspace dialog.', registrantStatic: 'dsh-client-ui-workspace×1', injectStatic: 'dsh-client-ui-workspace×1' },
    { key: 'sidebar.workspaces.directoryFlow', kind: 'single', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Directory-flow hole under the sidebar browsing region (declared by the WorkspaceBrowser entry).', registrantStatic: 'dsh-client-ui-directory-picker-browse×1; dsh-client-ui-directory-picker-native×1', injectStatic: 'dsh-client-ui-directory-picker-browse×1; dsh-client-ui-directory-picker-native×1' },
    { key: 'sidebar.workspaces.session.menu.item', kind: 'list', scope: 'root', risk: 'none', purpose: 'Legacy external Session menu rows, in ascending `order`, rendered together before the built-in Archive action.', registrantStatic: '', injectStatic: '' },
    { key: 'sidebar.workspaces.session.row.action', kind: 'list', scope: 'root', risk: 'none', purpose: 'The hover buttons at the end of one Session row, in ascending `order`, after the "..." menu trigger.', registrantStatic: 'dsh-client-ui-workspace×2', injectStatic: 'dsh-client-ui-workspace×1' },
    { key: 'tool.call.images', kind: 'single', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Durable images of a settled image-bearing Tool call, rendered through the attachment presentation plugin.', registrantStatic: 'dsh-client-ui-attachment×1', injectStatic: 'dsh-client-ui-attachment×1' },
    { key: 'tool.call.toolview', kind: 'keyed', scope: 'session', risk: 'shadows-shipped-ui', purpose: 'Keyed Tool view dispatched by wire name, including custom tools.', registrantStatic: 'dsh-client-ui-tool×51; dsh-client-ui-cordis×4; dsh-client-ui-action-cards×1; dsh-client-ui-deliverables×1; dsh-client-ui-skill×1', injectStatic: 'dsh-client-ui-tool×9; dsh-client-ui-cordis×3; dsh-client-ui-action-cards×1; dsh-client-ui-deliverables×1; dsh-client-ui-skill×1' },
    { key: 'tool.view.cordis', kind: 'keyed', scope: 'session', risk: 'none', purpose: 'Interactive Package-owned region rendered inside the latest eligible `cordis_run` card in the conversation flow.', registrantStatic: '', injectStatic: '' },
    { key: 'workspace.toast', kind: 'keyed', scope: 'root', risk: 'shadows-shipped-ui', purpose: 'Workspace notices selected by their existing business discriminator.', registrantStatic: 'dsh-client-ui-workspace×11', injectStatic: 'dsh-client-ui-workspace×1' },
];

const KIND_ORDER = ['single', 'list', 'keyed', 'chain'];

let React = null;

const SURFACE_KEYS = ['tab', 'sidebar', 'topbar'];

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && Array.isArray(value) === false;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function catalogByKey() {
  const map = new Map();
  for (const slot of SLOT_CATALOG) map.set(slot.key, slot);
  return map;
}

const SLOTS_BY_KEY = catalogByKey();

/* ---------------------------------------------------------------- settings */

function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    hidden: {},
    locators: {},
    visualOrder: {},
    presets: {},
    activePreset: null,
    nav: { follow: true, state: 'expanded' },
  };
}

function sanitizeName(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, PRESET_NAME_MAX);
}

function sanitizeLocatorKey(raw) {
  if (typeof raw !== 'string') return '';
  const [slotKey, ...rest] = raw.split('::');
  if (SLOTS_BY_KEY.has(slotKey) === false) return '';
  const entryId = rest.join('::');
  if (entryId === '') return '';
  return slotKey + '::' + entryId;
}

function sanitizeSelector(raw) {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (value === '' || value.length > SELECTOR_MAX) return '';
  if (value.includes('{') || value.includes('}')) return '';
  return value;
}

function sanitizeHidden(raw) {
  const next = {};
  if (isPlainObject(raw) === false) return next;
  for (const [slotKey, entries] of Object.entries(raw)) {
    if (SLOTS_BY_KEY.has(slotKey) === false || isPlainObject(entries) === false) continue;
    const kept = {};
    for (const [entryId, value] of Object.entries(entries)) {
      if (value === true && entryId !== '') kept[entryId] = true;
    }
    if (Object.keys(kept).length > 0) next[slotKey] = kept;
  }
  return next;
}

function sanitizeLocators(raw) {
  const next = {};
  if (isPlainObject(raw) === false) return next;
  let count = 0;
  for (const [key, selector] of Object.entries(raw)) {
    if (count >= LOCATOR_LIMIT) break;
    const cleanKey = sanitizeLocatorKey(key);
    const cleanSelector = sanitizeSelector(selector);
    if (cleanKey === '' || cleanSelector === '') continue;
    next[cleanKey] = cleanSelector;
    count += 1;
  }
  return next;
}

/**
 * CSS `order` is not the host's registration `order`: ours only changes paint
 * order inside one flex/grid container, never the DOM and never anybody's entry.
 * The old field was called `order`, which read like the host's — renamed, with
 * an alias so existing saves keep working (no SETTINGS_VERSION bump).
 */
function sanitizeVisualOrder(raw) {
  const next = {};
  if (isPlainObject(raw) === false) return next;
  for (const [key, value] of Object.entries(raw)) {
    const cleanKey = sanitizeLocatorKey(key);
    if (cleanKey === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) === false) continue;
    next[cleanKey] = clamp(Math.round(numeric), -999, 999);
  }
  return next;
}

function sanitizePresets(raw) {
  const next = {};
  if (isPlainObject(raw) === false) return next;
  for (const [name, preset] of Object.entries(raw)) {
    const cleanName = sanitizeName(name);
    if (cleanName === '' || isPlainObject(preset) === false) continue;
    next[cleanName] = {
      hidden: sanitizeHidden(preset.hidden),
      visualOrder: sanitizeVisualOrder(preset.visualOrder ?? preset.order),
    };
  }
  return next;
}

/** `follow` defaults to on; the three-way choice only matters when it is off. */
function sanitizeNav(raw) {
  const next = { follow: true, state: 'expanded' };
  if (isPlainObject(raw) === false) return next;
  if (raw.follow === false) next.follow = false;
  if (PANEL_NAV_STATES.includes(raw.state)) next.state = raw.state;
  return next;
}

function sanitizeSettings(raw) {
  const base = defaultSettings();
  if (isPlainObject(raw) === false) return base;
  const next = base;
  next.hidden = sanitizeHidden(raw.hidden);
  next.locators = sanitizeLocators(raw.locators);
  next.visualOrder = sanitizeVisualOrder(raw.visualOrder ?? raw.order);
  next.presets = sanitizePresets(raw.presets);
  next.activePreset = typeof raw.activePreset === 'string' && hasOwn(next.presets, raw.activePreset) ? raw.activePreset : null;
  next.nav = sanitizeNav(raw.nav);
  return next;
}

/* ------------------------------------------------------------------ storage */

let settingsCache = null;

function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readStored(key) {
  const store = storage();
  if (store === null) return undefined;
  try {
    const raw = store.getItem(key);
    if (raw === null || raw === undefined || raw === '') return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeStored(key, value) {
  const store = storage();
  if (store === null) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* a full quota must not take the page down */
  }
}

function readPreserved() {
  const raw = readStored(PRESERVED_KEY);
  return isPlainObject(raw) ? raw : {};
}

function readBackups() {
  const raw = readStored(BACKUP_KEY);
  return Array.isArray(raw) ? raw.filter(isPlainObject).slice(0, BACKUP_LIMIT) : [];
}

function pushBackup(previous) {
  writeStored(BACKUP_KEY, [{ at: Date.now(), settings: previous }, ...readBackups()].slice(0, BACKUP_LIMIT));
}

function readSettings() {
  if (settingsCache !== null) return settingsCache;
  const stored = readStored(SETTINGS_KEY);
  const preserved = readPreserved();
  const merged = isPlainObject(stored) ? { ...stored, ...preserved } : { ...preserved };
  settingsCache = sanitizeSettings(merged);
  return settingsCache;
}

function writeSettings(next) {
  const previous = readStored(SETTINGS_KEY);
  if (isPlainObject(previous)) pushBackup(previous);
  settingsCache = sanitizeSettings(next);
  writeStored(SETTINGS_KEY, settingsCache);
  return settingsCache;
}

function patchSettings(patch) {
  const base = readSettings();
  const locators = { ...base.locators, ...(isPlainObject(patch.locators) ? patch.locators : {}) };
  const requested = {
    ...base.visualOrder,
    ...(isPlainObject(patch.visualOrder) ? patch.visualOrder : isPlainObject(patch.order) ? patch.order : {}),
  };
  /* A number without a binding can never be applied: dropping the locator drops
     its order in the same write, so no invisible leftovers survive. */
  const visualOrder = {};
  for (const [key, value] of Object.entries(requested)) {
    if (typeof locators[key] === 'string' && locators[key] !== '') visualOrder[key] = value;
  }
  return writeSettings({
    hidden: { ...base.hidden, ...(isPlainObject(patch.hidden) ? patch.hidden : {}) },
    locators,
    visualOrder,
    presets: isPlainObject(patch.presets) ? patch.presets : base.presets,
    activePreset: hasOwn(patch, 'activePreset') ? patch.activePreset : base.activePreset,
    nav: { ...(isPlainObject(base.nav) ? base.nav : {}), ...(isPlainObject(patch.nav) ? patch.nav : {}) },
  });
}

function resetSettings() {
  settingsCache = null;
  writeSettings(defaultSettings());
  return readSettings();
}

/* --------------------------------------------------------------- inventory */

function entryIdOf(entry, index) {
  const options = isPlainObject(entry) && isPlainObject(entry.options) ? entry.options : {};
  if (typeof options.id === 'string' && options.id !== '') return options.id;
  if (typeof options.key === 'string' && options.key !== '') return options.key;
  if (typeof options.label === 'string' && options.label !== '') return 'label:' + options.label;
  return 'priority:' + (Number(options.priority) || 0) + '#' + index;
}

function registrantOf(entry) {
  if (isPlainObject(entry) === false) return '';
  if (typeof entry.registrant === 'string') return entry.registrant;
  if (isPlainObject(entry.options) && typeof entry.options.registrant === 'string') return entry.options.registrant;
  return '';
}

function locatorKeyOf(slotKey, entryId) {
  return slotKey + '::' + entryId;
}

/**
 * Flatten the registry into rows a table can render.
 *
 * `entriesOf` is injected so this stays a pure function: the real caller passes
 * `(key) => slots.entriesOfSlot(key)`, the unit test passes a plain object.
 */
/**
 * Normalise one registry entry into the shape the table expects.
 *
 * Live occupants from `slots.snapshot()` are flat (`{ id?, key?, order?, priority, active, registrant? }`);
 * entries read through `entriesOfSlot()` carry the same fields under `options`.
 */
/**
 * Shipped UI, decided from the static entry id.
 *
 * The live registrant is useless here: every dynamically loaded plugin reports
 * the same runner name (`tk`), so a comparison against it flags our own
 * entries as shipped and misses the real ones. Shipped entries are the ones
 * whose id *is* a package name — `@deepseek-ai/dsh-client-ui-deliverables` —
 * and, in a `single` slot, the sole occupant of a slot whose static table
 * names a shipped package.
 */
function builtinOf(entryId, kind, registrantStatic) {
  if (/^(?:@deepseek-ai\/dsh|dsh-(?:client-ui|experimental|cli|tool|api))/.test(entryId)) return true;
  if (kind === 'single' && String(registrantStatic).includes('dsh-client-ui')) return true;
  return false;
}

/**
 * A slot whose every registrant is a shipped package — and which still cannot
 * say *which* row came from where.
 *
 * Keyed slots register per key with no entry→registrar mapping, so a row there
 * can be neither proven built-in nor cleared. The static column still tells us
 * something useful: if every registrar listed for the slot is ours, the rows are
 * almost certainly shipped chrome. That is a note, not a gate — the controls stay
 * on, because cleaning up host menu items is the whole point.
 */
function shippedSlotOf(kind, registrantStatic) {
  if (kind === 'single') return false;
  const parts = String(registrantStatic)
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length === 0) return false;
  return parts.every((part) => /^(?:@deepseek-ai\/|dsh-(?:client-ui|experimental|cli|tool|api))/.test(part));
}

function normalizeEntry(entry) {
  if (isPlainObject(entry) === false) return { options: { priority: 0 }, registrant: '' };
  const source = isPlainObject(entry.options) ? entry.options : entry;
  return {
    options: { ...source, priority: Number(source.priority) || 0 },
    registrant: registrantOf(entry),
  };
}

/** Flatten `snapshot()`'s declaration tree (slots + factory children) into one key→node map. */
function flattenSnapshot(nodes, into) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (isPlainObject(node) === false) continue;
    if (node.type === 'slot' && typeof node.name === 'string') {
      into.set(node.name, {
        key: node.name,
        kind: typeof node.kind === 'string' ? node.kind : 'single',
        scope: typeof node.scope === 'string' ? node.scope : 'root',
        occupants: Array.isArray(node.occupants) ? node.occupants : [],
      });
    }
    flattenSnapshot(node.children, into);
  }
  return into;
}

/**
 * The live slot directory, read from the registry itself.
 *
 * `snapshot()` is the authority: it lists exactly the slots declared in this
 * process, with their current occupants. The static `SLOT_CATALOG` stays as the
 * fallback (registry missing, or it throws) and as the only source of
 * `risk`/`purpose`, which are documentation, not runtime state.
 */
function runtimeCatalog(slots) {
  if (slots === null || slots === undefined) return null;
  if (typeof slots.snapshot !== 'function') return null;
  let nodes = null;
  try {
    nodes = slots.snapshot();
  } catch {
    return null;
  }
  const map = flattenSnapshot(nodes, new Map());
  return map.size === 0 ? null : map;
}

/**
 * Flatten the registry into rows a table can render.
 *
 * `entriesOf` and `live` are injected so this stays a pure function: the real
 * caller passes `(key) => slots.entriesOfSlot(key)` plus `runtimeCatalog(slots)`,
 * the unit test passes a plain object and nothing.
 */
function slotRows(entriesOf, settings, live) {
  const rows = [];
  const empty = [];
  const liveMap = live instanceof Map ? live : null;
  const keys = liveMap === null ? SLOT_CATALOG.map((slot) => slot.key) : [...liveMap.keys()];
  const visual = isPlainObject(settings.visualOrder) ? settings.visualOrder : {};
  for (const key of keys) {
    const meta = SLOTS_BY_KEY.get(key);
    const runtime = liveMap === null ? null : liveMap.get(key);
    const kind = typeof runtime?.kind === 'string' ? runtime.kind : meta?.kind ?? 'single';
    const scope = typeof runtime?.scope === 'string' ? runtime.scope : meta?.scope ?? 'root';
    const risk = meta?.risk ?? 'none';
    const purpose = meta?.purpose ?? '';
    const registrantStatic = meta?.registrantStatic ?? '';
    let entries = [];
    if (liveMap === null) {
      try {
        entries = typeof entriesOf === 'function' ? entriesOf(key) ?? [] : [];
      } catch {
        entries = [];
      }
    } else {
      entries = runtime?.occupants ?? [];
    }
    const list = Array.isArray(entries) ? entries.map(normalizeEntry) : [];
    if (list.length === 0) {
      empty.push({ key, kind, scope, risk, purpose, registrantStatic });
      continue;
    }
    list.forEach((entry, index) => {
      const entryId = entryIdOf(entry, index);
      const rowKey = locatorKeyOf(key, entryId);
      const options = entry.options;
      rows.push({
        key: rowKey,
        slotKey: key,
        kind,
        scope,
        risk,
        purpose,
        entryId,
        label: typeof options.label === 'string' ? options.label : '',
        registrant: registrantStatic,
        registrantLive: entry.registrant,
        priority: Number(options.priority) || 0,
        order: Number(options.order) || 0,
        visualOrder: hasOwn(visual, rowKey) ? visual[rowKey] : null,
        hidden: isPlainObject(settings.hidden[key]) && settings.hidden[key][entryId] === true,
        locator: typeof settings.locators[rowKey] === 'string' ? settings.locators[rowKey] : '',
        risky: risk === 'shadows-shipped-ui',
        builtin: builtinOf(entryId, kind, registrantStatic),
        shippedSlot: shippedSlotOf(kind, registrantStatic),
      });
    });
  }
  rows.sort((a, b) => {
    const bySlot = a.slotKey.localeCompare(b.slotKey);
    if (bySlot !== 0) return bySlot;
    const byPriority = a.priority - b.priority;
    if (byPriority !== 0) return byPriority;
    return a.entryId.localeCompare(b.entryId);
  });
  empty.sort((a, b) => a.key.localeCompare(b.key));
  return {
    rows,
    empty,
    totalSlots: keys.length,
    occupiedSlots: keys.length - empty.length,
    hiddenCount: rows.filter((row) => row.hidden).length,
    riskyCount: rows.filter((row) => row.risk === 'shadows-shipped-ui').length,
    builtinCount: rows.filter((row) => row.builtin).length,
    shippedSlotCount: rows.filter((row) => row.shippedSlot).length,
    locatorCount: rows.filter((row) => row.locator !== '').length,
    orderedCount: rows.filter((row) => row.visualOrder !== null).length,
    catalogSource: liveMap === null ? 'static' : 'runtime',
  };
}

/**
 * Which bound elements want a CSS `order`, and what number.
 *
 * Only bound entries have an element at all, and only entries inside the same
 * flex/grid parent can be compared — the caller groups by `parentElement` at
 * apply time and skips everything else. Nothing here touches an entry.
 */
function visualTargets(settings) {
  const targets = [];
  for (const [key, value] of Object.entries(settings.visualOrder)) {
    const selector = settings.locators[key];
    if (typeof selector !== 'string' || selector === '') continue;
    targets.push({ key, selector, value });
  }
  targets.sort((a, b) => a.value - b.value || a.key.localeCompare(b.key));
  return targets;
}

/**
 * The nearest ancestor that actually lays out flex/grid children.
 *
 * Slot entries are mounted inside a `[data-slot]` anchor whose own
 * `display: contents` takes it out of the box tree: its children are laid out
 * by the *grandparent*. Judging the anchor would refuse every entry the host
 * renders, so walk outward until an element that generates a box.
 */
function reorderHost(parent) {
  if (parent === null || parent === undefined) return null;
  const doc = typeof document === 'undefined' ? null : document;
  if (doc === null || typeof doc.defaultView?.getComputedStyle !== 'function') return null;
  let node = parent;
  for (let depth = 0; node !== null && node !== undefined && depth < 32; depth += 1) {
    let display = '';
    try {
      display = doc.defaultView.getComputedStyle(node).display;
    } catch {
      return null;
    }
    if (display === 'contents') {
      node = node.parentElement;
      continue;
    }
    return display === 'flex' || display === 'inline-flex' || display === 'grid' ? node : null;
  }
  return null;
}

/** Parents whose children CSS can actually re-order. */
function canReorder(parent) {
  return reorderHost(parent) !== null;
}

/**
 * Apply — or clear — `style.order` on every bound element.
 *
 * `touched` holds the nodes we wrote to, so the next pass and the teardown can
 * clear exactly those. A stale `order` left on a node we no longer own is the
 * one regression this feature invites.
 */
function applyVisualOrder(doc, settings, touched) {
  for (const element of touched) {
    if (element.style !== undefined) element.style.order = '';
  }
  touched.length = 0;
  if (doc === null || doc === undefined || typeof doc.querySelectorAll !== 'function') return touched;
  for (const target of visualTargets(settings)) {
    let found = [];
    try {
      found = Array.from(doc.querySelectorAll(target.selector));
    } catch {
      found = [];
    }
    for (const element of found) {
      if (canReorder(element.parentElement) === false) continue;
      if (element.style === undefined) continue;
      element.style.order = String(target.value);
      touched.push(element);
    }
  }
  return touched;
}

function kindCounts() {
  const counts = {};
  for (const kind of KIND_ORDER) counts[kind] = 0;
  for (const slot of SLOT_CATALOG) counts[slot.kind] = (counts[slot.kind] ?? 0) + 1;
  return counts;
}

/* --------------------------------------------------------------- visibility */

function toggleHidden(settings, slotKey, entryId) {
  const current = isPlainObject(settings.hidden[slotKey]) ? settings.hidden[slotKey] : {};
  const next = { ...current };
  if (next[entryId] === true) delete next[entryId];
  else next[entryId] = true;
  const hidden = { ...settings.hidden };
  if (Object.keys(next).length === 0) delete hidden[slotKey];
  else hidden[slotKey] = next;
  return hidden;
}

function setLocator(settings, key, selector) {
  const locators = { ...settings.locators };
  if (selector === '') delete locators[key];
  else locators[key] = selector;
  return locators;
}

/** Dropping a key from a plain map, used when a binding goes away. */
function dropKey(map, key) {
  const next = { ...map };
  delete next[key];
  return next;
}

function hiddenSelectors(settings) {
  const out = [];
  for (const [key, selector] of Object.entries(settings.locators)) {
    const [slotKey, ...rest] = key.split('::');
    const entryId = rest.join('::');
    const entryHidden = isPlainObject(settings.hidden[slotKey]) && settings.hidden[slotKey][entryId] === true;
    if (entryHidden) out.push({ key, selector });
  }
  return out;
}

/**
 * Why a row cannot be toggled. Honest beats complete: an official entry has no
 * toggle at all (hiding shipped chrome is what made us shadow the gear menu),
 * and a third-party entry without a bound element has nothing to hide.
 */
function locatorReason(settings, row) {
  if (row !== undefined && row.builtin === true) return 'built-in UI — touching it would shadow shipped chrome';
  if (settings.locators[row.key] !== undefined) return '';
  return 'host does not expose an entry→DOM mapping; pick the element once to bind it';
}

/**
 * Hiding is only offered where it can be undone and cannot blank shipped chrome:
 * a third-party entry, in a repeatable slot, with a bound element. A `single`
 * slot has one occupant by definition — hiding it is shadowing it.
 */
function canHide(row) {
  if (row.builtin === true) return false;
  if (row.kind === 'single') return false;
  return row.locator !== '';
}

/** Re-ordering is pure CSS inside one parent, so it works wherever an element is bound. */
function canReorderRow(row) {
  return row.builtin !== true && row.locator !== '';
}

/** One step of the visual order, relative to the current value (absent means 0). */
function stepVisualOrder(settings, key, delta) {
  const visual = isPlainObject(settings.visualOrder) ? settings.visualOrder : {};
  const current = hasOwn(visual, key) ? visual[key] : 0;
  const next = { ...visual };
  const value = clamp(Math.round(current) + delta, -999, 999);
  if (value === 0) delete next[key];
  else next[key] = value;
  return next;
}

/* ---------------------------------------------------------------- selectors */

function elementText(element) {
  if (element === null || element === undefined) return '';
  const text = typeof element.textContent === 'string' ? element.textContent : '';
  return text.trim();
}

function isStableAttribute(name) {
  if (typeof name !== 'string' || name.startsWith('data-uic') === true) return false;
  return name.startsWith('data-') === true || name === 'role' || name === 'aria-label' || name === 'name' || name === 'id';
}

function attributeSelector(element) {
  const attributes = element.attributes;
  if (attributes === undefined || attributes === null) return '';
  const names = typeof attributes.forEach === 'function' ? null : Object.keys(attributes);
  const candidates = names === null ? [] : names;
  if (names === null && typeof element.getAttributeNames === 'function') candidates.push(...element.getAttributeNames());
  for (const name of candidates) {
    if (isStableAttribute(name) === false) continue;
    const value = typeof element.getAttribute === 'function' ? element.getAttribute(name) : attributes[name];
    if (typeof value !== 'string' || value === '' || value.length > 60) continue;
    return '[' + name + '="' + value.replace(/"/g, '\\"') + '"]';
  }
  return '';
}

function pathSelector(element, root) {
  const parts = [];
  let node = element;
  let depth = 0;
  while (node !== null && node !== undefined && node !== root && depth < 6) {
    const tag = String(node.tagName ?? '').toLowerCase();
    if (tag === '' || tag === 'html' || tag === 'body') break;
    const parent = node.parentElement ?? null;
    const siblings = parent === null ? [] : Array.from(parent.children ?? []).filter((child) => String(child.tagName ?? '').toLowerCase() === tag);
    const index = siblings.indexOf(node);
    parts.unshift(tag + (siblings.length > 1 && index >= 0 ? ':nth-of-type(' + (index + 1) + ')' : ''));
    const own = attributeSelector(node);
    if (own !== '') {
      parts.unshift(own);
      break;
    }
    node = parent;
    depth += 1;
  }
  return parts.join(' > ');
}

function buildSelector(element, root) {
  if (element === null || element === undefined) return '';
  const direct = attributeSelector(element);
  if (direct !== '' && documentMatches(direct, element)) return direct;
  const path = pathSelector(element, root ?? null);
  if (path === '' ) return '';
  return documentMatches(path, element) ? path : '';
}

function documentMatches(selector, element) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (doc === null || typeof doc.querySelectorAll !== 'function') return false;
  try {
    const found = doc.querySelectorAll(selector);
    return Array.from(found).includes(element);
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------------- presets */

function capturePreset(settings) {
  return {
    hidden: sanitizeHidden(settings.hidden),
    visualOrder: sanitizeVisualOrder(settings.visualOrder),
  };
}

function savePreset(settings, name) {
  const cleanName = sanitizeName(name);
  if (cleanName === '') return { ok: false, reason: 'invalid' };
  const presets = { ...settings.presets, [cleanName]: capturePreset(settings) };
  return { ok: true, presets, activePreset: cleanName };
}

function dropPreset(settings, name) {
  const cleanName = sanitizeName(name);
  if (hasOwn(settings.presets, cleanName) === false) return { ok: false, reason: 'missing' };
  const presets = { ...settings.presets };
  delete presets[cleanName];
  return { ok: true, presets, activePreset: settings.activePreset === cleanName ? null : settings.activePreset };
}

function applyPreset(settings, name) {
  const cleanName = sanitizeName(name);
  if (hasOwn(settings.presets, cleanName) === false) return { ok: false, reason: 'missing' };
  const preset = settings.presets[cleanName];
  return {
    ok: true,
    hidden: sanitizeHidden(preset.hidden),
    visualOrder: sanitizeVisualOrder(preset.visualOrder),
    activePreset: cleanName,
  };
}

/* --------------------------------------------------------------- the plugin */

const ZH = {
  'settings.nav': '界面控制',
  'settings.title': '界面控制 / UI controller',
  'settings.lead': '这里列出宿主所有座位（slot）当前被谁占用。改动只影响显示，不卸载、不移动别人注册的 entry。',
  'settings.summary': '共 {slots} 个座位，{occupied} 个有占用；{rows} 条 entry，其中 {builtin} 条来自内置 UI（不给控件，改了会顶掉官方那一块），{shippedSlot} 条在出厂包独占的槽里（分不清具体是哪一条，控件照给），{risky} 条坐在有风险的座位上，{hidden} 条已被隐藏，{located} 条已绑定 DOM。',
  'settings.kinds': '座位类型：single {single} · list {list} · keyed {keyed} · chain {chain}',
  'settings.emptyHint': '这些座位当前没有任何 entry。想「把某个入口挪到某处」时，先看这里哪里是空的。',
  'settings.risk': '顶掉官方 UI 的风险',
  'settings.shippedSlot': '出厂槽',
  'settings.shippedSlotHint': '这个槽的注册方全是出厂包，但宿主不告诉我们具体哪一条是它注册的。',
  'settings.unbind': '解绑',
  'settings.unbindHint': '清除绑定，同时删掉这一条的视觉顺序。',
  'settings.builtin': '内置 UI',
  'settings.hide': '隐藏',
  'settings.show': '恢复',
  'settings.pick': '绑定元素',
  'settings.picking': '点页面上要隐藏的那块…',
  'settings.unbound': '无法定位：宿主不暴露 entry→DOM 映射',
  'settings.hiddenTag': '已隐藏',
  'settings.locatedTag': '已绑定',
  'settings.presets': '预设',
  'settings.presetName': '（预设名）',
  'settings.savePreset': '保存当前',
  'settings.applyPreset': '应用',
  'settings.dropPreset': '删除',
  'settings.reset': '全部恢复默认',
  'settings.resetOnce': '再点一次确认',
  'settings.noPresets': '还没有预设',
  'settings.orderHint': '视觉顺序只改 CSS order，键盘 Tab 顺序不变。',
  'settings.orderHint2': '别人插件的入口顺序由它自己注册时决定，宿主不提供运行时改写接口；这里只能改它们在同一父容器里的摆放次序。',
  'settings.visualUp': '上移一位',
  'settings.visualDown': '下移一位',
  'settings.builtinOccupied': '内置 UI · 隐藏会顶掉官方那一块',
  'settings.singleOccupied': '单占座位 · 不做操作（再注册会顶掉现有占用）',
  'settings.catalogRuntime': '目录来自运行时：{count} 个座位。',
  'settings.catalogStatic': '运行时目录不可用，回落到内置静态表：{count} 个座位。',
  'settings.col.registrant': '注册方（静态推断）',
  'settings.groupEntries': '{count} 条 entry',
  'settings.zone.risky': '危险区',
  'settings.zone.riskyHint': '顶掉这些槽位就等于官方那块 UI 没了',
  'settings.zone.safe': '安全区',
  'settings.zone.safeHint': '顶掉不伤官方 UI',
  'settings.zone.empty': '空座位',
  'settings.zoneMeta': '{slots} 槽 · {entries} entry',
  'settings.search': '搜键名 / 说明 / 占用者',
  'settings.filter.all': '全部',
  'settings.filter.risky': '只看危险',
  'settings.filter.safe': '只看安全',
  'settings.filter.bound': '已绑定',
  'settings.filter.unbound': '未绑定',
  'settings.filterCount': '{slots} 槽 · {entries} entry',
  'settings.noMatch': '没有匹配的座位。',
  'settings.nav.title': '设置页左栏',
  'settings.nav.hint': '只改设置页左侧分类栏的宽度：展开、56px 图标栏，或收起。键盘顺序与 DOM 顺序都不变。',
  'settings.nav.follow': '跟随宿主侧栏',
  'settings.nav.followOn': '跟随宿主侧栏时这三档不生效，先关掉跟随。',
  'settings.nav.state.expanded': '展开',
  'settings.nav.state.rail': '图标栏',
  'settings.nav.state.hidden': '收起',
  'settings.nav.now': '当前选择：{width}px。',
};

const EN = {
  'settings.nav': 'UI controller',
  'settings.title': 'UI controller',
  'settings.lead': 'Every host slot and who currently occupies it. Changes affect display only — nothing is unmounted and no entry is moved.',
  'settings.summary': '{rows} entries across {slots} slots ({occupied} occupied). {builtin} come from the built-in UI (no controls: changing them removes shipped chrome), {shippedSlot} sit in a slot only shipped packages register into (the slot cannot say which row, so the controls stay), {risky} sit in a risky slot. {hidden} hidden, {located} bound to the DOM.',
  'settings.kinds': 'Kinds: single {single} · list {list} · keyed {keyed} · chain {chain}',
  'settings.emptyHint': 'Nothing occupies these right now. If you want to put something somewhere, this is where there is room.',
  'settings.risk': 'shadows shipped UI',
  'settings.shippedSlot': 'shipped slot',
  'settings.shippedSlotHint': 'Every registrar of this slot is a shipped package, but the host does not say which row came from where.',
  'settings.unbind': 'Unbind',
  'settings.unbindHint': 'Clears the binding and the visual order stored for it.',
  'settings.builtin': 'built-in UI',
  'settings.hide': 'Hide',
  'settings.show': 'Restore',
  'settings.pick': 'Bind element',
  'settings.picking': 'Click the block you want to hide…',
  'settings.unbound': 'Cannot locate: the host exposes no entry→DOM mapping',
  'settings.hiddenTag': 'hidden',
  'settings.locatedTag': 'bound',
  'settings.presets': 'Presets',
  'settings.presetName': 'preset name',
  'settings.savePreset': 'Save current',
  'settings.applyPreset': 'Apply',
  'settings.dropPreset': 'Delete',
  'settings.reset': 'Restore defaults',
  'settings.resetOnce': 'Click again to confirm',
  'settings.noPresets': 'No presets yet',
  'settings.orderHint': 'Visual order only changes CSS order; the keyboard Tab order stays exactly as it is.',
  'settings.orderHint2': 'Another plugin decides where its own entry sits when it registers — the host offers no runtime hook for that. All we can change is paint order inside the same parent.',
  'settings.visualUp': 'Move up one',
  'settings.visualDown': 'Move down one',
  'settings.builtinOccupied': 'Built-in UI \u00b7 hiding it removes shipped chrome',
  'settings.singleOccupied': 'Single seat \u00b7 not offered (re-registering replaces the occupant)',
  'settings.catalogRuntime': 'Directory from the live registry: {count} slots.',
  'settings.catalogStatic': 'Live directory unavailable; using the bundled static table: {count} slots.',
  'settings.col.registrant': 'Registrant (static)',
  'settings.groupEntries': 'entries ({count})',
  'settings.zone.risky': 'Risky',
  'settings.zone.riskyHint': 'replacing these removes shipped UI',
  'settings.zone.safe': 'Safe',
  'settings.zone.safeHint': 'replacing these costs no shipped UI',
  'settings.zone.empty': 'Empty seats',
  'settings.zoneMeta': '{slots} slots · {entries} entries',
  'settings.search': 'Search key, purpose or occupant',
  'settings.filter.all': 'All',
  'settings.filter.risky': 'Risky only',
  'settings.filter.safe': 'Safe only',
  'settings.filter.bound': 'Bound',
  'settings.filter.unbound': 'Unbound',
  'settings.filterCount': '{slots} slots · {entries} entries',
  'settings.noMatch': 'No slot matches.',
  'settings.nav.title': 'Settings rail',
  'settings.nav.hint': 'Only the width of the settings rail changes: full, a 56px icon rail, or collapsed. Keyboard and DOM order never change.',
  'settings.nav.follow': 'Follow the host sidebar',
  'settings.nav.followOn': 'While following, these three do not apply — turn following off first.',
  'settings.nav.state.expanded': 'Full',
  'settings.nav.state.rail': 'Icon rail',
  'settings.nav.state.hidden': 'Collapsed',
  'settings.nav.now': 'Selected: {width}px.',
};

const DICTS = { zh: ZH, en: EN };

function localeScope() {
  const doc = typeof document === 'undefined' ? null : document;
  const lang = String(doc?.documentElement?.getAttribute?.('lang') ?? '');
  return lang.toLowerCase().startsWith('zh') || lang === '' ? 'zh' : 'en';
}

function translator(scope) {
  return (key, params) => {
    const dict = DICTS[scope] ?? EN;
    let text = hasOwn(dict, key) ? dict[key] : key;
    if (isPlainObject(params)) {
      for (const [name, value] of Object.entries(params)) text = text.split('{' + name + '}').join(String(value));
    }
    return text;
  };
}

function h(type, props, children) {
  const rest = Array.prototype.slice.call(arguments, 3);
  const merged = children === undefined ? [] : Array.isArray(children) ? children : [children];
  return React.createElement(type, props, ...merged, ...rest);
}

function node(tagName, props, children) {
  return h(tagName, props, children === undefined ? [] : children);
}

function injectStyle(doc) {
  if (doc === null || doc === undefined) return;
  const css = HIDE_CSS + '\n' + PAGE_CSS + '\n' + NAV_CSS;
  const existing = typeof doc.getElementById === 'function' ? doc.getElementById(STYLE_ID) : null;
  /* A reloaded plugin can find the stylesheet its previous instance left behind.
     Rewriting it keeps the three rule groups from drifting apart. */
  if (existing !== null && existing !== undefined) {
    if (existing.textContent !== css) existing.textContent = css;
    return;
  }
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.setAttribute('data-uic', 'style');
  style.textContent = css;
  const head = doc.head ?? doc.documentElement;
  if (head !== null && head !== undefined) head.appendChild(style);
}

function removeStyle(doc) {
  if (doc === null || doc === undefined) return;
  const existing = typeof doc.getElementById === 'function' ? doc.getElementById(STYLE_ID) : null;
  if (existing !== null && existing !== undefined && typeof existing.remove === 'function') existing.remove();
}

/* ------------------------------------------------------------- nav DOM */

/** Buttons we put a `title` on, so leaving rail state can undo exactly those. */
const navTitled = [];

/**
 * Put captured `title` attributes back, then forget them.
 *
 * `keep` is the set of buttons that should stay titled: the two-second paint
 * pass calls this with the buttons it just found, so a host re-render that
 * replaces the nav nodes drops the stale entries and nothing is written twice.
 */
function releaseNavTitles(keep) {
  for (let index = navTitled.length - 1; index >= 0; index -= 1) {
    const item = navTitled[index];
    if (keep !== undefined && keep.has(item.element) === true) continue;
    if (item.previous === null) item.element.removeAttribute('title');
    else item.element.setAttribute('title', item.previous);
    navTitled.splice(index, 1);
  }
}

/**
 * Paint one of the three states onto the settings modal.
 *
 * Only the panel attribute and a handful of `title` attributes are written:
 * the nav markup belongs to the host and is never moved, re-registered or
 * re-rendered by us. Rail state hides the labels with CSS, so nothing has to
 * be remembered across a host re-render beyond the attribute itself. Called
 * every two seconds, so every write is guarded — an unchanged attribute or
 * tooltip is left alone instead of being re-set in a loop.
 */
function applyNavStateTo(doc, settings) {
  const state = resolveNavState(settings, doc);
  if (doc === null || doc === undefined || typeof doc.querySelector !== 'function') return state;
  const panel = doc.querySelector(PANEL_SELECTOR);
  if (panel === null || panel === undefined) {
    releaseNavTitles();
    return state;
  }
  if (panel.getAttribute(NAV_ATTR) !== state) panel.setAttribute(NAV_ATTR, state);
  const nav = state === 'rail' && typeof panel.querySelector === 'function' ? panel.querySelector('nav') : null;
  if (nav === null || nav === undefined || typeof nav.querySelectorAll !== 'function') {
    releaseNavTitles();
    return state;
  }
  const wanted = new Set();
  for (const button of Array.from(nav.querySelectorAll('button'))) {
    const spans = typeof button.querySelectorAll === 'function' ? Array.from(button.querySelectorAll('span')) : [];
    const label = elementText(spans.length > 1 ? spans[1] : button);
    if (label === '') continue;
    wanted.add(button);
    if (button.getAttribute('title') === label) continue;
    if (navTitled.some((item) => item.element === button) === false) {
      navTitled.push({ element: button, previous: button.getAttribute('title') });
    }
    button.setAttribute('title', label);
  }
  releaseNavTitles(wanted);
  return state;
}

/** Take the attribute and every `title` back off, e.g. when the plugin unloads. */
function clearNavState(doc) {
  releaseNavTitles();
  if (doc === null || doc === undefined || typeof doc.querySelectorAll !== 'function') return;
  for (const panel of Array.from(doc.querySelectorAll(PANEL_SELECTOR))) panel.removeAttribute(NAV_ATTR);
}

/* ---------------------------------------------------------------- grouping */

const RISK_RISKY = 'shadows-shipped-ui';

/**
 * Slot rows -> two risk zones plus the empty slots.
 *
 * Pure: it only reads what `slotRows` already produced. Entries keep the order
 * `slotRows` sorted them into (priority, then id), so a re-render never
 * reshuffles a slot under the pointer.
 */
function slotGroups(rows, empty) {
  const bySlot = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const existing = bySlot.get(row.slotKey);
    if (existing === undefined) {
      bySlot.set(row.slotKey, {
        slotKey: row.slotKey,
        kind: row.kind,
        scope: row.scope,
        risk: row.risk,
        purpose: row.purpose,
        entries: [row],
      });
    } else {
      existing.entries.push(row);
    }
  }
  const groups = [...bySlot.values()].sort((a, b) => a.slotKey.localeCompare(b.slotKey));
  const zones = { risky: [], safe: [], empty: [] };
  for (const group of groups) {
    if (group.risk === RISK_RISKY) zones.risky.push(group);
    else zones.safe.push(group);
  }
  const blanks = (Array.isArray(empty) ? [...empty] : []).sort((a, b) => a.key.localeCompare(b.key));
  for (const slot of blanks) {
    zones.empty.push({
      slotKey: slot.key,
      kind: slot.kind,
      scope: slot.scope,
      risk: slot.risk,
      purpose: slot.purpose,
      entries: [],
    });
  }
  return zones;
}

/**
 * Apply the three filters and count what survived.
 *
 * A slot survives when its own key or purpose matches, or when any of its
 * entries does — the user searches for "the thing I can see", which may be a
 * slot name or an entry id. Counts are entry counts, because that is what the
 * user is hunting for; `slots` counts the slot rows that still have a hit.
 */
function filterGroups(zones, filters) {
  const query = typeof filters?.query === 'string' ? filters.query.trim().toLowerCase() : '';
  const risk = filters?.risk ?? 'all';
  const bound = filters?.bound ?? 'all';
  const has = (text) => query === '' || String(text ?? '').toLowerCase().includes(query);
  const riskOk = (slot) => risk === 'all' || (risk === 'risky' ? slot.risk === RISK_RISKY : slot.risk !== RISK_RISKY);
  const boundOk = (row) => bound === 'all' || (bound === 'bound' ? row.locator !== '' : row.locator === '');
  const out = { risky: [], safe: [], empty: [] };
  for (const zone of ['risky', 'safe']) {
    for (const slot of zones?.[zone] ?? []) {
      if (riskOk(slot) === false) continue;
      const slotHit = has(slot.slotKey) || has(slot.purpose);
      const entries = slot.entries.filter(
        (row) => boundOk(row) && (slotHit || has(row.entryId) || has(row.registrant) || has(row.registrantLive)),
      );
      if (entries.length === 0) continue;
      out[zone].push({ ...slot, entries });
    }
  }
  for (const slot of zones?.empty ?? []) {
    if (riskOk(slot) === false) continue;
    if (bound === 'bound') continue;
    if (has(slot.slotKey) === false && has(slot.purpose) === false) continue;
    out.empty.push(slot);
  }
  const counts = { entries: 0, slots: 0, empty: out.empty.length };
  for (const zone of ['risky', 'safe']) {
    for (const slot of out[zone]) {
      counts.slots += 1;
      counts.entries += slot.entries.length;
    }
  }
  return { zones: out, counts };
}

/**
 * Which zones and slots are unfolded.
 *
 * Deliberately module-level rather than component state: the host re-renders
 * this panel when the registry ticks, and the two-second inventory timer
 * re-renders it on its own. Collapse state kept in React state survives a
 * re-render but not a remount; keeping it here survives both, which is what
 * "it must not spring open again" actually requires.
 */
const openNodes = new Set();

function isOpen(id) {
  return openNodes.has(id);
}

function toggleOpen(id) {
  if (openNodes.has(id)) openNodes.delete(id);
  else openNodes.add(id);
  return openNodes.has(id);
}

function resetOpen() {
  openNodes.clear();
}

/* ------------------------------------------------------------- the page UI */

function settingsPage(props) {
  const t = props.t;
  const [snapshot, setSnapshot] = React.useState(null);
  const [state, setState] = React.useState(() => readSettings());
  const [armed, setArmed] = React.useState(false);
  const [pickKey, setPickKey] = React.useState(null);
  const [presetName, setPresetName] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [riskFilter, setRiskFilter] = React.useState('all');
  const [boundFilter, setBoundFilter] = React.useState('all');
  const [, bump] = React.useState(0);

  React.useEffect(() => {
    const refresh = () => setState(readSettings());
    const stop = typeof props.subscribe === 'function' ? props.subscribe(refresh) : () => {};
    refresh();
    return stop;
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const read = typeof props.inventory === 'function' ? props.inventory : () => null;
    const update = () => {
      if (cancelled) return;
      try {
        setSnapshot(read());
      } catch {
        setSnapshot(null);
      }
    };
    update();
    const timer = setInterval(update, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const fallbackInventory = {
    rows: [],
    empty: [],
    totalSlots: SLOT_CATALOG.length,
    occupiedSlots: 0,
    hiddenCount: 0,
    riskyCount: 0,
    builtinCount: 0,
    shippedSlotCount: 0,
    locatorCount: 0,
    orderedCount: 0,
    catalogSource: 'static',
  };
  const readInventory = () => {
    if (typeof props.inventory !== 'function') return fallbackInventory;
    try {
      return props.inventory() ?? fallbackInventory;
    } catch {
      return fallbackInventory;
    }
  };
  const inventory = snapshot ?? readInventory();
  const counts = kindCounts();

  const commit = (next) => {
    writeSettings(next);
    setState(readSettings());
    if (typeof props.apply === 'function') props.apply();
  };

  const onToggle = (row) => {
    commit({ ...state, hidden: toggleHidden(state, row.slotKey, row.entryId) });
  };

  const onStepOrder = (row, delta) => {
    commit({ ...state, visualOrder: stepVisualOrder(state, row.key, delta) });
  };

  const onUnbind = (row) => {
    commit({ ...state, locators: setLocator(state, row.key, ''), visualOrder: dropKey(state.visualOrder, row.key) });
  };

  const onPick = (row) => {
    const next = pickKey === row.key ? null : row.key;
    setPickKey(next);
    if (next !== null && typeof props.pick === 'function') props.pick(next);
  };

  const onSavePreset = () => {
    const result = savePreset(state, presetName);
    if (result.ok !== true) return;
    setPresetName('');
    commit({ ...state, presets: result.presets, activePreset: result.activePreset });
  };

  const onApplyPreset = (name) => {
    const result = applyPreset(state, name);
    if (result.ok !== true) return;
    commit({ ...state, hidden: result.hidden, visualOrder: result.visualOrder, activePreset: result.activePreset });
  };

  const onDropPreset = (name) => {
    const result = dropPreset(state, name);
    if (result.ok !== true) return;
    commit({ ...state, presets: result.presets, activePreset: result.activePreset });
  };

  const onReset = () => {
    if (armed !== true) {
      setArmed(true);
      return;
    }
    setArmed(false);
    settingsCache = null;
    writeSettings(defaultSettings());
    setState(readSettings());
    if (typeof props.apply === 'function') props.apply();
  };

  /* Collapse toggles: flip the module-level set and force one render. */
  const flipZone = (zone) => {
    toggleOpen('zone:' + zone);
    bump((value) => value + 1);
  };
  const flipSlot = (slotKey) => {
    toggleOpen('slot:' + slotKey);
    bump((value) => value + 1);
  };

  const view = filterGroups(slotGroups(inventory.rows, inventory.empty), {
    query,
    risk: riskFilter,
    bound: boundFilter,
  });

  const tag = (id, text, className, title) => node('span', { key: id, className: className ?? 'uic-tag', title: title ?? text }, text);

  const entryRow = (row) => {
    const builtin = row.builtin === true;
    const bound = row.locator !== '';
    const toggleable = canHide(row);
    const reorderable = canReorderRow(row);
    const stateTags = [];
    if (row.hidden) stateTags.push(tag('hidden', t('settings.hiddenTag'), 'uic-tag uic-tag-on'));
    if (bound) stateTags.push(tag('bound', t('settings.locatedTag')));
    if (builtin) stateTags.push(tag('builtin', t('settings.builtin'), 'uic-tag uic-tag-risk'));
    else if (row.shippedSlot === true) stateTags.push(tag('shipped-slot', t('settings.shippedSlot'), 'uic-tag', t('settings.shippedSlotHint')));
    else if (row.risky === true) stateTags.push(tag('risky', t('settings.risk'), 'uic-tag uic-tag-risk'));

    const stepper = reorderable
      ? node('span', { key: 'order-ctl', className: 'uic-ctl' }, [
          node(
            'button',
            {
              key: 'up',
              className: 'uic-btn uic-btn-quiet',
              type: 'button',
              'data-uic-order-up': row.key,
              'aria-label': t('settings.visualUp'),
              title: t('settings.visualUp'),
              onClick: () => onStepOrder(row, 1),
            },
            '\u2191',
          ),
          node(
            'button',
            {
              key: 'down',
              className: 'uic-btn uic-btn-quiet',
              type: 'button',
              'data-uic-order-down': row.key,
              'aria-label': t('settings.visualDown'),
              title: t('settings.visualDown'),
              onClick: () => onStepOrder(row, -1),
            },
            '\u2193',
          ),
        ])
      : null;
    const hideButton = toggleable
      ? node(
          'button',
          {
            className: 'uic-btn',
            type: 'button',
            'data-uic-toggle': row.key,
            onClick: () => onToggle(row),
          },
          row.hidden ? t('settings.show') : t('settings.hide'),
        )
      : null;
    const unbindButton = bound
      ? node(
          'button',
          {
            key: 'unbind',
            className: 'uic-btn uic-btn-quiet',
            type: 'button',
            'data-uic-unbind': row.key,
            title: t('settings.unbindHint'),
            onClick: () => onUnbind(row),
          },
          t('settings.unbind'),
        )
      : null;
    const why = builtin
      ? t('settings.builtinOccupied')
      : row.kind === 'single'
        ? t('settings.singleOccupied')
        : t('settings.unbound');

    const controls =
      hideButton !== null || stepper !== null || unbindButton !== null
        ? node('span', { key: 'action', className: 'uic-entryActions' }, [hideButton, stepper, unbindButton])
        : node('span', { key: 'action', className: 'uic-entryActions' }, [
            node('span', { className: 'uic-why', title: locatorReason(state, row) }, [
              why,
              builtin || row.kind === 'single'
                ? null
                : node(
                    'button',
                    {
                      key: 'pick',
                      className: 'uic-btn uic-btn-quiet',
                      type: 'button',
                      'data-uic-pick': row.key,
                      onClick: () => onPick(row),
                    },
                    pickKey === row.key ? t('settings.picking') : t('settings.pick'),
                  ),
            ]),
          ]);

    return node('div', { key: row.key, className: 'uic-entry', [ROW_ATTR]: row.key, 'data-uic-slot': row.slotKey }, [
      node('span', { key: 'entry', className: 'uic-entryId uic-mono', title: row.entryId }, row.entryId),
      node('span', { key: 'live', className: 'uic-entryLive', title: t('settings.col.registrant') }, [
        node('span', { key: 'name' }, row.registrantLive === '' ? '\u2014' : row.registrantLive),
        row.registrant === '' ? null : node('span', { key: 'static', className: 'uic-dim' }, ' \u00b7 ' + row.registrant),
      ]),
      node('span', { key: 'priority', className: 'uic-num' }, String(row.priority)),
      node('span', { key: 'order', className: 'uic-num' }, String(row.order)),
      node('span', { key: 'visual', className: 'uic-num' }, row.visualOrder === null ? '\u2014' : String(row.visualOrder)),
      node('span', { key: 'state', className: 'uic-entryState' }, stateTags.length === 0 ? node('span', { className: 'uic-dim' }, '\u2014') : stateTags),
      controls,
    ]);
  };

  const slotRow = (slot) => {
    const open = isOpen('slot:' + slot.slotKey);
    const risky = slot.risk === RISK_RISKY;
    const hasEntries = slot.entries.length > 0;
    const head = node(
      hasEntries ? 'button' : 'div',
      {
        key: 'head',
        className: 'uic-slotHead' + (risky ? ' uic-slotRisk' : ''),
        type: hasEntries ? 'button' : undefined,
        'data-uic-group': slot.slotKey,
        'data-uic-group-open': open ? 'true' : 'false',
        'data-uic-group-toggle': hasEntries ? slot.slotKey : undefined,
        'data-uic-group-risk': risky ? 'risky' : 'safe',
        'aria-expanded': hasEntries ? (open ? 'true' : 'false') : undefined,
        onClick: hasEntries ? () => flipSlot(slot.slotKey) : undefined,
        title: slot.purpose,
      },
      [
        node('span', { key: 'mark', className: 'uic-mark', 'aria-hidden': 'true' }, risky ? '\u26a0' : '\u00b7'),
        node('span', { key: 'arrow', className: 'uic-arrow' }, hasEntries ? (open ? '\u25be' : '\u25b8') : ''),
        node('span', { key: 'key', className: 'uic-slotKey uic-mono' }, slot.slotKey),
        node('span', { key: 'kind', className: 'uic-kind' }, slot.kind),
        node('span', { key: 'scope', className: 'uic-dim' }, slot.scope),
        node('span', { key: 'count', className: 'uic-count', 'data-uic-group-count': String(slot.entries.length) }, t('settings.groupEntries', { count: slot.entries.length })),
      ],
    );
    if (hasEntries === false) return node('div', { key: slot.slotKey, className: 'uic-slot', 'data-uic-empty-slot': slot.slotKey }, head);
    return node('div', { key: slot.slotKey, className: 'uic-slot' + (open ? ' uic-slotOpen' : ''), 'data-uic-slot-open': open ? 'true' : 'false' }, [
      head,
      open ? node('div', { key: 'entries', className: 'uic-entries' }, slot.entries.map(entryRow)) : null,
    ]);
  };

  const zoneNames = { risky: t('settings.zone.risky'), safe: t('settings.zone.safe'), empty: t('settings.zone.empty') };
  const zoneHints = { risky: t('settings.zone.riskyHint'), safe: t('settings.zone.safeHint'), empty: t('settings.emptyHint') };

  const zoneBlock = (zone) => {
    const groups = view.zones[zone];
    if (groups.length === 0) return null;
    const open = isOpen('zone:' + zone);
    const entries = groups.reduce((sum, slot) => sum + slot.entries.length, 0);
    return node('section', { key: zone, className: 'uic-zone uic-zone-' + zone, 'data-uic-zone': zone, 'data-uic-zone-open': open ? 'true' : 'false' }, [
      node(
        'button',
        {
          key: 'head',
          className: 'uic-zoneHead',
          type: 'button',
          'data-uic-zone-toggle': zone,
          'aria-expanded': open ? 'true' : 'false',
          onClick: () => flipZone(zone),
        },
        [
          node('span', { key: 'mark', className: 'uic-mark', 'aria-hidden': 'true' }, zone === 'empty' ? '\u00b7' : '\u26a0'),
          node('span', { key: 'arrow', className: 'uic-arrow' }, open ? '\u25be' : '\u25b8'),
          node('span', { key: 'name', className: 'uic-zoneName' }, zoneNames[zone]),
          node('span', { key: 'hint', className: 'uic-zoneHint' }, zoneHints[zone]),
          node('span', { key: 'meta', className: 'uic-zoneMeta', 'data-uic-zone-count': String(groups.length) }, t('settings.zoneMeta', { slots: groups.length, entries })),
        ],
      ),
      open ? node('div', { key: 'body', className: 'uic-zoneBody' }, groups.map(slotRow)) : null,
    ]);
  };

  const filterButton = (kind, value, label) => {
    const chosen = (kind === 'risk' ? riskFilter : boundFilter) === value;
    return node(
      'button',
      {
        key: kind + ':' + value,
        className: 'uic-filter' + (chosen ? ' uic-filter-on' : ''),
        type: 'button',
        'data-uic-filter': kind + ':' + value,
        'data-on': chosen ? 'true' : 'false',
        onClick: () => {
          if (kind === 'risk') setRiskFilter(value);
          else setBoundFilter(value);
          bump((count) => count + 1);
        },
      },
      label,
    );
  };

  const presetNames = Object.keys(state.presets).sort();

  const navStored = isPlainObject(state.nav) ? state.nav : {};
  const followOn = navStored.follow !== false;
  const navChoice = PANEL_NAV_STATES.includes(navStored.state) ? navStored.state : 'expanded';
  /* While following, the three buttons are inert, so the selected mark and the
     width line show what the rail is actually doing right now. */
  const navNow = followOn ? resolveNavState({ nav: navStored }, typeof document === 'undefined' ? null : document) : navChoice;
  const navEdit = (change) => commit({ ...state, nav: { ...navStored, ...change } });

  const navBlock = node('div', { key: 'nav', className: 'uic-navSection', 'data-uic-nav-section': '1' }, [
    node('h3', { key: 'h', className: 'uic-h3' }, t('settings.nav.title')),
    node('p', { key: 'hint', className: 'uic-dim' }, t('settings.nav.hint')),
    node('label', { key: 'follow', className: 'uic-navFollow' }, [
      node('input', {
        key: 'box',
        type: 'checkbox',
        'data-uic-nav-follow': followOn ? 'true' : 'false',
        checked: followOn,
        onChange: (event) => navEdit({ follow: event.target.checked === true }),
      }),
      node('span', { key: 'text' }, t('settings.nav.follow')),
    ]),
    node(
      'div',
      { key: 'states', className: 'uic-navStates' },
      PANEL_NAV_STATES.map((option) =>
        node(
          'button',
          {
            key: option,
            className: 'uic-filter' + (navChoice === option ? ' uic-filter-on' : ''),
            type: 'button',
            'data-uic-nav-pick': option,
            'data-on': navNow === option ? 'true' : 'false',
            disabled: followOn,
            title: followOn ? t('settings.nav.followOn') : undefined,
            onClick: () => navEdit({ follow: false, state: option }),
          },
          t('settings.nav.state.' + option),
        ),
      ),
    ),
    node(
      'p',
      { key: 'now', className: 'uic-dim', 'data-uic-nav-now': navNow },
      t('settings.nav.now', { width: navWidthOf(navNow) }),
    ),
  ]);

  return node('div', { className: 'uic-page', 'data-uic-page': '1' }, [
    node('h2', { key: 'title', className: 'uic-title' }, t('settings.title')),
    node('p', { key: 'lead', className: 'uic-lead' }, t('settings.lead')),
    node(
      'p',
      { key: 'summary', className: 'uic-summary', 'data-uic-summary': '1' },
      t('settings.summary', {
        slots: inventory.totalSlots,
        occupied: inventory.occupiedSlots,
        rows: inventory.rows.length,
        builtin: inventory.builtinCount,
        shippedSlot: inventory.shippedSlotCount,
        risky: inventory.riskyCount,
        hidden: inventory.hiddenCount,
        located: inventory.locatorCount,
      }),
    ),
    node(
      'p',
      { key: 'kinds', className: 'uic-dim' },
      t('settings.kinds', { single: counts.single ?? 0, list: counts.list ?? 0, keyed: counts.keyed ?? 0, chain: counts.chain ?? 0 }),
    ),
    node('div', { key: 'filters', className: 'uic-filters', 'data-uic-filters': '1' }, [
      node('input', {
        key: 'query',
        className: 'uic-input uic-search',
        type: 'search',
        'data-uic-query': '1',
        placeholder: t('settings.search'),
        value: query,
        onChange: (event) => {
          setQuery(event.target.value);
          bump((count) => count + 1);
        },
      }),
      node('div', { key: 'risk', className: 'uic-filterGroup', 'data-uic-filter-group': 'risk' }, [
        filterButton('risk', 'all', t('settings.filter.all')),
        filterButton('risk', 'risky', t('settings.filter.risky')),
        filterButton('risk', 'safe', t('settings.filter.safe')),
      ]),
      node('div', { key: 'bound', className: 'uic-filterGroup', 'data-uic-filter-group': 'bound' }, [
        filterButton('bound', 'all', t('settings.filter.all')),
        filterButton('bound', 'bound', t('settings.filter.bound')),
        filterButton('bound', 'unbound', t('settings.filter.unbound')),
      ]),
      node(
        'span',
        { key: 'count', className: 'uic-dim', 'data-uic-count': String(view.counts.entries) },
        t('settings.filterCount', { slots: view.counts.slots, entries: view.counts.entries }),
      ),
    ]),
    zoneBlock('risky'),
    zoneBlock('safe'),
    zoneBlock('empty'),
    view.counts.entries === 0 && view.counts.empty === 0
      ? node('p', { key: 'no-hit', className: 'uic-dim', 'data-uic-no-hit': '1' }, t('settings.noMatch'))
      : null,
    node('h3', { key: 'presets-h', className: 'uic-h3' }, t('settings.presets')),
    node('div', { key: 'presets', className: 'uic-presets', 'data-uic-presets': '1' }, [
      node('input', {
        key: 'name',
        className: 'uic-input',
        placeholder: t('settings.presetName'),
        value: presetName,
        onChange: (event) => setPresetName(event.target.value),
      }),
      node('button', { key: 'save', className: 'uic-btn', type: 'button', 'data-uic-preset-save': '1', onClick: onSavePreset }, t('settings.savePreset')),
      presetNames.length === 0
        ? node('span', { key: 'none', className: 'uic-dim' }, t('settings.noPresets'))
        : presetNames.map((name) =>
            node('span', { key: name, className: 'uic-preset' }, [
              node('span', { key: 'name', className: 'uic-preset-name' }, name),
              node('button', { key: 'apply', className: 'uic-btn uic-btn-quiet', type: 'button', 'data-uic-preset-apply': name, onClick: () => onApplyPreset(name) }, t('settings.applyPreset')),
              node('button', { key: 'drop', className: 'uic-btn uic-btn-quiet', type: 'button', 'data-uic-preset-drop': name, onClick: () => onDropPreset(name) }, t('settings.dropPreset')),
            ]),
          ),
    ]),
    node('p', { key: 'catalog', className: 'uic-dim', 'data-uic-catalog': inventory.catalogSource }, t(
      inventory.catalogSource === 'runtime' ? 'settings.catalogRuntime' : 'settings.catalogStatic',
      { count: inventory.totalSlots },
    )),
    node('p', { key: 'order-hint', className: 'uic-dim' }, t('settings.orderHint')),
    node('p', { key: 'order-hint-2', className: 'uic-dim' }, t('settings.orderHint2')),
    navBlock,
    node('button', { key: 'reset', className: 'uic-btn uic-btn-quiet', type: 'button', 'data-uic-reset': '1', onClick: onReset }, armed ? t('settings.resetOnce') : t('settings.reset')),
  ]);
}

function apply(ctx) {
  const doc = typeof document === 'undefined' ? null : document;
  const slots = ctx.get('slots');
  const t = translator(localeScope());

  ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'ui-controller: dictionaries');

  const entriesOf = (key) => (slots === undefined ? [] : slots.entriesOfSlot(key));

  const inventory = () => slotRows(entriesOf, readSettings(), runtimeCatalog(slots));

  let pickHandler = null;

  const applyHidden = () => {
    if (doc === null) return;
    const current = readSettings();
    for (const element of Array.from(doc.querySelectorAll('[' + HIDDEN_ATTR + ']'))) element.removeAttribute(HIDDEN_ATTR);
    for (const item of hiddenSelectors(current)) {
      let found = [];
      try {
        found = Array.from(doc.querySelectorAll(item.selector));
      } catch {
        found = [];
      }
      for (const element of found) element.setAttribute(HIDDEN_ATTR, '1');
    }
  };

  const pickElement = (key) => {
    if (doc === null) return;
    if (pickHandler !== null) {
      doc.removeEventListener('click', pickHandler, true);
      pickHandler = null;
    }
    const handler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      doc.removeEventListener('click', handler, true);
      pickHandler = null;
      const target = event.target;
      const selector = buildSelector(target, doc.body ?? doc.documentElement ?? null);
      if (selector === '') return;
      writeSettings({ ...readSettings(), locators: setLocator(readSettings(), key, selector) });
      applyAll();
    };
    pickHandler = handler;
    doc.addEventListener('click', handler, true);
  };

  const stopPicking = () => {
    if (doc !== null && pickHandler !== null) doc.removeEventListener('click', pickHandler, true);
    pickHandler = null;
  };

  injectStyle(doc);
  ctx.effect(() => () => {
    stopPicking();
    clearNavState(doc);
    removeStyle(doc);
    if (doc !== null) {
      for (const element of Array.from(doc.querySelectorAll('[' + HIDDEN_ATTR + ']'))) element.removeAttribute(HIDDEN_ATTR);
    }
  }, 'ui-controller: style');

  /** Elements we wrote `style.order` to; cleared before every pass and on teardown. */
  const ordered = [];

  const applyAll = () => {
    const current = readSettings();
    applyHidden();
    applyVisualOrder(doc, current, ordered);
    applyNavStateTo(doc, current);
  };

  applyAll();
  const timer = setInterval(applyAll, 2000);
  ctx.effect(() => () => clearInterval(timer), 'ui-controller: reapply timer');
  ctx.effect(
    () => () => {
      for (const element of ordered) {
        if (element.style !== undefined) element.style.order = '';
      }
      ordered.length = 0;
    },
    'ui-controller: visual order cleanup',
  );

  ctx.effect(
    () =>
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: SECTION_ID,
            order: SECTION_ORDER,
            locale: NS,
            label: () => t('settings.nav'),
          },
          (props) =>
            h(settingsPage, {
              t,
              inventory,
              apply: applyAll,
              subscribe: () => () => {},
              pick: pickElement,
            }),
        ),
      ),
    'ui-controller: settings section',
  );

  window.__UI_CONTROLLER__ = {
    version: VERSION,
    settings: {
      get: () => JSON.parse(JSON.stringify(readSettings())),
      set: (patch) => JSON.parse(JSON.stringify(patchSettings(isPlainObject(patch) ? patch : {}))),
      reset: () => JSON.parse(JSON.stringify(resetSettings())),
      presets: () => Object.keys(readSettings().presets).sort(),
      savePreset: (name) => savePreset(readSettings(), name),
      applyPreset: (name) => applyPreset(readSettings(), name),
    },
    inventory: () => inventory(),
    catalog: () => SLOT_CATALOG.map((slot) => ({ ...slot })),
    catalogSummary: () => ({ total: SLOT_CATALOG.length, kinds: kindCounts() }),
    apply: applyAll,
  };

  return {
    version: VERSION,
  };
}

window.__ModuleLoader__.load({
  id: 'dsh-ui-controller',
  factory(require) {
    React = require('react');
    return {
      inject: ['slots', 'locale'],
      name: 'dsh-ui-controller',
      apply,
      VERSION,
      SETTINGS_KEY,
      PRESERVED_KEY,
      BACKUP_KEY,
      SETTINGS_VERSION,
      SLOT_CATALOG,
      KIND_ORDER,
      defaultSettings,
      sanitizeSettings,
      sanitizeLocatorKey,
      sanitizeSelector,
      slotRows,
      normalizeEntry,
      flattenSnapshot,
      runtimeCatalog,
      stepVisualOrder,
      canReorderRow,
      visualTargets,
      applyVisualOrder,
      reorderHost,
      canReorder,
      builtinOf,
      shippedSlotOf,
      dropKey,
      kindCounts,
      entryIdOf,
      locatorKeyOf,
      toggleHidden,
      canHide,
      setLocator,
      sanitizeVisualOrder,
      hiddenSelectors,
      locatorReason,
      buildSelector,
      capturePreset,
      savePreset,
      dropPreset,
      applyPreset,
      translator,
      slotGroups,
      filterGroups,
      isOpen,
      toggleOpen,
      resetOpen,
      NAV_ATTR,
      PANEL_SELECTOR,
      PANEL_NAV_STATES,
      NAV_WIDTHS,
      NAV_CSS,
      navWidthOf,
      navColumnsOf,
      hostSidebarCollapsed,
      resolveNavState,
      sanitizeNav,
      applyNavStateTo,
      clearNavState,
      DICTS,
    };
  },
});
