
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import type { VfsNodeDto } from '../../vfs/vfs.types';
import { VfsTreeService } from '../directory-picker/vfs-tree.service';

/** Given a file node, return `true` to allow selecting it. */
export type FileSelectablePredicate = (node: VfsNodeDto) => boolean;

/**
 * Generic VFS **file** picker — the sibling of `<cms-directory-picker>`, which
 * picks the container while this picks what is inside it.
 *
 * ## Why this is not the media picker
 *
 * `<app-media-picker>` is 1700 lines and rightly so: presets, thumbnails, focal
 * points, natural dimensions, hover previews and an upload-to-library tab are
 * all real image concerns. But it is hardcoded to `/media` and built on
 * `MediaService`/`MediaAssetDto`, so "attach a PDF from /docs" cannot be
 * expressed in it — and copying it to make a document picker would duplicate
 * ~1700 lines that then drift.
 *
 * This is the other half of that split: **any file, anywhere the user can read**,
 * with none of the image machinery. It reads the same `VfsTreeService` the
 * directory picker uses, so there is one VFS-browsing seam rather than three.
 * Images keep the media picker; everything else gets this.
 *
 * ## Permissions
 *
 * The listing endpoint is permission-filtered server-side (`canRead` on the
 * container plus traversable ancestors), so a user simply cannot browse into
 * something they may not read — the picker adds no second authority of its own.
 * `selectableWhen` narrows further for callers with an extra rule.
 *
 * ⚠️ That filtering is a UX affordance, NOT the security boundary. Whatever
 * consumes the emitted path must re-check on its own terms — the newsletter
 * attachment path, for instance, is re-read under the sending user at delivery
 * time and dropped if unreadable, precisely because a path chosen at compose
 * time proves nothing about permissions minutes later on a worker.
 */
