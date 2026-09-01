// @ts-check
/**
 * ESLint config for `@coolms/ui-angular`.
 *
 * Written at the same time as the move, not after it. These 147 files were
 * linted as `src/app/shared/**` until the moment they left the admin's `src/`
 * tree, and nothing would have reported their leaving -- an extraction takes
 * code OUT of a tool's configured scope silently, which is how core-angular's
 * 30 files sat unchecked, and how phpstan's "clean" once meant "clean over a
 * smaller scope".
 *
 * **One bar, not a fork.** The rules come from the same
 * `packages/eslint.config.base.mjs` factory the admin SPA and core use, so a
 * rule added there reaches this package too. The factory takes its runtime deps
 * as arguments because it lives outside any `node_modules` tree; ours resolve
 * through the relative `node_modules` symlink into the admin's -- the same one
 * that keeps a single `@angular` tree in play for the build.
 *
 * The base is VENDORED here as `eslint.config.base.mjs`, a byte-identical
 * copy of `packages/eslint.config.base.mjs`. That is what lets this package
 * lint inside its own repository, where the shared file does not exist.
 * `make check-fe` fails if a copy drifts; fix drift by editing the canonical
 * file and running `node tools/sync-eslint-base.mjs`, never by editing the
 * copy -- an edit in place is reverted by the next sync, silently.
 */

import createBaseConfig from './eslint.config.base.mjs';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/** @type {import('typescript-eslint').ConfigArray} */
export default tseslint.config(
    ...createBaseConfig({ tseslint, globals }),

    // `tsconfig.lib.json` excludes specs, so a type-checked rule has no program
    // for them. They are type-checked by the admin's `tsconfig.spec.json`,
    // which names this package's specs explicitly.
    {
        ignores: ['dist/**', 'src/**/*.spec.ts'],
    },

    {
        files: ['**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: ['./tsconfig.lib.json'],
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            '@angular-eslint': angular.tsPlugin,
        },
        processor: angular.processInlineTemplates,
        rules: {
            ...angular.configs.tsRecommended.at(-1).rules,

            // The kit's selectors are `cms-*` and `app-*`, inherited from when
            // it was a directory in the admin. A package that ships components
            // should own one prefix, but a selector is consumer-visible: that
            // is an API decision, not a lint pass.
            '@angular-eslint/component-selector': [
                'warn',
                { type: 'element', prefix: ['app', 'cms', 'coolms'], style: 'kebab-case' },
            ],
            '@angular-eslint/directive-selector': [
                'warn',
                { type: 'attribute', prefix: ['app', 'cms', 'coolms'], style: 'camelCase' },
            ],
            '@angular-eslint/prefer-on-push-component-change-detection': 'warn',

            // Every fire of this in the sibling package was the same line:
            // `store.selectSnapshot(SomeState.someSelector)`. An NGXS selector
            // is a STATIC built by `@Selector()` that never touches `this`, so
            // passing it unbound is the documented API. `ignoreStatic` drops
            // exactly those and leaves the rule live for instance methods,
            // where the hazard is real.
            '@typescript-eslint/unbound-method': ['error', { ignoreStatic: true }],

            //  These are the admin's deferrals, carried over deliberately.
            // 147 files arrived here already written; promoting them to error
            // in the same commit that moved the directory would have buried a
            // structural change under hundreds of unrelated edits. They are
            // visible as warnings, and tightening them is its own pass.
            '@typescript-eslint/no-base-to-string': 'warn',
            '@typescript-eslint/consistent-type-imports': 'warn',
            '@typescript-eslint/prefer-nullish-coalescing': 'warn',
            '@typescript-eslint/no-redundant-type-constituents': 'warn',
            '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
            '@typescript-eslint/no-unnecessary-condition': 'warn',
            '@typescript-eslint/strict-boolean-expressions': 'warn',
            '@typescript-eslint/no-floating-promises': 'warn',
            '@typescript-eslint/no-misused-promises': 'warn',
            '@typescript-eslint/require-await': 'warn',
        },
    },

    {
        files: ['**/*.html'],
        ...tseslint.configs.disableTypeChecked,
    },
    {
        files: ['**/*.html'],
        languageOptions: { parser: angular.templateParser },
        plugins: { '@angular-eslint/template': angular.templatePlugin },
        rules: {
            ...angular.configs.templateRecommended.at(-1).rules,
            '@angular-eslint/template/click-events-have-key-events': 'warn',
            '@angular-eslint/template/interactive-supports-focus': 'warn',
            '@angular-eslint/template/alt-text': 'warn',
        },
    },
);
