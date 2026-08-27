import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
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
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { AppConfigState } from '@coolms/core-angular';
import { ToastService } from '../toast.service';
import { VfsNodeDto } from '../../vfs/vfs.types';

function detectLanguage(mime: string) {
    if (mime.includes('html') || mime.includes('dtmpl')) return html();
    if (mime.includes('css'))        return css();
    if (mime.includes('javascript')) return javascript();
    if (mime.includes('json'))       return json();
    if (mime.includes('markdown'))   return markdown();
    return [];  // plain text
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
        .code-editor-dialog__dirty { color: var(--cms-warning); font-size: .75rem; }
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

    readonly node = this.data.node;

    readonly dirty      = signal(false);
    readonly saving     = signal(false);
    readonly loading    = signal(true);
    readonly statusText = computed(() =>
        this.loading() ? 'Loading…' : `${this.node.mimeType ?? 'text/plain'}`
    );

    private editorView?: EditorView;

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
        const lang = detectLanguage(this.node.mimeType ?? '');

        this.editorView = new EditorView({
            doc: content,
            extensions: [
                basicSetup,
                EditorView.lineWrapping, // wrap long lines instead of horizontal scroll (content files have long HTML lines)
                lang,
                oneDark,
                EditorView.updateListener.of(update => {
                    if (update.docChanged) this.dirty.set(true);
                }),
                keymap.of([{ key: 'Mod-s', run: () => { this.save(); return true; } }]),
            ],
            parent: this.editorHost.nativeElement,
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

    close(): void {
        this.dialogRef.close();
    }

    ngOnDestroy(): void {
        this.editorView?.destroy();
    }
}
