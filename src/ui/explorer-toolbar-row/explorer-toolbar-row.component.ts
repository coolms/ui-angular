import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    ElementRef,
    HostListener,
    inject,
    input,
    output,
    signal,
    ViewChild,
} from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';

/**
 * One row in a server-resolved breadcrumb chain. Matches the
 * `BreadcrumbSegment` PHP DTO returned by `/api/v1/vfs/breadcrumb`.
 */
interface BreadcrumbSegmentDto {
    readonly label:     string;
    readonly path:      string;
    readonly clickable: boolean;
}

interface BreadcrumbResponseDto {
    readonly segments: readonly BreadcrumbSegmentDto[];
}

/**
 * Segment-by-segment breadcrumb for explorer-style pages
 * (Media Library, Document Library, VFS File Manager).
 *
 * Renders the absolute VFS path as a sequence of clickable segments,
 * Norton Commander / Total Commander / Finder-style. Segments are
 * fetched from `GET /api/v1/vfs/breadcrumb?path={path}` so labels can
 * use the server's `Node.title` (e.g. "Documents" for `/docs`, the
 * site label for `/content/{slug}`, the user's display name for
 * `/home/{uuid}`) instead of raw path tokens.
 *
 * The endpoint also gates clickability per-ancestor by VFS ACL: a
 * segment the caller cannot read is rendered as plain text (not a
 * button) so the user sees the chain but can't navigate past their
 * permission scope.
 *
 * Optional click-to-edit input mode (gated by the `editable` input):
 * clicking the empty space after the segments swaps the breadcrumb for
 * a monospace text input pre-filled with the current path. Enter
 * submits (emits `navigate`); Escape or any click outside cancels.
 *
 * Right-side controls (search, view-mode buttons, …) are
 * content-projected via the default `<ng-content>` slot so the row
 * keeps the file-manager-row look across all three explorer pages.
 */
