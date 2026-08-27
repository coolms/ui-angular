
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    HostBinding,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import type { VfsNodeDto } from '../../vfs/vfs.types';
import { VfsTreeService } from './vfs-tree.service';

/**
 * Predicate signature used by `selectableWhen` — given a directory
 * node, return `true` to allow selection. Default policy is "user
 * must have write permission" (a directory you can't create children
 * in is never a sensible save target).
 */
export type DirectorySelectablePredicate = (node: VfsNodeDto) => boolean;

/**
 * Flattened tree-row shape rendered by the template. Mirrors the
 * pattern documented in `app-vfs-tree`: cheaper than recursive
 * component instantiation because Angular only diffs one
 * `@for (row of flatRows())` instead of a per-node component tree.
 */
type FlatRow =
    | { readonly kind: 'node';    readonly node: VfsNodeDto; readonly depth: number }
    | { readonly kind: 'empty';   readonly parentPath: string; readonly depth: number }
    | { readonly kind: 'loading'; readonly parentPath: string; readonly depth: number }
    | { readonly kind: 'error';   readonly parentPath: string; readonly depth: number; readonly message: string };

/**
 * Generic VFS directory picker for the admin SPA. Consuming features
 * (Document Generation wizard, Media Spaces UI, file move/copy
 * dialogs) bind the picker as a drop-in primitive.
 *
 * The component is intentionally narrow:
 *  - Reads VFS through `VfsTreeService` (three thin endpoints).
 *  - Owns the in-memory tree cache (`childrenMap`, `expandedPaths`,
 *    `pathLoaded`) so the consumer never sees HTTP state.
 *  - Single-selection only. Multi-select is deferred (per prompt).
 *  - Honours backend permission filtering plus a caller-supplied
 *    `selectableWhen` predicate for finer gating.
 *
 * Accessibility: the tree carries `role="tree"`; each row carries
 * `role="treeitem"` with `aria-expanded` / `aria-selected` / `aria-level`.
 * Keyboard navigation (arrow keys per WAI-ARIA tree pattern) is
 * deferred to a follow-up phase — the current keyboard surface is
 * Tab + Space/Enter on focused chevron / row, which suffices for the
 * Document Generation wizard's "occasional path tweak" use case.
 */
