import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    ElementRef,
    inject,
    OnDestroy,
    signal,
    ViewChild,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Store } from '@ngxs/store';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
/**
 * ── Why CodeMirror is loaded, not imported ───────────────────────────────
 *
 * All nine of these are declared OPTIONAL peers, and a static import made
 * that a lie. ng-packagr emits ONE fesm bundle with no code splitting, so a
 * top-level import must resolve for every consumer of the kit -- while
 * `optional` tells npm not to install it. `npm install @coolms/ui-angular`
 * produced a package that could not build, and nothing said so: the manifest
 * and the bundle disagreed and only the bundle was true.
 *
 * These imports are TYPE-ONLY, which TypeScript erases entirely, and the
 * modules are fetched on demand by `loadCodeMirror()`. The editor is a modal
 * that only opens on a file the user chose to edit, so there was never a
 * reason to pay for it at load -- the eager import bought nothing and cost
 * every consumer the whole dependency.
 */
import type * as CmView from '@codemirror/view';
import type * as CmState from '@codemirror/state';
import type * as CmBasic from 'codemirror';
import type * as CmDark from '@codemirror/theme-one-dark';
import type * as CmHtml from '@codemirror/lang-html';
import type * as CmCss from '@codemirror/lang-css';
import type * as CmJavascript from '@codemirror/lang-javascript';
import type * as CmJson from '@codemirror/lang-json';
import type * as CmMarkdown from '@codemirror/lang-markdown';
import { AppConfigState, ThemeService, type ResolvedTheme } from '@coolms/core-angular';
import { ToastService } from '../toast.service';
import { ConfirmDialogService } from '../confirm-dialog.service';
import { UnsavedChangesService } from '../unsaved-changes.service';
import { VfsNodeDto } from '../../vfs/vfs.types';

/** Everything the editor needs from CodeMirror, fetched in one go. */
interface CodeMirrorBundle {
    view: typeof CmView;
    state: typeof CmState;
    basic: typeof CmBasic;
    dark: typeof CmDark;
    html: typeof CmHtml;
    css: typeof CmCss;
    javascript: typeof CmJavascript;
    json: typeof CmJson;
    markdown: typeof CmMarkdown;
}

/**
 * Memoised on the PROMISE, not on the result: two dialogs opened before the
 * first load settles must await the same fetch rather than start a second.
 */
let codeMirror: Promise<CodeMirrorBundle> | null = null;

function loadCodeMirror(): Promise<CodeMirrorBundle> {
    codeMirror ??= Promise.all([
        import('@codemirror/view'),
        import('@codemirror/state'),
        import('codemirror'),
        import('@codemirror/theme-one-dark'),
        import('@codemirror/lang-html'),
        import('@codemirror/lang-css'),
        import('@codemirror/lang-javascript'),
        import('@codemirror/lang-json'),
        import('@codemirror/lang-markdown'),
    ]).then(([view, state, basic, dark, html, css, javascript, json, markdown]) => ({
        view, state, basic, dark, html, css, javascript, json, markdown,
    })).catch((err) => {
        // Clear the memo so a transient network failure can be retried by
        // reopening the dialog, rather than being cached forever.
        codeMirror = null;
        throw err;
    });

    return codeMirror;
}

function detectLanguage(cm: CodeMirrorBundle, mime: string): CmState.Extension {
    if (mime.includes('html') || mime.includes('dtmpl')) return cm.html.html();
    if (mime.includes('css'))        return cm.css.css();
    if (mime.includes('javascript')) return cm.javascript.javascript();
    if (mime.includes('json'))       return cm.json.json();
    if (mime.includes('markdown'))   return cm.markdown.markdown();
    return [];  // plain text
}

/**
 * The light counterpart to `oneDark`.
 *
 * CodeMirror paints its own chrome imperatively, so unlike a template the
 * editor cannot inherit the admin's surface -- it has to be told. Every value
 * here is a --cms-* token rather than a literal, so this follows the palette
 * (a user's accent override included) instead of pinning a second set of
 * colours that would drift from the theme.
 */
const cmsLightTheme = (EditorView: typeof CmView.EditorView) => EditorView.theme({
    '&': {
        backgroundColor: 'var(--cms-surface)',
        color: 'var(--cms-text)',
    },
    '.cm-content': { caretColor: 'var(--cms-text)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--cms-text)' },
    '.cm-gutters': {
        backgroundColor: 'var(--cms-surface-muted)',
        color: 'var(--cms-text-muted)',
        border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'var(--cms-active-bg)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--cms-active-bg)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: 'var(--cms-info-subtle)',
    },
}, { dark: false });