@Component({
    selector: 'cms-file-picker',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    template: `
        <div class="fp">
            <div class="fp__bar">
                <button type="button" class="cms-btn cms-btn-sm"
                        [disabled]="atRoot()"
                        (click)="goUp()"
                        title="Up one level">
                    <i class="bi bi-arrow-90deg-up"></i>
                </button>
                <nav class="fp__crumbs" aria-label="Location">
                    @for (crumb of crumbs(); track crumb.path; let last = $last) {
                        <button type="button" class="fp__crumb"
                                [disabled]="last"
                                (click)="navigateTo(crumb.path)">{{ crumb.label }}</button>
                        @if (!last) { <span class="fp__sep">/</span> }
                    }
                </nav>
            </div>

            <div class="fp__list" role="listbox" [attr.aria-multiselectable]="multiple()">
                @if (loading()) {
                    <p class="fp__note">Loading…</p>
                } @else if (error()) {
                    <p class="fp__note fp__note--error">{{ error() }}</p>
                } @else if (rows().length === 0) {
                    <p class="fp__note">This folder is empty.</p>
                } @else {
                    @for (node of rows(); track node.path) {
                        @if (isDirectory(node)) {
                            <button type="button" class="fp__row fp__row--dir"
                                    (click)="navigateTo(node.path)">
                                <i class="bi bi-folder2"></i>
                                <span class="fp__name">{{ node.name }}</span>
                                <i class="bi bi-chevron-right fp__chevron"></i>
                            </button>
                        } @else {
                            <button type="button" class="fp__row"
                                    role="option"
                                    [class.fp__row--picked]="isPicked(node.path)"
                                    [attr.aria-selected]="isPicked(node.path)"
                                    [disabled]="!isSelectable(node)"
                                    [title]="node.permissions.read ? node.path
                                             : node.path + ' — you do not have permission to read this file'"
                                    (click)="toggle(node)">
                                <i class="bi"
                                   [class.bi-check-square]="isPicked(node.path)"
                                   [class.bi-lock]="!isPicked(node.path) && !node.permissions.read"
                                   [class.bi-file-earmark]="!isPicked(node.path) && node.permissions.read"></i>
                                <span class="fp__name">{{ node.name }}</span>
                                @if (!node.permissions.read) {
                                    <span class="fp__size">no access</span>
                                } @else {
                                    <span class="fp__size">{{ node.humanSize }}</span>
                                }
                            </button>
                        }
                    }
                    @if (hasMore()) {
                        <button type="button" class="cms-btn cms-btn-sm fp__more"
                                [disabled]="loadingMore()"
                                (click)="loadMore()">
                            {{ loadingMore() ? 'Loading…' : 'Load more' }}
                        </button>
                    }
                }
            </div>
        </div>
    `,
    styles: [`
        .fp { border: 1px solid var(--cms-border, #e5e7eb); border-radius: 6px; overflow: hidden; }
        .fp__bar {
            display: flex; align-items: center; gap: 8px;
            padding: 6px 8px; border-bottom: 1px solid var(--cms-border, #e5e7eb);
            background: var(--cms-surface-alt, #f9fafb);
        }
        .fp__crumbs { display: flex; align-items: center; gap: 2px; overflow-x: auto; font-size: .8125rem; }
        .fp__crumb {
            border: 0; background: transparent; padding: 2px 4px; cursor: pointer; white-space: nowrap;
            color: var(--cms-accent-text, #7C4D00); border-radius: 4px;
        }
        .fp__crumb:disabled { color: var(--cms-text, #374151); cursor: default; font-weight: 600; }
        .fp__crumb:hover:not(:disabled) { background: var(--cms-surface-hover, #f3f4f6); }
        .fp__sep { color: var(--cms-text-muted, #9ca3af); }
        /* Bounded so a large folder scrolls inside the picker instead of pushing
           a hosting dialog's footer off-screen. */
        /*
         * Host-tunable (#1745). The default suits an EMBEDDED picker, where the
         * tree shares a form with other fields and must not dominate it. A host
         * that gives the picker a surface of its own — the file-picker dialog —
         * raises it, instead of wrapping the component in a taller box, which
         * only ever produced dead space below a list that scrolls itself.
         *
         * The min defaults to 0 so an embedded picker still hugs a short folder.
         * A host that sets it EQUAL to the max gets a fixed-size list, which is
         * what a dialog wants: without a floor the window resizes on every
         * navigation, because a folder of 2 entries is shorter than one of 20 —
         * and since the dialog is centred it jumps position as well as height.
         *
         * (No backticks in this comment: the styles block is a JS template
         * literal, and one would end the string mid-CSS.)
         */
        .fp__list {
            min-height: var(--cms-file-picker-list-min-height, 0);
            max-height: var(--cms-file-picker-list-height, 15rem);
            overflow-y: auto;
        }
        .fp__row {
            display: flex; align-items: center; gap: 8px; width: 100%;
            padding: 6px 10px; border: 0; background: transparent; cursor: pointer;
            font-size: .8125rem; text-align: left;
        }
        .fp__row:hover:not(:disabled) { background: var(--cms-surface-hover, #f3f4f6); }
        .fp__row:disabled { opacity: .5; cursor: not-allowed; }
        .fp__row--picked { background: var(--cms-accent-soft, #fff7e6); }
        .fp__name { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fp__size { flex: 0 0 auto; color: var(--cms-text-muted, #6b7280); font-size: .75rem; }
        .fp__chevron { color: var(--cms-text-muted, #9ca3af); font-size: .75rem; }
        .fp__note { margin: 0; padding: 12px 10px; font-size: .8125rem; color: var(--cms-text-muted, #6b7280); }
        .fp__note--error { color: var(--cms-danger, #dc2626); }
        .fp__more { display: block; width: calc(100% - 20px); margin: 6px 10px 10px; }
    `],
})
export class CmsFilePickerComponent {
    private readonly vfs        = inject(VfsTreeService);
    private readonly destroyRef = inject(DestroyRef);

    /** Where browsing starts, and the highest point `goUp()` will climb to. */
    readonly root = input<string>('/');

    /** Selected path(s). Accepts either shape so a single-select host can bind a plain string. */
    readonly value = input<string | readonly string[] | null>(null);

    readonly multiple = input<boolean>(false);

    /**
     * Extra gate on top of the default read check — e.g. a caller that only
     * wants PDFs. Returning false renders the row disabled rather than hiding
     * it, so a user looking for a file they can see but not pick gets an answer
     * instead of a mystery.
     *
     * ⚠️ Composed WITH the read check, never instead of it: a caller supplying
     * a narrower predicate must not accidentally widen selection to files the
     * user cannot read.
     */
    readonly selectableWhen = input<FileSelectablePredicate>(() => true);

    /** Emits `string[]` when `multiple`, otherwise `string | null`. */
    readonly valueChange = output<string | string[] | null>();

    readonly cwd         = signal<string>('/');
    readonly rows        = signal<VfsNodeDto[]>([]);
    readonly loading     = signal(false);
    readonly loadingMore = signal(false);
    readonly error       = signal<string | null>(null);
    readonly hasMore     = signal(false);

    private readonly cursor = signal<string | null>(null);
    private readonly picked = signal<string[]>([]);

    readonly atRoot = computed(() => this.cwd() === this.normalisedRoot());