@Component({
    selector: 'app-explorer-toolbar-row',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="explorer-toolbar-row">
            <div class="explorer-toolbar-row__path">
                @if (!editing()) {
                    <nav class="path-segments" aria-label="Path">
                        @for (seg of displaySegments(); track seg.path; let i = $index; let last = $last) {
                            @if (last) {
                                <span class="seg seg--current" [title]="seg.path">{{ seg.label }}</span>
                            } @else if (isAboveFloor(seg)) {
                                <span class="seg seg--static" [title]="seg.path">{{ seg.label }}</span>
                                <span class="seg-sep" aria-hidden="true">/</span>
                            } @else if (!seg.clickable) {
                                <span class="seg seg--locked" [title]="seg.path + ' (no permission)'">{{ seg.label }}</span>
                                <span class="seg-sep" aria-hidden="true">/</span>
                            } @else {
                                <button type="button" class="seg"
                                        [title]="seg.path"
                                        (click)="onSegmentClick(seg.path)">
                                    {{ seg.label }}
                                </button>
                                <span class="seg-sep" aria-hidden="true">/</span>
                            }
                        }
                    </nav>
                    @if (editable()) {
                        <button type="button"
                                class="path-edit-trigger"
                                title="Click to type a path"
                                aria-label="Edit path"
                                (click)="beginEdit()">
                            <span class="path-edit-trigger__cursor"></span>
                        </button>
                    }
                } @else {
                    <input #pathInput
                           type="text"
                           class="path-input"
                           spellcheck="false"
                           autocomplete="off"
                           autocapitalize="off"
                           [value]="editValue()"
                           (input)="editValue.set($any($event.target).value)"
                           (keydown.enter)="commitEdit()"
                           (keydown.escape)="cancelEdit()"
                           (blur)="onBlur()" />
                }
            </div>

            <div class="explorer-toolbar-row__controls">
                <ng-content />
            </div>
        </div>
    `,
    styles: [`
        :host {
            /* Above-grid band: thin separator from the file grid below
               with a hint of contrast against the grid area. Sticky so
               the breadcrumb stays visible as the grid scrolls. The
               toolbar slot that previously held this row is gone, so
               applying band styling unconditionally is simpler than
               toggling via an input flag.

               Padding matches the accordion section header's 6px 8px
               so the breadcrumb band reads as visually aligned with the
               sibling spaces accordion on the left rail. */
            display: block;
            position: sticky;
            top: 0;
            z-index: 2;
            background: var(--cms-surface-alt, var(--cms-surface));
            border-bottom: 1px solid var(--cms-border-light);
            padding: 6px 8px;
        }

        .explorer-toolbar-row {
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 14px;
            font-family: var(--cms-font-mono, monospace);
        }

        .explorer-toolbar-row__path {
            display: flex;
            align-items: center;
            flex: 1 1 auto;
            min-width: 0;
            gap: 1px;
            overflow: hidden;
        }

        .explorer-toolbar-row__controls {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
        }

        /* Segment row */
        .path-segments {
            display: flex;
            align-items: center;
            gap: 1px;
            min-width: 0;
            overflow: hidden;
            white-space: nowrap;
            flex-shrink: 1;
        }

        .seg {
            background: none;
            border: none;
            padding: 2px 6px;
            border-radius: var(--cms-radius-sm);
            color: var(--cms-text-secondary);
            cursor: pointer;
            font: inherit;
            font-size: .8125rem;
            line-height: 1.4;
            transition: color .1s, background .1s;
            white-space: nowrap;
            text-overflow: ellipsis;
            overflow: hidden;
            max-width: 240px;
        }
        .seg:hover {
            color: var(--cms-text);
            background: var(--cms-border-light);
        }
        .seg:focus-visible {
            outline: 2px solid var(--cms-accent);
            outline-offset: 1px;
        }

        .seg--current {
            color: var(--cms-text);
            font-weight: 600;
            padding: 2px 6px;
            cursor: default;
            max-width: 320px;
            text-overflow: ellipsis;
            overflow: hidden;
        }

        /* Non-clickable mid-chain segment — shown when the user lacks
           read permission on that ancestor. Plain text, no hover state. */
        .seg--locked {
            color: var(--cms-text-muted);
            padding: 2px 6px;
            cursor: not-allowed;
            font-style: italic;
            max-width: 240px;
            text-overflow: ellipsis;
            overflow: hidden;
        }
        /* Context, not a destination — a real location the host simply
           does not browse to. Muted like the locked state but upright
           and with a default cursor: nothing is denied here, there is
           just nowhere to go. */
        .seg--static {
            color: var(--cms-text-muted);
            padding: 2px 6px;
            max-width: 240px;
            text-overflow: ellipsis;
            overflow: hidden;
        }

        .seg-sep {
            color: var(--cms-text-muted);
            font-size: .8125rem;
            user-select: none;
            padding: 0 1px;
        }

        /* Click-to-edit trigger: invisible but absorbs clicks on
           empty space after the segments, like an address bar. */
        .path-edit-trigger {
            flex: 1 1 auto;
            min-width: 16px;
            height: 24px;
            background: transparent;
            border: 1px solid transparent;
            border-radius: var(--cms-radius-sm);
            cursor: text;
            padding: 0;
            display: flex;
            align-items: center;
            transition: border-color .1s, background .1s;
        }
        .path-edit-trigger:hover {
            border-color: var(--cms-border);
            background: var(--cms-surface);
        }
        .path-edit-trigger__cursor {
            display: inline-block;
            width: 1px;
            height: 14px;
            background: var(--cms-text-muted);
            margin-left: 4px;
            opacity: 0;
        }
        .path-edit-trigger:hover .path-edit-trigger__cursor { opacity: .6; }

        .path-input {
            flex: 1 1 auto;
            min-width: 0;
            font: inherit;
            font-size: .8125rem;
            padding: 4px 8px;
            border: 1px solid var(--cms-accent);
            border-radius: var(--cms-radius-sm);
            background: var(--cms-surface);
            color: var(--cms-text);
            outline: none;
        }
    `],
})
export class ExplorerToolbarRowComponent {
    /**
     * Absolute VFS path to display, e.g. `/content/default/pages` or
     * `/home/{uuid}/media`. Empty / `'/'` renders as the root segment
     * with no trailing pieces.
     */
    readonly path = input.required<string>();

    /**
     * Whether the click-to-edit input mode is enabled. Defaults to
     * true; the three explorer pages all want it. Set to false to
     * lock the row into segment-only mode (no address-bar behaviour).
     */
    readonly editable = input<boolean>(true);

    /**
     * Display names for path segments the host wants shown under a
     * friendlier name than the directory carries on disk, keyed by the
     * segment's own name (its last path part).
     *
     * Kept generic — the host supplies the vocabulary. Documents passes
     * `{'.templates': 'Templates'}` so its breadcrumb reads
     * `Root / Documents / Templates` while the path it navigates by
     * stays the real `<space>/.templates`. Renaming the
     * directory itself was not an option: `.templates` is a security
     * gate, not a naming convention — `TemplateRootResolver` decides
     * "is this Node a template?" from that exact segment.
     *
     * Applied AFTER server resolution, so it also wins over a
     * `Node.title` — the override is the host's explicit intent.
     */
    readonly labelOverrides = input<Readonly<Record<string, string>>>({});

    /**
     * Shallowest path the host is willing to navigate to. Segments
     * ABOVE it still render — they are the real chain and the user
     * should see where they are — but as plain text rather than links.
     *
     * Documents passes the current space root: `/`, `/home` and
     * `/home/{uuid}` are genuine ancestors of a personal docs folder,
     * yet the module has no view for any of them. Left clickable they
     * emitted a path outside every space, which the host then treated
     * as a space — the breadcrumb read `Root / Templates` and the pane
     * listed nothing.
     *
     * `null` (default) keeps the whole chain navigable.
     */
    readonly navigableFrom = input<string | null>(null);

    /** Emit when a segment is clicked or an edited path is submitted. */
    readonly navigate = output<string>();

    @ViewChild('pathInput')
    private readonly inputRef?: ElementRef<HTMLInputElement>;

    /** Edit-mode flag. */
    protected readonly editing = signal(false);

    /** Working value inside the input while editing. */
    protected readonly editValue = signal('');

    /**
     * Segments returned by the breadcrumb endpoint. Until the first
     * fetch resolves we render a synthetic root + last-segment pair
     * derived from the raw path so the row never flashes empty during
     * navigation -- the server response replaces this when it lands.
     */
    /**
     * Resolved segments, keyed by absolute path, shared by every instance and
     * surviving component teardown.
     *
     * It has to be static. Component-local memory is wiped when the explorer
     * remounts on navigation, which is exactly when the placeholder is needed:
     * the instance rebuilding the breadcrumb is often not the one that had
     * already resolved those labels. A path->label mapping is stable for the
     * lifetime of the page, so caching it app-wide is safe; a rename is
     * followed by a fresh request that overwrites the entry.
     */
    private static readonly labelCache = new Map<string, BreadcrumbSegmentDto>();

    /**
     * True when this segment is a strict ancestor of `navigableFrom`,
     * i.e. above the floor the host will navigate to.
     */
    protected isAboveFloor(seg: BreadcrumbSegmentDto): boolean {
        return this.isPathAboveFloor(seg.path);
    }

    /**
     * The floor rule itself, by PATH — shared by the breadcrumb segments and
     * the typed-path input so the two cannot disagree about what is
     * reachable. A rule the display enforces and the input does not is worse
     * than no rule: it looks like a guarantee.
     */
    private isPathAboveFloor(path: string): boolean {
        const floor = this.navigableFrom();
        if (null === floor || '' === floor) {
            return false;
        }
        const normalised = this.normalizePath(floor);
        if ('/' === normalised) {
            // Everything is at or below `/`; nothing is above it.
            return false;
        }
        const target = this.normalizePath(path);

        return target !== normalised && !target.startsWith(normalised + '/');
    }

    protected readonly segments = signal<readonly BreadcrumbSegmentDto[]>(this.fallbackSegments('/'));

    /**
     * What the template renders: resolved segments with the host's
     * display names applied. Kept separate from `segments` so the
     * override never reaches the label cache or the edit-mode value —
     * the path the user types and navigates by is always the real one.
     */
    protected readonly displaySegments = computed<readonly BreadcrumbSegmentDto[]>(() => {
        const overrides = this.labelOverrides();
        const segs = this.segments();
        if (0 === Object.keys(overrides).length) {
            return segs;
        }

        return segs.map((seg) => {
            const name = seg.path.slice(seg.path.lastIndexOf('/') + 1);
            const override = overrides[name];

            return override === undefined ? seg : { ...seg, label: override };
        });
    });

    private readonly http       = inject(HttpClient);
    private readonly destroyRef = inject(DestroyRef);

    /** Most recent request signature, for de-duping in-flight effects. */
    private readonly pathSubject = signal<string>('/');

    constructor() {
        // Refire the request whenever the input path changes. Effects
        // run inside the injector so we keep the OnPush change-detection
        // contract -- segments() update lands in the same tick.
        effect(() => {
            const p = this.normalizePath(this.path());
            this.pathSubject.set(p);
            this.segments.set(this.placeholderSegments(p));
        });

        // Reactive HTTP pipeline -- `toObservable(this.pathSubject)`
        // is unavailable here without injecting the conversion function,
        // so we use a subject-style read instead.
        // Effect re-subscribes whenever pathSubject changes.
        effect((onCleanup) => {
            const p = this.pathSubject();
            const params = new HttpParams().set('path', p);
            const sub = this.http
                .get<BreadcrumbResponseDto>('/api/v1/vfs/breadcrumb', { params })
                .pipe(
                    catchError((err: HttpErrorResponse) => {
                        // 404 / 403 / 422 — fall back to the path-derived
                        // synthetic chain so the row stays useful even when
                        // the user navigates into a directory the server
                        // refuses to enumerate.
                        return of<BreadcrumbResponseDto>({ segments: this.fallbackSegments(p) });
                    }),
                    switchMap((res) => of(res)),
                    takeUntilDestroyed(this.destroyRef),
                )
                .subscribe((res) => {
                    const resolved = res.segments ?? [];

                    // Remember every resolved label BEFORE the staleness check:
                    // a response that lost the race still carries labels that
                    // are correct for their own paths, and the next navigation
                    // (or the next mount) can reuse them.
                    for (const seg of resolved) {
                        ExplorerToolbarRowComponent.labelCache.set(seg.path, seg);
                    }

                    if (p === this.pathSubject()) {
                        this.segments.set(resolved);
                    }
                });
            onCleanup(() => sub.unsubscribe());
        });
    }

    /** Segment click — emit absolute path. */
    protected onSegmentClick(target: string): void {
        // Don't emit if the user clicked the segment that's already current.
        if (target === this.normalizePath(this.path())) return;
        this.navigate.emit(target);
    }

    /** Switch from segment view to text-input mode. */
    protected beginEdit(): void {
        if (!this.editable()) return;
        this.editValue.set(this.path() || '/');
        this.editing.set(true);
        // Focus the input on the next microtask so the @if branch has rendered.
        queueMicrotask(() => {
            const el = this.inputRef?.nativeElement;
            if (el) {
                el.focus();
                el.select();
            }
        });
    }

    /**
     * Submit the typed path. Normalises trailing slashes; empty -> '/'.
     *
     * Honours `navigableFrom`. The breadcrumb has always disabled
     * segments above the floor, but the text input emitted whatever was typed
     * — so an operator could leave the space root by hand and land in a tree
     * the explorer around them does not describe. Typing `/` in Documents took
     * you above `/docs` while the space accordion still said Shared.
     *
     * An out-of-bounds path is REFUSED, not clamped to the floor: clamping
     * would navigate somewhere the operator did not ask for. Refusing matches
     * the disabled breadcrumb segment exactly — the target is unreachable —
     * and restoring the segment view shows the path never changed.
     */
    protected commitEdit(): void {
        const raw = this.editValue().trim();
        const normalised = raw === '' ? '/' : raw.replace(/\/+$/, '') || '/';
        this.editing.set(false);
        if (this.isPathAboveFloor(normalised)) {
            return;
        }
        if (normalised !== this.normalizePath(this.path())) {
            this.navigate.emit(normalised);
        }
    }

    /** Abandon the edit, restore segment view. */
    protected cancelEdit(): void {
        this.editing.set(false);
    }

    /**
     * Blur handler — commit on focus loss so the user can click away
     * to navigate instead of having to press Enter. Pairs with the
     * keydown.escape handler which sets editing=false before blur,
     * so Esc never accidentally commits.
     */
    protected onBlur(): void {
        if (this.editing()) {
            this.commitEdit();
        }
    }

    /**
     * Document-level click handler: if the user clicks anywhere
     * outside this component while editing, cancel the edit.
     * The blur handler covers the focus path; this covers cases
     * where the input never lost focus (e.g. clicks on disabled
     * regions). Bound on document so we don't miss clicks on
     * sibling overlays.
     */
    @HostListener('document:mousedown', ['$event'])
    onDocumentMouseDown(event: MouseEvent): void {
        if (!this.editing()) return;
        const target = event.target as Node | null;
        if (!target) return;
        const inputEl = this.inputRef?.nativeElement;
        if (inputEl && (inputEl === target || inputEl.contains(target))) return;
        // Click outside the input — let the blur handler commit.
    }

    /**
     * Path-derived chain used while the server response is in flight
     * AND as the fallback on 4xx errors. The labels here are raw
     * segment names; the server response replaces them with `Node.title`
     * resolved labels as soon as it arrives.
     */
    /**
     * The chain to show WHILE the breadcrumb request is in flight.
     *
     * Never discard a label already resolved. The raw path-derived chain is a
     * last resort: for `/home/{uuid}` its label is the bare UUID, and for
     * `/home` it is lowercase "home" rather than the titled "Home" — so
     * resetting to it made every navigation flash the raw path before the
     * response landed.
     *
     * MUST NOT read the `segments` signal. This runs inside an effect that
     * WRITES `segments`; reading it there makes the effect depend on its own
     * output, so every write retriggers the effect — an infinite loop that
     * hangs the browser tab. (It did, in two earlier drafts of this method.)
     * The static cache is a plain Map, not a signal, so consulting it creates
     * no dependency.
     */
    private placeholderSegments(path: string): readonly BreadcrumbSegmentDto[] {
        return this.fallbackSegments(path).map(
            seg => ExplorerToolbarRowComponent.labelCache.get(seg.path) ?? seg,
        );
    }

    private fallbackSegments(path: string): readonly BreadcrumbSegmentDto[] {
        const normalised = this.normalizePath(path);
        const out: BreadcrumbSegmentDto[] = [{ label: 'Root', path: '/', clickable: true }];
        if (normalised === '/') return out;
        const parts = normalised.slice(1).split('/');
        let built = '';
        for (const part of parts) {
            built += '/' + part;
            out.push({ label: part, path: built, clickable: true });
        }
        return out;
    }

    private normalizePath(raw: string): string {
        const trimmed = (raw && raw.length > 0 ? raw : '/').replace(/\/+$/, '');
        return trimmed === '' ? '/' : trimmed;
    }
}
