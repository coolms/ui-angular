# Changelog

All notable changes to `@coolms/ui-angular` are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This file starts at the version named below, which is what the registry
currently serves. Earlier alphas are deliberately not reconstructed: entries are written
in the same commit as the work they describe, and inventing the ones that
predate this file would be a worse record than not having them.

## 2.0.0-alpha.2 — 2026-09-03

**A pre-release, carrying no compatibility promise.** Published under the
`alpha` dist-tag.

The UI kit: the data grid, server-declared dynamic forms, page scaffolding,
dialogs, pickers, and the chrome an administrative surface is built from. It
sits above `@coolms/core-angular`, which owns the session, the manifest and the
theme — the kit draws, core knows.

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
