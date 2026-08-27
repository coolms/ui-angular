# @coolms/ui-angular

The CoolMS UI kit for Angular: the data grid, server-declared forms, page
scaffolding, dialogs, pickers, and the chrome an administrative surface is
built from.

It sits above [`@coolms/core-angular`](https://github.com/coolms/core-angular),
which owns the session, the boot manifest, theming and the wire types. The kit
draws; core knows.

## Install

```bash
npm install @coolms/ui-angular @coolms/core-angular
```

Angular 22, NGXS 22, RxJS 7 and `@angular/cdk` are peers. The CodeMirror
packages and `centrifuge` are **optional** peers: install them only if you use
the code editor or the realtime notification client.

## Use

Everything public is exported from the package root. There is no deep import
path, and that is enforced rather than encouraged — the barrel at
`src/public-api.ts` is the whole API.

```ts
import { CmsListPageComponent, DataGridComponent, ToastService } from '@coolms/ui-angular';
```

101 of the package's 146 modules are exported, chosen from the symbols a real
application names. The remaining 45 are internal: `export`ed so their
neighbours can reach them, which is not the same as being public. If something
you need is missing, exporting it is a deliberate decision about the API rather
than an import detail — open an issue.

## Building it

```bash
npm --prefix ../core-angular run build   # the kit compiles against core's built types
npm run build
```

Core is consumed as a **built peer**, not as sources. Source-consuming it would
put core's files outside this package's `rootDir` and, worse, compile core into
this bundle — two copies of one runtime in any application that installs both.

## Status

Not published. One dependency stands between this package and a standalone
build: two dynamic-form fields import `CoolmsEditorComponent` from
`@coolms/editor-angular`, which is not a package yet — it currently lives in
the admin application at `src/app/coolms-editor`, already behind its own
`public-api.ts`. Until it is extracted, `npm run build` here reports exactly
two `TS2307`s and nothing else.

The application that consumes this kit builds and tests green today, because it
compiles the kit from source through a path mapping and resolves the editor
from its own tree.

## Licence

MIT.
