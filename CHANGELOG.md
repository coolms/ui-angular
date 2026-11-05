# Changelog

All notable changes to `@coolms/ui-angular` are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This file starts at the version named below, which is what the registry
currently serves. Earlier alphas are deliberately not reconstructed: entries are written
in the same commit as the work they describe, and inventing the ones that
predate this file would be a worse record than not having them.

## Unreleased

- **`UserCalendarPreferencesService.followDeviceZone(zone)`.** For a person whose time zone follows their device: dates are in that zone whatever the settings section answers, on every later read. Null puts the section's zone back.

### Changed
- **The checkbox field widget is the kit's switch** (`.cms-toggle`), where it was Bootstrap's `form-switch`: the kit's global checkbox rules reset that switch's `background-repeat` and remove its knob when checked, so it drew two dots off and a tick on.

- `cms-settings-shell` stacks on a phone: below 600px the list sits above the pane, as wide as the screen and at most a
  third of its height, and the splitter hides. Side by side, the 260px list left the pane a few pixels at 390.

### Added

- `cms-state`'s action bound the Angular way: `actionLabel` and `(acted)`, so a template writes
  `actionLabel="Retry" (acted)="load()"` with no property of its own. The same action as `action` (`{ label, run }`):
  either form, or both, and a press runs `action` and emits `acted`. A denied state still offers none.

### Changed

- `app-empty-state` draws the state component's empty state (`cms-state kind="empty"`), its `hint` the description;
  what a page projects follows it. One icon per kind, as the state contract has it: `icon` is still accepted and no
  longer drawn. Superseded by `cms-state`.
- `cms-elevation-required` draws the state component's elevation state, with its Elevate flow. It still emits
  `elevated` to its host, as it always has, even where the shell can reload the page.
- `RELOAD_PAGE` lives in its own module (`ui/state/reload-page`), still exported from the error banner's: the error
  banner, the elevation state and `cms-state` read it without importing each other in a circle.

### Changed

- `app-loading` draws the state component's loading state (`cms-state kind="loading"`), its `label` the title:
  the spinner from the tokens in place of the old mark, seen only after the state delay. Every page that names it
  changes with no change of its own. Superseded by `cms-state`; it goes once nothing names it.

### Added

- `cms-state` (`StateComponent`), the UI contract's `state`: one component for every state a page, a card or a line
  of text can be in instead of its content. `kind` is loading, empty, error, denied or elevation-required; `title` and
  `description` are strings; `action` is an optional `{ label, run }` (Retry, or what an empty state suggests);
  `placement` is page, block or inline. A loading state turns a spinner drawn from the tokens (`--cms-spinner-*`),
  seen only after `--cms-state-delay`, so a fast read does not flash. Every kind is `role="status"` with
  `aria-live="polite"`. Given `error`, a refusal for want of elevation is shown as the elevation state, and its
  Elevate loads the page again where the shell provides `RELOAD_PAGE`, else `elevated` fires. Each token is read with
  a fallback equal to its value, so the component looks the same before the tokens that name it are installed.
- `elevateOnce()`, the Elevate flow `cms-elevation-required` and `cms-state` share: the prompt opens from the
  person's request only, and an elevation granted elsewhere counts.

### Removed

- `cms-settings-shell`'s `backLink` input, and the back link it drew above the page header. The page header is
  the one shared header; an object's settings now open in a modal over the object's own page, whose close button
  is the way back, and breadcrumbs lead back from a settings page. A consumer still binding `[backLink]` fails to
  compile, which is how it is found.

### Changed

- The LICENSE names its copyright holder in the form decided on 2026-10-23.
  The licence itself (MIT) is unchanged.

## 2.0.0-alpha.6 - 2026-10-22

### Fixed

- **The toast count badge's fallback is the token's own value.** The badge
  draws `var(--cms-accent-contrast, ...)`; the design tokens define that token
  from 0.3.0 as `accent-fg`, #1a1a1a, and the fallback said `#fff` -- white on
  the amber, 2.03:1, wherever the theme is absent. It is now #1a1a1a, 8.59:1.

### Security

- **Angular 22.2.3 for development and the tests.** Every `@angular/*`
  development dependency moves from 22.2.0 to 22.2.3 together, the version the
  admin already runs. 22.2.0's `@angular/router` carries two high advisories
  (denial of service in server-side rendering: GHSA-57xq-rjx2-v5xh,
  GHSA-62vg-58rm-qff7), fixed in 22.2.1. The peer ranges are unchanged
  (`^22.0.0`): an application still chooses its own Angular 22.

### Added