function themeExtension(cm: CodeMirrorBundle, theme: ResolvedTheme): CmState.Extension {
    return 'dark' === theme ? cm.dark.oneDark : cmsLightTheme(cm.view.EditorView);
}

@Component({
    selector: 'app-code-editor',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="code-editor-dialog">
            <div class="code-editor-dialog__header">
                <span class="code-editor-dialog__title">
                    <i class="bi bi-file-earmark-code"></i>
                    {{ node.path }}
                </span>
                <div class="code-editor-dialog__actions">
                    @if (dirty()) {
                        <span class="code-editor-dialog__dirty">unsaved changes</span>
                    }
                    <button class="cms-btn cms-btn-sm" (click)="close()">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            </div>

            <div class="code-editor-dialog__body" #editorHost></div>

            <div class="code-editor-dialog__footer">
                <span class="code-editor-dialog__status">{{ statusText() }}</span>
                <div class="d-flex gap-2">
                    <button class="cms-btn cms-btn-sm" (click)="close()">Cancel</button>
                    <button class="cms-btn cms-btn-primary cms-btn-sm"
                            [disabled]="saving() || !dirty()"
                            (click)="save()">
                        {{ saving() ? 'Saving…' : 'Save' }}
                    </button>
                </div>
            </div>
        </div>
    `,
    styles: [`
        .code-editor-dialog {
            display: flex; flex-direction: column;
            width: min(90vw, 1100px);
            height: min(85vh, 800px);
            background: var(--cms-surface);
            border-radius: var(--cms-radius-lg);
            overflow: hidden;
        }
        .code-editor-dialog__header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 16px;
            border-bottom: 1px solid var(--cms-border);
            flex-shrink: 0;
        }
        .code-editor-dialog__title {
            font-size: .875rem; font-weight: 600;
            display: flex; align-items: center; gap: 8px;
            font-family: 'Courier New', monospace;
        }
        .code-editor-dialog__actions {
            display: flex; align-items: center; gap: 8px;
        }
        /* min-height:0 lets this flex item shrink so the CodeMirror view can
           fill it instead of being pushed taller by its own content. */
        .code-editor-dialog__body { flex: 1; overflow: hidden; min-height: 0; }
        .code-editor-dialog__footer {
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px 16px;
            border-top: 1px solid var(--cms-border);
            flex-shrink: 0;
            font-size: .8125rem;
        }
        .code-editor-dialog__dirty { color: var(--cms-warning-text); font-size: .75rem; }
        .code-editor-dialog__status { color: var(--cms-text-muted); }

        /* CodeMirror builds .cm-editor imperatively inside #editorHost, so it
           carries no Angular emulated-encapsulation scoping attribute — pierce
           with :host ::ng-deep (which MUST lead with :host). The previous rule
           was \`.code-editor-dialog__body :host ::ng-deep .cm-editor\` — :host
           mid-selector never matches (the host is the body's ANCESTOR), so the
           rule was dead and the editor collapsed to its 2-line content height
           instead of filling the modal. */
        :host ::ng-deep .cm-editor { height: 100%; }
    `],
})
export class CodeEditorComponent implements OnDestroy, AfterViewInit {
    @ViewChild('editorHost', { static: true }) editorHost!: ElementRef;

    private readonly dialogRef  = inject(DialogRef);
    private readonly data       = inject(DIALOG_DATA) as { node: VfsNodeDto };
    private readonly http       = inject(HttpClient);
    private readonly store      = inject(Store);
    private readonly toast      = inject(ToastService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly theme      = inject(ThemeService);
    private readonly confirm    = inject(ConfirmDialogService);
    private readonly unsaved    = inject(UnsavedChangesService);

    readonly node = this.data.node;

    readonly dirty      = signal(false);
    readonly saving     = signal(false);
    readonly loading    = signal(true);
    readonly statusText = computed(() =>
        this.loading() ? 'Loading…' : `${this.node.mimeType ?? 'text/plain'}`
    );

    private editorView?: CmView.EditorView;

    /** Set once `loadCodeMirror()` settles; every use is guarded on it. */
    private cm?: CodeMirrorBundle;

    /** The load is async, so the dialog can outlive its own request. */
    private destroyed = false;

    /**
     * Lets the theme be swapped in place rather than rebuilding the view.
     * Constructed with the rest of CodeMirror rather than as a field
     * initialiser, because `Compartment` is now a runtime import.
     */
    private themeCompartment?: CmState.Compartment;

    constructor() {
        // beforeunload half of the guard: the per-dialog confirm
        // cannot see a tab close or a reload. Disposed with the component, so
        // a closed editor stops voting.
        this.destroyRef.onDestroy(this.unsaved.watch(this, () => this.dirty()));
        // The admin theme can flip while this dialog is open, so the editor
        // reconfigures instead of staying on whatever it was built with. The
        // effect also runs before ngAfterViewInit, when there is no view yet --
        // harmless, because initEditor() seeds the compartment from the same
        // signal.
        effect(() => {
            // Read the signal FIRST and unconditionally: an early return
            // before this line would stop the effect tracking the theme, so
            // it would never fire again once CodeMirror finished loading.
            const resolved = this.theme.resolved();
            if (!this.cm || !this.editorView || !this.themeCompartment) return;
            this.editorView.dispatch({
                effects: this.themeCompartment.reconfigure(themeExtension(this.cm, resolved)),
            });
        });
    }

    ngAfterViewInit(): void {
        this.loadContent();
    }

    private loadContent(): void {
        const manifest = this.store.selectSnapshot(AppConfigState.manifest);
        const url = manifest?.vfs?.fileContentUrl?.replace('{path}', encodeURIComponent(this.node.path));
        if (!url) {
            this.loading.set(false);
            this.initEditor('');
            return;
        }

        this.http.get<{ content: string }>(url).pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: ({ content }) => {
                this.loading.set(false);
                this.initEditor(content);
            },
            error: () => {
                this.loading.set(false);
                this.initEditor('');
            },
        });
    }

    private initEditor(content: string): void {
        loadCodeMirror().then((cm) => {
            // The dialog can be closed while the chunk is in flight; building
            // a view into a detached host would leak it.
            if (this.destroyed) return;

            this.cm = cm;
            const { EditorView, keymap } = cm.view;
            this.themeCompartment = new cm.state.Compartment();

            this.editorView = new EditorView({
                doc: content,
                extensions: [
                    cm.basic.basicSetup,
                    EditorView.lineWrapping, // wrap long lines instead of horizontal scroll (content files have long HTML lines)
                    detectLanguage(cm, this.node.mimeType ?? ''),
                    this.themeCompartment.of(themeExtension(cm, this.theme.resolved())),
                    EditorView.updateListener.of(update => {
                        if (update.docChanged) this.dirty.set(true);
                    }),
                    keymap.of([{ key: 'Mod-s', run: () => { this.save(); return true; } }]),
                ],
                parent: this.editorHost.nativeElement,
            });
        }).catch(() => {
            // An optional peer that was never installed lands here. Say so
            // rather than leaving an empty box: the dialog is otherwise
            // indistinguishable from a file that failed to load.
            this.toast.error(
                'The code editor could not load',
                'Install the optional @codemirror packages to enable it.',
            );
        });
    }

    save(): void {
        if (!this.editorView || this.saving()) return;
        this.saving.set(true);

        const content  = this.editorView.state.doc.toString();
        const manifest = this.store.selectSnapshot(AppConfigState.manifest);
        const url = manifest?.vfs?.fileContentUrl?.replace('{path}', encodeURIComponent(this.node.path));
        if (!url) {
            this.saving.set(false);
            return;
        }

        this.http.put<{ contentHash: string }>(url, { content }).pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: () => {
                this.dirty.set(false);
                this.saving.set(false);
                this.toast.success('Saved', this.node.name);
            },
            error: () => {
                this.saving.set(false);
                this.toast.error('Save failed');
            },
        });
    }

    /**
     *  This used to be `this.dialogRef.close()` and nothing else, so the
     * editor SHOWED "unsaved changes" in its own footer and then threw them
     * away without a word when you pressed Cancel or the header X. The flag
     * was rendered and never consulted.
     */
    close(): void {
        if (!this.dirty()) {
            this.dialogRef.close();

            return;
        }

        this.confirm.confirmDiscard(this.node.name).pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe((discard) => {
            if (discard) this.dialogRef.close();
        });
    }

    ngOnDestroy(): void {
        this.destroyed = true;
        this.editorView?.destroy();
    }
}
