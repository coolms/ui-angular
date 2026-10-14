# Changelog

All notable changes to `@coolms/ui-angular` are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This file starts at the version named below, which is what the registry
currently serves. Earlier alphas are deliberately not reconstructed: entries are written
in the same commit as the work they describe, and inventing the ones that
predate this file would be a worse record than not having them.

## Unreleased

### Added

- A test of what a refused list shows, read from the rendered page alone
  (`datagrid-refused-list.spec.ts`): "Not available to you", no error banner and
  no Retry, for a refused definition and for refused rows. It reads no member of
  the component, so it also runs against the grid before that state existed, and
  fails there on what the page showed: "The list could not be loaded" with a
  Retry.

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

### Fixed

- A grid whose definition is refused with a plain 403 -- one the elevation
  stamp does not mark, so elevating would not change it -- says "Not available
  to you" (`accessDenied()`, `data-test="datagrid-denied"`, announced as a
  status). It showed "The list could not be loaded" with a Retry that could
  only be refused again. The same holds for the grid's own rows request, and
  nothing of the list shows beside it (no table, no "Loading more"). A 403 stamped as needing elevation still offers
  elevation, and any other failure still shows the error.

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