- **One toast stack for what was done and what arrived.** `ToastService` and
  `app-toast-outlet` now also draw arrivals: a `kind` (`ring`, `message`,
  `visitor`, `task`, `mail`, `bell`, the platform's notification kinds) gives
  the toast that kind's icon. A `groupKey` keeps one toast per key: a later
  `show` with the key updates it where it stands and starts its time again,
  and `closeGroup(key)` takes it away. Up to two `actions`, the first drawn
  as primary (`action` still works). A `count` is drawn when more than one
  arrived. A `persistent` toast stays until closed and is never pushed out;
  a ringing call (`kind: 'ring'`) is drawn as urgent and announced as an
  alert. A toast with an `open` has its title and message as a button of
  their own, so it opens by keyboard as well as by a click. At most four are
  shown, the oldest that is not persistent leaving first. Hovering a toast,
  or moving the focus into it, stops its clock. `show` returns the toast's
  id.
- A test of what a refused list shows, read from the rendered page alone
  (`datagrid-refused-list.spec.ts`): "Not available to you", no error banner and
  no Retry, for a refused definition and for refused rows. It reads no member of
  the component, so it also runs against the grid before that state existed, and
  fails there on what the page showed: "The list could not be loaded" with a
  Retry.

### Changed

- **Breaking: `engines.node` names exactly the Node lines CI runs.** It moves from
  `^22.22.3 || ^24.15.0 || >=26` to `^22.22.3 || ^24.15.0 || ^26.0.0`: Node 27
  and later are not declared until CI runs them. Within each line the floor is
  the highest one any package in the lockfile declares. CI checks both, from
  the matrix and the lockfile. The published code does not change.

- The toast stack sits at the bottom right (it was at the top right), the
  same place for every toast.

### Fixed

- The code editor never saves over a file whose read named no version.
  Such a file is shown and editable, the notice says its version could not
  be read, and Save offers the copy (written with overwrite off) instead of
  writing over the file. Before, it saved such a read without `If-Match`,
  so nothing could refuse a save over a newer version.

## 2.0.0-alpha.5 - 2026-10-15

Measured on the bundles: 120 runtime exports in alpha.4, 121 in alpha.5, none
removed. The one added: `VFS_NODE_WATCH`.

### Added

- A save names the version it opened. `VfsNodeDto.contentHash` carries a file's
  version to a reader who may read it; the code editor keeps the version the
  file was read at and sends it with its save (`If-Match`). When the server
  answers that the file changed meanwhile (412), the editor says so and offers
  to save the edits as a copy, written with overwrite off -- never over the
  file; when the file was deleted (404), it says so and offers the same copy,
  and the file is not made again. Once the file moved on, Save never goes to it
  again. A file that could not be read is not opened empty, and Save never
  writes it.
- `VFS_NODE_WATCH` and `VfsNodeChange`: what a host hands an editor so it hears
  at once that its file changed or went; the editor's own save, told apart by
  its version, is not reported back to it.

## 2.0.0-alpha.4 - 2026-10-14

Measured on the bundles: 107 runtime exports in alpha.3, 120 in alpha.4, none
removed. The 13 added: `KeyboardScopeService`, `bindKeys`, `controlOwnsKey`,
`ElevationRequiredComponent`, `DeclaredRowsNoticeComponent`,
`capabilityContext`, `capabilityRefusals`, `capabilityStateOf`,
`leastCapabilities`, `refusalPhraseOf`, `declaredRowsSource`,
`CAPABILITIES_CONTEXT_KEY` and `CAPABILITY_REFUSALS_CONTEXT_KEY`.

### Added

- The topmost overlay owns the keyboard. `KeyboardScopeService` keeps one stack
  of layers -- the page, every open CDK dialog in the order it opened, and any
  surface pushed with `pushLayer()` -- and one document listener: a key reaches
  only the bindings whose host lies in the topmost layer, last bound first, so
  no shortcut of a view fires while a dialog, an editor or a menu is open over
  it. `bindKeys(handler, options)` binds a component's shortcuts to its own
  layer and unbinds them on destroy. A key from an overlay that is no layer (a
  menu, an autocomplete), or under a modal opened without the Dialog service,
  reaches no page binding. The ESC coordinator and the data grid go through it;
  the context menu is a layer while it is open.
- A focused control keeps the keys that work it: `controlOwnsKey(el, event)`.
  A form field of any kind (text, select, contenteditable, checkbox, radio,
  range) takes every key, and a button, a link or a control role takes Space
  and Enter, which press it. A binding takes them anyway only with
  `inControls: true`.
- `ElevationRequiredComponent` (`cms-elevation-required`): what a page or
  section shows in place of its content after a read refused for want of
  elevation -- "This section needs an elevated session", and an Elevate button,
  the only thing there that opens the prompt. It emits `elevated` once the
  session is elevated, and the host loads again. A toast can carry one action
  button (`ToastAction`), e.g. "Elevate".

- A disabled action says how many of the selection refuse it.
  `capabilityRefusals()` counts, per action, the selected subjects that answer
  `denied`, out of every one selected; `capabilityContext()` publishes it beside
  the least state, under `_capabilityRefusals`. The page toolbar and the context
  menu put it in a denied action's title and screen-reader text: "not allowed
  for 2 of 5 selected items", or "not allowed for the selected item".

- A grid's rows can come from where its definition declares they do.
  `DataGridConfig.rows` carries the declared list action, its operation, what
  it comes to for the caller (`allowed` / `elevate` / `denied`) and its query
  style (`rql` / `none`). `declaredRowsSource()` reads the rows from that
  operation and nowhere else -- `rql`: the grid's page, limit, sort and one
  `filter` per RQL expression; `none`: one GET -- drops answers a later
  request superseded, keeps a request that came before the definition, and
  fetches nothing for `elevate` or `denied`. `DeclaredRowsNoticeComponent`
  shows those states (the elevation notice; "Not available to you"; the
  server's words) instead of an empty grid.
- `DataGridComponent` emits `configLoaded` with each definition it reads,
  BEFORE it first asks for rows, and reads a definition that declares its rows
  again when elevation is granted, dropped or expires.
- A navi node that names a `capability` (a declared action's name) takes its
  state from the page's subjects, on the toolbar and in the context menu
  alike: `denied` disables it -- it stays put, so a bar does not reflow as the
  selection changes -- and `elevate` locks it: drawn with a lock, its title
  saying it needs an elevated session -- as does a visually hidden phrase after
  its label, for a screen reader -- its click emitted as before (what a locked
  action does is the page's). No answer leaves the node as it was.
  `ToolbarAction.locked` and `ContextMenuItem.locked` carry it.
- `leastCapabilities(subjects)` turns a selection into one state per action
  -- the least across the subjects (`denied` < `elevate` < `allowed`) -- for a
  page to publish as `_capabilities` (`CAPABILITIES_CONTEXT_KEY`), and
  `capabilityStateOf(meta, context)` reads a node's state from it. A subject
  with no answer, or an empty one (an empty map arrives as JSON `[]`), does not
  vote; a key missing from a non-empty answer, or a state not recognised, is
  `denied`.
- `VfsNodeDto.capabilities`: what each declared node action comes to for the
  caller on that node, as the server sends it.

### Changed

- A confirmation of what cannot be undone opens with Cancel focused
  (`cdkFocusInitial`): the delete dialog, and the shared confirm when it is
  `danger`. Enter or Space then presses Cancel.
- Every focus indicator is a 2px ring in `--cms-focus-ring`, 3:1 against what
  surrounds it (the fallback is the admin theme's light value, `#7c4d00`):
  fields draw their edge plus a 1px ring, toggles a 2px gap and then a 2px ring.
  The edges of the field controls the kit draws itself -- the tag input, the
  multi-option and lazy selects' triggers and searches, the cron form's inputs,
  the colour field's swatch and the range pickers' trigger -- take
  `--cms-border-control` (3:1 or better on every surface in both schemes);
  buttons keep `--cms-btn-border`. The page toolbar's danger button takes the
  danger red for its edge and the danger text colour for its label, and the
  active button's edge the selection's text colour. The literal text fallbacks
  follow the theme's muted (`#69707c`) and secondary (`#525a66`) values.
- `FormRenderService.preview()`, a read sent by POST as a builder's draft
  changes, carries `BACKGROUND_REQUEST`, so a refusal never raises an elevation
  notice at every debounce tick. On an installation that cannot elevate,
  Elevate says "Elevation isn't available here. Ask an administrator." instead
  of doing nothing visible.
- Requires `@coolms/core-angular` `^2.0.0-alpha.5` (`BACKGROUND_REQUEST`,
  `isElevationRefusal`).

### Fixed

- A grid whose definition is refused with a plain 403 -- one the elevation
  stamp does not mark, so elevating would not change it -- says "Not available
  to you" (`accessDenied()`, `data-test="datagrid-denied"`, announced as a
  status). It showed "The list could not be loaded" with a Retry that could
  only be refused again. The same holds for the grid's own rows request, and
  nothing of the list shows beside it (no table, no "Loading more"). A 403 stamped as needing elevation still offers
  elevation, and any other failure still shows the error.
- A section refused for want of elevation drew nothing: the explorer layout
  rendered only from a layout that loaded, and its read had no error branch.
  It now tracks the read (loading, ready, elevation, error): the elevation
  notice for a stamped refusal, the readable reason with a Retry for any other
  failure, and the footer only with the content it counts. The data grid shows
  the same notice when its definition or its rows are refused for want of
  elevation; its error texts are readable sentences, and Retry reads the
  definition again when that is what failed.
- An icon-only locked button had the hidden phrase as its whole accessible
  name -- "(needs an elevated session)", without the action. Where no label is
  drawn the phrase now carries the action's name ("Permissions (needs an
  elevated session)"), and after a drawn label the reason alone.
  `ToolbarAction.title` is the action's own title again; the tooltip adds
  " -- needs an elevated session" for a locked action.
- The README counted 104 of 147 modules as exported; it is 109 of 152.

## 2.0.0-alpha.3 - 2026-09-27

### Added

- `VfsWriteAccessService` and `FormRenderService` are public: 2.0.0-alpha.2
  exported neither, so a package importing `VfsWriteAccessService` from the
  published build failed to compile (TS2305) -- dtmpl-angular's first CI run
  stopped on exactly that. Measured on the bundles: 104 runtime exports in
  alpha.2, 107 in alpha.3 (these two and `SlotComponent`), none removed.
- `TabStripComponent` handles overflow: the strip is one row, and the tabs that
  do not fit its width go behind a "more" button (three vertical dots) at the
  right end, in a menu; picking one selects it. The active tab is always in the
  row -- when the host activates a tab that did not fit, it takes the place of
  the last visible one. Fit is measured from the DOM and re-measured on every
  width change; a strip that fits renders as before.

### Changed

- The selected family: a selected wash reads `--cms-selected-light` and the
  text on it `--cms-selected-text` (the page toolbar's pressed button, the
  view switcher, the accordion's open header, the directory and tree
  pickers' rows, the multi-option's checked option); the foreground on a
  solid selected mark reads `--cms-selected-fg` (the wizard's step index,
  the dynamic layout's step number). The host theme aliases each to the
  accent's tier and refuses a selected fill whose text names another family.
- Every selection mark reads `--cms-selected`, the host theme's token for
  "this one is selected", instead of `--cms-accent`: the tab strip's underline,
  the dynamic layout's form tabs and wizard step, the wizard's step index, the
  page toolbar's pressed button, the view switcher's active button and the
  explorer accordion's open section. The theme aliases the token to the accent
  today; a rule that named the accent could not be re-themed apart from the
  buttons. Checked controls (the range picker's toggle) keep the accent: a
  switch that is on is not an item that is selected.
- `TabStripComponent` underlines the active tab in `--cms-accent`, the colour
  of every "you are here" mark and primary action in the admin, instead of the
  blue `--cms-primary`; the underline sits on the strip's rule rather than
  above it.
- `SlotComponent` (`<app-slot key="..." [inputs]="...">`) is public. It renders
  whatever `ComponentRegistry` holds under a key and was reachable only through
  the explorer and list layouts; a feature page that opens a slot of its own,
  such as the profile page's `profile.tab`, imports it directly now.
- Declares `bugs` so a page imported from this package, and the catalogue,
  know where a correction is filed. The registry filled the gap from GitHub when
  the manifest was silent; the declared field is the one that holds on any
  registry.

### Fixed

- The README counted 101 of 146 modules as exported; it is 104 of 147.

## 2.0.0-alpha.2 -- 2026-09-03

**A pre-release, carrying no compatibility promise.** Published under the
`alpha` dist-tag.

The UI kit: the data grid, server-declared dynamic forms, page scaffolding,
dialogs, pickers, and the chrome an administrative surface is built from. It
sits above `@coolms/core-angular`, which owns the session, the manifest and the
theme -- the kit draws, core knows.

### Fixed

- **Eleven optional peers were imported at the top of the bundle**, which made
  the `optional` declaration untrue: ng-packagr emits one fesm bundle with no
  code splitting, so a top-level import has to resolve for every consumer while
  `optional` tells npm not to install it. Installing the kit alone produced a
  package that could not build, and nothing reported it.

  The CodeMirror packages and `centrifuge` are now fetched on demand, and the
  rich-text field loads `@coolms/editor-angular` through a deferred block. A
  consumer who uses neither the code editor nor the realtime client installs
  neither.
- `@codemirror/state` was imported and never declared at all. It is now an
  optional peer beside the others.
