# Changelog

All notable changes to `@coolms/ui-angular` are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This file starts at the version named below, which is what the registry
currently serves. Earlier alphas are deliberately not reconstructed: entries are written
in the same commit as the work they describe, and inventing the ones that
predate this file would be a worse record than not having them.

## Unreleased

### Added

- `TabStripComponent` handles overflow: the strip is one row, and the tabs that
  do not fit its width go behind a "more" button (three vertical dots) at the
  right end, in a menu; picking one selects it. The active tab is always in the
  row -- when the host activates a tab that did not fit, it takes the place of
  the last visible one. Fit is measured from the DOM and re-measured on every
  width change; a strip that fits renders as before.

### Changed

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