    readonly crumbs = computed(() => {
        const root = this.normalisedRoot();
        const cwd  = this.cwd();
        const rootLabel = root === '/' ? 'Root' : (root.slice(root.lastIndexOf('/') + 1) || 'Root');
        const out = [{ path: root, label: rootLabel }];

        if (cwd === root) return out;

        // Only the segments BELOW the root are navigable: the root is the
        // boundary a caller set, and offering a crumb above it would hand the
        // user a scope the host deliberately narrowed.
        const rest = cwd.slice(root === '/' ? 1 : root.length + 1);
        let acc = root === '/' ? '' : root;
        for (const seg of rest.split('/').filter(Boolean)) {
            acc = `${acc}/${seg}`;
            out.push({ path: acc, label: seg });
        }

        return out;
    });

    constructor() {
        // Seed from the caller's root, and re-seed if it changes.
        effect(() => {
            const root = this.normalisedRoot();
            untracked(() => {
                this.cwd.set(root);
                this.load(root);
            });
        });

        // Mirror the bound value into local selection state. Normalised to an
        // array so `multiple` is the only thing that decides the EMIT shape.
        effect(() => {
            const v = this.value();
            const list = v === null || v === undefined ? [] : (Array.isArray(v) ? [...v] : [v as string]);
            untracked(() => this.picked.set(list.filter(p => p !== '')));
        });
    }

    isDirectory(node: VfsNodeDto): boolean {
        // `package` is a directory-shaped container (a Content page); treat it
        // as navigable rather than selectable — its VARIANTS are the real files.
        return node.type === 'directory' || node.type === 'package';
    }

    /**
     * A file is pickable only if the caller can actually READ it.
     *
     * ⚠️ Listing and reading are different permissions — correctly so, and this
     * is the trap. Unix `ls` shows a directory's entries whether or not you can
     * open each one, and the VFS listing endpoint faithfully does the same: it
     * checks `r` on the CONTAINER, then returns every child with a per-node
     * `permissions.read` flag. So a 0600 file owned by someone else appears in
     * the list with `read: false`.
     *
     * Without this check the picker would happily let an admin choose that file,
     * and the consumer would drop it later — for newsletter attachments, an
     * email that quietly goes out with nothing attached. Disabling the row says
     * so at the moment of choosing instead.
     */
    isSelectable(node: VfsNodeDto): boolean {
        return node.permissions.read && this.selectableWhen()(node);
    }

    isPicked(path: string): boolean {
        return this.picked().includes(path);
    }

    navigateTo(path: string): void {
        this.cwd.set(path);
        this.load(path);
    }

    goUp(): void {
        const cwd = this.cwd();
        const parent = cwd.slice(0, cwd.lastIndexOf('/')) || '/';
        this.navigateTo(parent.length < this.normalisedRoot().length ? this.normalisedRoot() : parent);
    }

    toggle(node: VfsNodeDto): void {
        if (!this.isSelectable(node)) return;

        if (!this.multiple()) {
            const next = this.isPicked(node.path) ? null : node.path;
            this.picked.set(next === null ? [] : [next]);
            this.valueChange.emit(next);

            return;
        }

        this.picked.update(list => list.includes(node.path)
            ? list.filter(p => p !== node.path)
            : [...list, node.path]);
        this.valueChange.emit([...this.picked()]);
    }

    loadMore(): void {
        const cursor = this.cursor();
        if (cursor === null) return;

        this.loadingMore.set(true);
        this.vfs.listChildren(this.cwd(), { limit: 100, cursor })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: page => {
                    this.rows.update(rows => [...rows, ...page.member]);
                    this.hasMore.set(page.hasMore);
                    this.cursor.set(page.nextCursor);
                    this.loadingMore.set(false);
                },
                error: () => {
                    // Keep what is already listed: a failed NEXT page should not
                    // blank the rows the user is looking at.
                    this.hasMore.set(false);
                    this.loadingMore.set(false);
                },
            });
    }

    private load(path: string): void {
        this.loading.set(true);
        this.error.set(null);
        this.vfs.listChildren(path, { limit: 100 })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: page => {
                    // Directories first, then files, each alphabetical — the
                    // order every file manager uses, and the backend returns
                    // name-ordered regardless of type.
                    this.rows.set([...page.member].sort((a, b) => {
                        const ad = this.isDirectory(a) ? 0 : 1;
                        const bd = this.isDirectory(b) ? 0 : 1;

                        return ad !== bd ? ad - bd : a.name.localeCompare(b.name);
                    }));
                    this.hasMore.set(page.hasMore);
                    this.cursor.set(page.nextCursor);
                    this.loading.set(false);
                },
                error: () => {
                    this.rows.set([]);
                    this.hasMore.set(false);
                    this.error.set('This folder could not be opened.');
                    this.loading.set(false);
                },
            });
    }

    private normalisedRoot(): string {
        const r = this.root().trim();
        if (r === '' || r === '/') return '/';

        return r.endsWith('/') ? r.slice(0, -1) : r;
    }
}