@Component({
    selector: 'cms-directory-picker',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <div class="cms-dirpicker">
            <div class="cms-dirpicker__path">
                <label class="cms-dirpicker__path-label" [for]="pathInputId">Path</label>
                <input
                    type="text"
                    class="cms-dirpicker__path-input"
                    [id]="pathInputId"
                    [ngModel]="pathInputValue()"
                    (ngModelChange)="onPathInputChange($event)"
                    (keydown.enter)="navigateToTypedPath()"
                    placeholder="/path/to/dir"
                    spellcheck="false"
                    autocomplete="off" />
                @if (pathInputError(); as err) {
                    <div class="cms-dirpicker__path-error">{{ err }}</div>
                }
            </div>

            <ul class="cms-dirpicker__tree"
                role="tree"
                [style.height]="height()">
                @for (row of flatRows(); track trackRow($index, row)) {
                    @if (row.kind === 'node') {
                        <li class="cms-dirpicker__row"
                            role="treeitem"
                            [attr.aria-level]="row.depth + 1"
                            [attr.aria-expanded]="row.node.isContainer ? expandedPaths().has(row.node.path) : null"
                            [attr.aria-selected]="value() === row.node.path"
                            [class.cms-dirpicker__row--selected]="value() === row.node.path"
                            [class.cms-dirpicker__row--unselectable]="!isSelectable(row.node)"
                            [class.cms-dirpicker__row--system]="row.node.isSystem || row.node.isHidden"
                            [style.padding-left.px]="rowIndentPx(row.depth)">
                            <button type="button"
                                    class="cms-dirpicker__chevron"
                                    [attr.aria-label]="expandedPaths().has(row.node.path) ? 'Collapse' : 'Expand'"
                                    (click)="onToggle(row.node)">
                                @if (expandedPaths().has(row.node.path)) {
                                    <i class="bi bi-chevron-down"></i>
                                } @else {
                                    <i class="bi bi-chevron-right"></i>
                                }
                            </button>
                            <i class="bi bi-folder cms-dirpicker__icon"></i>
                            <span class="cms-dirpicker__name"
                                  (click)="onSelectNode(row.node)">{{ row.node.name }}</span>
                        </li>
                    } @else if (row.kind === 'loading') {
                        <li class="cms-dirpicker__placeholder"
                            [style.padding-left.px]="rowIndentPx(row.depth)">
                            <i class="bi bi-hourglass-split"></i> Loading…
                        </li>
                    } @else if (row.kind === 'empty') {
                        <li class="cms-dirpicker__placeholder cms-dirpicker__placeholder--muted"
                            [style.padding-left.px]="rowIndentPx(row.depth)">(empty)</li>
                    } @else if (row.kind === 'error') {
                        <li class="cms-dirpicker__placeholder cms-dirpicker__placeholder--error"
                            [style.padding-left.px]="rowIndentPx(row.depth)">
                            <i class="bi bi-exclamation-triangle"></i> {{ row.message }}
                            <button type="button"
                                    class="cms-dirpicker__retry"
                                    (click)="onRetry(row.parentPath)">Retry</button>
                        </li>
                    }
                }
            </ul>

            <div class="cms-dirpicker__footer">
                @if (allowCreate() && canCreateInCurrent()) {
                    @if (newFolderActive()) {
                        <span class="cms-dirpicker__newfolder">
                            <input type="text"
                                   class="cms-dirpicker__newfolder-input"
                                   [ngModel]="newFolderName()"
                                   (ngModelChange)="newFolderName.set($event)"
                                   (keydown.enter)="onCreateFolderConfirm()"
                                   (keydown.escape)="cancelNewFolder()"
                                   placeholder="folder-name"
                                   spellcheck="false"
                                   autocomplete="off"
                                   #newFolderField />
                            <button type="button"
                                    class="cms-dirpicker__newfolder-confirm"
                                    (click)="onCreateFolderConfirm()">OK</button>
                            <button type="button"
                                    class="cms-dirpicker__newfolder-cancel"
                                    (click)="cancelNewFolder()">Cancel</button>
                            @if (newFolderError(); as err) {
                                <span class="cms-dirpicker__newfolder-error">{{ err }}</span>
                            }
                        </span>
                    } @else {
                        <button type="button"
                                class="cms-dirpicker__newfolder-btn"
                                (click)="beginNewFolder()">
                            <i class="bi bi-folder-plus"></i> New folder
                        </button>
                    }
                }
                <label class="cms-dirpicker__hidden-toggle">
                    <input type="checkbox"
                           [ngModel]="showHiddenLocal()"
                           (ngModelChange)="onShowHiddenToggle($event)" />
                    Show hidden
                </label>
            </div>
        </div>
    `,
    styles: [`
        :host { display: block; }
        .cms-dirpicker {
            display: flex;
            flex-direction: column;
            gap: 8px;
            border: 1px solid var(--cms-border, #d1d5db);
            border-radius: var(--cms-radius, 6px);
            background: var(--cms-bg, #ffffff);
            padding: 10px;
            font-size: 0.875rem;
        }
        .cms-dirpicker__path {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .cms-dirpicker__path-label {
            font-size: 0.8125rem;
            font-weight: 600;
            color: var(--cms-text, #111827);
        }
        .cms-dirpicker__path-input {
            width: 100%;
            padding: 6px 10px;
            border: 1px solid var(--cms-border, #d1d5db);
            border-radius: var(--cms-radius, 6px);
            font-family: var(--cms-font-mono, ui-monospace, SFMono-Regular, monospace);
            font-size: 0.8125rem;
            background: var(--cms-bg, #ffffff);
            color: var(--cms-text, #111827);
        }
        .cms-dirpicker__path-input:focus {
            outline: none;
            border-color: var(--cms-accent, #3b82f6);
            box-shadow: 0 0 0 2px var(--cms-accent-light, #dbeafe);
        }
        .cms-dirpicker__path-error {
            font-size: 0.75rem;
            color: var(--cms-danger, #dc2626);
        }
        .cms-dirpicker__tree {
            list-style: none;
            margin: 0;
            padding: 0;
            overflow-y: auto;
            border: 1px solid var(--cms-border-light, #f3f4f6);
            border-radius: var(--cms-radius-sm, 4px);
            background: var(--cms-bg, #ffffff);
        }
        .cms-dirpicker__row {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 3px 8px;
            cursor: pointer;
            color: var(--cms-text, #111827);
        }
        .cms-dirpicker__row:hover { background: var(--cms-bg-muted, #f3f4f6); }
        .cms-dirpicker__row--selected { background: var(--cms-accent-light, #dbeafe); }
        .cms-dirpicker__row--unselectable {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .cms-dirpicker__row--unselectable .cms-dirpicker__name { cursor: not-allowed; }
        .cms-dirpicker__row--system .cms-dirpicker__name {
            color: var(--cms-text-muted, #6b7280);
            font-style: italic;
        }
        .cms-dirpicker__chevron {
            border: none;
            background: transparent;
            cursor: pointer;
            color: var(--cms-text-muted, #6b7280);
            padding: 0 2px;
            line-height: 1;
        }
        .cms-dirpicker__icon { color: var(--cms-accent, #3b82f6); }
        .cms-dirpicker__name {
            flex: 1;
            user-select: none;
        }
        .cms-dirpicker__placeholder {
            padding: 3px 8px;
            font-size: 0.8125rem;
            color: var(--cms-text-muted, #6b7280);
        }
        .cms-dirpicker__placeholder--muted { font-style: italic; }
        .cms-dirpicker__placeholder--error { color: var(--cms-danger, #dc2626); }
        .cms-dirpicker__retry {
            margin-left: 6px;
            border: 1px solid var(--cms-border, #d1d5db);
            background: var(--cms-bg, #ffffff);
            border-radius: var(--cms-radius-sm, 4px);
            padding: 1px 6px;
            font-size: 0.75rem;
            cursor: pointer;
        }
        .cms-dirpicker__footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-wrap: wrap;
        }
        .cms-dirpicker__newfolder-btn {
            border: 1px solid var(--cms-border, #d1d5db);
            background: var(--cms-bg, #ffffff);
            border-radius: var(--cms-radius-sm, 4px);
            padding: 4px 8px;
            font-size: 0.8125rem;
            cursor: pointer;
            color: var(--cms-text, #111827);
        }
        .cms-dirpicker__newfolder-btn:hover { background: var(--cms-bg-muted, #f3f4f6); }
        .cms-dirpicker__newfolder {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .cms-dirpicker__newfolder-input {
            padding: 4px 8px;
            border: 1px solid var(--cms-border, #d1d5db);
            border-radius: var(--cms-radius-sm, 4px);
            font-size: 0.8125rem;
        }
        .cms-dirpicker__newfolder-confirm,
        .cms-dirpicker__newfolder-cancel {
            border: 1px solid var(--cms-border, #d1d5db);
            background: var(--cms-bg, #ffffff);
            border-radius: var(--cms-radius-sm, 4px);
            padding: 2px 8px;
            font-size: 0.75rem;
            cursor: pointer;
        }
        .cms-dirpicker__newfolder-error {
            color: var(--cms-danger, #dc2626);
            font-size: 0.75rem;
            margin-left: 6px;
        }
        .cms-dirpicker__hidden-toggle {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 0.8125rem;
            color: var(--cms-text-muted, #6b7280);
            cursor: pointer;
        }
    `],
})
export class CmsDirectoryPickerComponent {
    /** Tree root path. Defaults to `/`. */
    readonly rootPath = input<string>('/');

    /** Currently selected directory path. Pre-expands ancestors on mount. */
    readonly value = input<string | null>(null);

    /** Initial value of the "Show hidden" toggle. */
    readonly showHidden = input<boolean>(false);

    /** Render the "New folder" affordance + handler. */
    readonly allowCreate = input<boolean>(true);

    /**
     * Per-node selectability predicate. Default policy: must have
     * write permission AND must not be a system / hidden directory.
     * System / hidden dirs are never selectable regardless of this
     * predicate — the picker enforces that as a hard rule.
     */
    readonly selectableWhen = input<DirectorySelectablePredicate>(
        (n: VfsNodeDto) => n.permissions.write,
    );

    /** CSS height applied to the tree pane. */
    readonly height = input<string>('400px');

    /** Emits the selected path each time the user picks a directory. */
    readonly valueChange = output<string>();

    /** Emits the node + path together for callers that need the backend id. */
    readonly nodeChange = output<{ path: string; nodeId: string }>();

    @HostBinding('attr.data-testid') readonly testId = 'cms-directory-picker';

    private readonly vfs = inject(VfsTreeService);
    private readonly destroyRef = inject(DestroyRef);

    /**
     * `path → children`. Each fetch populates this; `flatRows`
     * walks it. Mutated in place where convenient; `signal` wraps it
     * for change-detection notifications.
     */
    protected readonly childrenMap = signal<ReadonlyMap<string, readonly VfsNodeDto[]>>(new Map());
    protected readonly expandedPaths = signal<ReadonlySet<string>>(new Set());
    protected readonly loadingPaths = signal<ReadonlySet<string>>(new Set());
    protected readonly errorMap = signal<ReadonlyMap<string, string>>(new Map());

    /** Mirrors `value()` but tracks user-typed input pre-validation. */
    protected readonly pathInputValue = signal<string>('/');
    protected readonly pathInputError = signal<string | null>(null);

    /** Local toggle (initialised from `showHidden` input, then user-controlled). */
    protected readonly showHiddenLocal = signal<boolean>(false);

    protected readonly newFolderActive = signal<boolean>(false);
    protected readonly newFolderName = signal<string>('');
    protected readonly newFolderError = signal<string | null>(null);

    protected readonly pathInputId = `cms-dirpicker-path-${Math.random().toString(36).slice(2, 8)}`;

    protected readonly flatRows = computed<readonly FlatRow[]>(() => {
        const root = this.rootPath();
        const out: FlatRow[] = [];
        this.appendChildren(out, root, 0);
        return out;
    });

    constructor() {
        // Initial seed from the inputs. Use `untracked` for the
        // signal writes so re-runs only happen when the inputs
        // themselves change (mirrors the Phase 2 ext fix).
        effect(() => {
            const root = this.rootPath();
            const sel = this.value();
            const showHiddenSeed = this.showHidden();

            untracked(() => {
                this.showHiddenLocal.set(showHiddenSeed);
                if (sel !== null) {
                    this.pathInputValue.set(sel);
                } else {
                    this.pathInputValue.set(root);
                }
                this.ensureLoaded(root);
                if (sel !== null && sel !== root) {
                    this.expandAncestors(sel);
                }
            });
        });
    }

    // ─── Template helpers ─────────────────────────────────────────────────────

    protected rowIndentPx(depth: number): number {
        return 4 + depth * 18;
    }

    protected trackRow(_index: number, row: FlatRow): string {
        switch (row.kind) {
            case 'node':    return `n:${row.node.id}`;
            case 'empty':   return `e:${row.parentPath}`;
            case 'loading': return `l:${row.parentPath}`;
            case 'error':   return `r:${row.parentPath}`;
        }
    }

    protected isSelectable(node: VfsNodeDto): boolean {
        // System / hidden dirs are NEVER selectable — that's a hard
        // rule the picker enforces independently of `selectableWhen`.
        if (node.isSystem || node.isHidden) return false;
        if (!node.isContainer) return false;
        return this.selectableWhen()(node);
    }

    protected canCreateInCurrent(): boolean {
        const sel = this.value() ?? this.rootPath();
        const node = this.findNodeByPath(sel);
        if (node === null) {
            // Selection points at the root before we've stat'd it —
            // assume create is allowed; the server returns 403 on
            // actual submit if we're wrong, which the inline error
            // path surfaces.
            return sel === this.rootPath();
        }
        return node.permissions.write && !node.isSystem;
    }

    // ─── User actions ─────────────────────────────────────────────────────────

    protected onToggle(node: VfsNodeDto): void {
        if (!node.isContainer) return;
        const next = new Set(this.expandedPaths());
        if (next.has(node.path)) {
            next.delete(node.path);
        } else {
            next.add(node.path);
            this.ensureLoaded(node.path);
        }
        this.expandedPaths.set(next);
    }

    protected onSelectNode(node: VfsNodeDto): void {
        if (!this.isSelectable(node)) return;
        this.pathInputValue.set(node.path);
        this.pathInputError.set(null);
        this.valueChange.emit(node.path);
        this.nodeChange.emit({ path: node.path, nodeId: node.id });
    }

    protected onPathInputChange(value: string): void {
        this.pathInputValue.set(value);
        this.pathInputError.set(null);
    }

    protected navigateToTypedPath(): void {
        const raw = this.pathInputValue().trim();
        const normalised = this.normalisePath(raw);
        if (!normalised) {
            this.pathInputError.set('Path cannot be empty.');
            return;
        }
        this.vfs.resolvePath(normalised)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((node) => {
                if (node === null || !node.isContainer) {
                    this.pathInputError.set('Path not found or not a directory.');
                    return;
                }
                this.expandAncestors(node.path);
                this.onSelectNode(node);
            });
    }

    protected onShowHiddenToggle(value: boolean): void {
        this.showHiddenLocal.set(value);
        // Invalidate every loaded directory so the next render
        // re-fetches with the new filter. Cheaper to drop the cache
        // than to maintain two parallel caches per directory.
        this.childrenMap.set(new Map());
        this.ensureLoaded(this.rootPath());
        // Re-expand whatever was open so the user doesn't lose
        // context after toggling.
        for (const p of this.expandedPaths()) {
            this.ensureLoaded(p);
        }
    }

    protected onRetry(parentPath: string): void {
        const errs = new Map(this.errorMap());
        errs.delete(parentPath);
        this.errorMap.set(errs);
        this.fetchChildren(parentPath);
    }

    protected beginNewFolder(): void {
        this.newFolderName.set('');
        this.newFolderError.set(null);
        this.newFolderActive.set(true);
    }

    protected cancelNewFolder(): void {
        this.newFolderActive.set(false);
        this.newFolderName.set('');
        this.newFolderError.set(null);
    }

    protected onCreateFolderConfirm(): void {
        const name = this.newFolderName().trim();
        if (name === '') {
            this.newFolderError.set('Folder name is required.');
            return;
        }
        if (name.includes('/') || /^[.\s]/.test(name)) {
            this.newFolderError.set('Invalid folder name.');
            return;
        }
        const parent = this.value() ?? this.rootPath();
        const target = this.joinPath(parent, name);

        this.vfs.createDirectory(target)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (node) => {
                    // Append the new child to parent's children list
                    // optimistically; full refresh would also work
                    // but would collapse other state unnecessarily.
                    this.appendChildOf(parent, node);
                    this.cancelNewFolder();
                    this.onSelectNode(node);
                },
                error: (err: unknown) => {
                    const status = (err as { status?: number } | null)?.status;
                    if (status === 403) {
                        this.newFolderError.set('Permission denied.');
                    } else if (status === 409) {
                        this.newFolderError.set('A folder with that name already exists.');
                    } else {
                        this.newFolderError.set('Failed to create folder.');
                    }
                },
            });
    }

    // ─── Internal cache management ────────────────────────────────────────────

    private appendChildren(out: FlatRow[], parent: string, depth: number): void {
        const children = this.childrenMap().get(parent);
        const isLoading = this.loadingPaths().has(parent);
        const error = this.errorMap().get(parent);

        if (error !== undefined) {
            out.push({ kind: 'error', parentPath: parent, depth, message: error });
            return;
        }
        if (children === undefined) {
            if (isLoading) {
                out.push({ kind: 'loading', parentPath: parent, depth });
            }
            return;
        }
        const visible = children.filter((c) => this.passesHiddenFilter(c));
        if (visible.length === 0) {
            out.push({ kind: 'empty', parentPath: parent, depth });
            return;
        }
        for (const child of visible) {
            out.push({ kind: 'node', node: child, depth });
            if (child.isContainer && this.expandedPaths().has(child.path)) {
                this.appendChildren(out, child.path, depth + 1);
            }
        }
    }

    private passesHiddenFilter(node: VfsNodeDto): boolean {
        if (this.showHiddenLocal()) return true;
        // Hidden / system already labelled server-side; double-check
        // by name prefix as a defence-in-depth against malformed
        // backend responses.
        return !node.isHidden && !node.isSystem
            && !node.name.startsWith('.') && !node.name.startsWith('_');
    }

    private ensureLoaded(path: string): void {
        if (this.childrenMap().has(path)) return;
        if (this.loadingPaths().has(path)) return;
        this.fetchChildren(path);
    }

    private fetchChildren(path: string): void {
        const loading = new Set(this.loadingPaths());
        loading.add(path);
        this.loadingPaths.set(loading);

        this.vfs
            .listChildren(path, { showHidden: this.showHiddenLocal(), limit: 200 })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (page) => {
                    const dirs = page.member.filter((n) => n.type === 'directory' || n.isContainer);
                    const map = new Map(this.childrenMap());
                    map.set(path, dirs);
                    this.childrenMap.set(map);

                    const stillLoading = new Set(this.loadingPaths());
                    stillLoading.delete(path);
                    this.loadingPaths.set(stillLoading);
                },
                error: () => {
                    const errs = new Map(this.errorMap());
                    errs.set(path, 'Failed to load.');
                    this.errorMap.set(errs);

                    const stillLoading = new Set(this.loadingPaths());
                    stillLoading.delete(path);
                    this.loadingPaths.set(stillLoading);
                },
            });
    }

    private expandAncestors(targetPath: string): void {
        const segments = targetPath.split('/').filter((s) => s.length > 0);
        const expanded = new Set(this.expandedPaths());
        let cursor = '';
        for (let i = 0; i < segments.length - 1; i++) {
            cursor = cursor === '' ? '/' + segments[i] : cursor + '/' + segments[i];
            expanded.add(cursor);
            this.ensureLoaded(cursor);
        }
        expanded.add(this.rootPath());
        this.expandedPaths.set(expanded);
    }

    private appendChildOf(parent: string, child: VfsNodeDto): void {
        const existing = this.childrenMap().get(parent) ?? [];
        const merged = [...existing, child].sort((a, b) => a.name.localeCompare(b.name));
        const map = new Map(this.childrenMap());
        map.set(parent, merged);
        this.childrenMap.set(map);

        // Expand the parent so the new child is visible immediately.
        const expanded = new Set(this.expandedPaths());
        expanded.add(parent);
        this.expandedPaths.set(expanded);
    }

    private findNodeByPath(path: string): VfsNodeDto | null {
        for (const children of this.childrenMap().values()) {
            for (const c of children) {
                if (c.path === path) return c;
            }
        }
        return null;
    }

    private normalisePath(raw: string): string {
        if (raw === '') return '';
        // Strip trailing slash unless the path IS the root.
        if (raw.length > 1 && raw.endsWith('/')) return raw.slice(0, -1);
        if (!raw.startsWith('/')) return '/' + raw;
        return raw;
    }

    private joinPath(parent: string, name: string): string {
        return parent === '/' ? '/' + name : parent + '/' + name;
    }
}
