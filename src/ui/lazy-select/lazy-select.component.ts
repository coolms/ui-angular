import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    HostListener,
    OnInit,
    ViewChild,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { CmsLoaderComponent } from '@coolms/core-angular';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngxs/store';
import { AuthState } from '@coolms/core-angular';
/**
 * One option row rendered in the dropdown.
 *
 * `extras` is opaque — callers may stash the original row there if they
 * need it back later (e.g. on select, to look up secondary properties).
 */
export interface LazySelectOption {
    readonly id:     string;
    readonly label:  string;
    /**
     * Optional section header. When any visible option carries a
     * non-null `group` value, the dropdown renders sticky group
     * headers (Bootstrap-styled) above each bucket. Ungrouped
     * options accumulate under `null` and render without a header.
     */
    readonly group?: string | null;
    readonly extras?: Readonly<Record<string, unknown>>;
}

/**
 * Async loader contract used by the server-search mode. Implementations
 * should return the next page of options for the given query (empty
 * string means "no query — give me the head of the list").
 */
export type LazySelectLoader = (query: string, limit: number) => Observable<{
    items: readonly LazySelectOption[];
    /** Total matching rows; falls back to items.length when unknown. */
    total?: number;
}>;

/** RQL `cn` filter style (`?filter=field cn "query"`) vs simple `?q=` style. */
export type LazySelectSearchStyle = 'rql' | 'q';

/**
 * Generic lazy-loading select with debounced search.
 *
 * Two operating modes:
 *
 *  1. **Server-search** — provide either `apiUrl` (the component builds
 *     its own loader using `searchStyle` + `searchField`) or a fully
 *     custom `loader` function. The dropdown debounces typing 300ms,
 *     then fires the loader. The currently-selected `value` is fetched
 *     individually via `GET {apiUrl}/{id}` so the trigger always shows
 *     the correct label even when the selected row isn't on the first
 *     page (only applies when `apiUrl` is set — for custom loaders,
 *     pass the option in `preloadedSelection` instead).
 *
 *  2. **Client-side** — pass a static `options` array. The search box
 *     filters the list in-memory (case-insensitive substring on
 *     `label`). No network at all. Useful when the caller already has
 *     the full list (e.g. a parent component prefetched it) or for
 *     small enums.
 *
 * Both modes share the same trigger UI: a button-styled wrapper that,
 * when clicked, opens a `position: fixed` dropdown anchored to the
 * trigger (so it escapes any `overflow: hidden` ancestor — same trick
 * as the original `UserSearchSelectComponent`).
 *
 * Styling notes:
 *  - Trigger height ~ 32px to match Bootstrap small form controls.
 *  - Dropdown max-height 240px; the list scrolls internally.
 *  - Selected row is marked with a checkmark + bold.
 *  - "Showing X of Y" hint surfaces when the loader reports a `total`
 *    exceeding what we've rendered (server mode only).
 *
 * Reusability:
 *  - `UserSearchSelectComponent` is now a thin adapter that picks
 *    `apiUrl + searchStyle:'rql' + searchField:'identifier'` and the
 *    user-specific label fallback chain.
 *  - Calendar selectors pass `searchField:'title'` (or use the static
 *    `options` mode when they've already fetched the list).
 *
 * See task for the full ship plan.
 */
@Component({
    selector: 'app-lazy-select',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CmsLoaderComponent, ReactiveFormsModule],
    template: `
        <div class="lzs-trigger" #wrapper (click)="toggleOpen()">
            @if (selectedOption()) {
                <span class="lzs-value">{{ selectedOption()!.label }}</span>
            } @else {
                <span class="lzs-placeholder">{{ placeholder() }}</span>
            }
            @if (allowClear() && value()) {
                <button type="button" class="lzs-clear" (click)="clear($event)" title="Clear">
                    <i class="bi bi-x"></i>
                </button>
            }
            <i class="bi bi-chevron-down lzs-chevron" [class.lzs-chevron--open]="isOpen()"></i>
        </div>

        @if (isOpen()) {
            <div class="lzs-dropdown"
                 #dropPanel
                 [style.top.px]="dropTop()"
                 [style.left.px]="dropLeft()"
                 [style.width.px]="dropWidth()">

                <div class="lzs-search-wrap">
                    <input #searchInput
                           type="text"
                           class="lzs-search"
                           [placeholder]="'Search ' + entityLabel() + '…'"
                           [formControl]="searchControl"
                           (keydown.escape)="close()" />
                </div>

                @if (loading()) {
                    <div class="lzs-message">
                        <cms-loader [inline]="true" />
                        Searching…
                    </div>
                }

                @if (!loading()) {
                    <div class="lzs-list">
                        @if (filteredOptions().length === 0) {
                            <div class="lzs-message">No results</div>
                        }
                        @for (group of groupedOptions(); track group.name) {
                            @if (group.name !== null) {
                                <div class="lzs-group-header">{{ group.name }}</div>
                            }
                            @for (opt of group.rows; track opt.id) {
                                <button type="button"
                                        class="lzs-option"
                                        [class.lzs-option--selected]="opt.id === value()"
                                        (click)="selectOption(opt)">
                                    @if (opt.id === value()) {
                                        <i class="bi bi-check2"></i>
                                    }
                                    {{ opt.label }}
                                </button>
                            }
                        }
                    </div>
                }

                @if (!loading() && totalCount() > filteredOptions().length) {
                    <div class="lzs-hint">
                        Showing {{ filteredOptions().length }} of {{ totalCount() }} — type to search
                    </div>
                }
            </div>
        }
    `,
    styles: [`
        :host { display: block; }

        .lzs-trigger {
            display: flex; align-items: center; gap: 6px;
            padding: 5px 10px;
            border: 1px solid var(--cms-btn-border, #d1d5db);
            border-radius: var(--cms-radius, 4px);
            background: var(--cms-surface);
            cursor: pointer;
            font-size: .8125rem;
            color: var(--cms-text, #111827);
            min-height: 32px;
            transition: border-color .1s;
            user-select: none;
            &:hover { border-color: var(--cms-btn-hover-border, #9ca3af); }
        }
        .lzs-value       { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .lzs-placeholder { flex: 1; color: var(--cms-text-muted, #848b96); }
        .lzs-clear {
            display: inline-flex; align-items: center; justify-content: center;
            width: 18px; height: 18px;
            border: 0; background: transparent;
            color: var(--cms-text-muted, #848b96);
            cursor: pointer; padding: 0;
            border-radius: 2px;
            font-size: .75rem;
            flex-shrink: 0;
            &:hover { background: var(--cms-border-light, #f0f2f5); color: var(--cms-text, #111827); }
        }
        .lzs-chevron   { font-size: .625rem; color: var(--cms-text-secondary, #6b7280); flex-shrink: 0; transition: transform .15s; }
        .lzs-chevron--open { transform: rotate(180deg); }

        .lzs-dropdown {
            position: fixed;
            z-index: 1200;
            background: var(--cms-surface);
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius, 4px);
            box-shadow: var(--cms-shadow-md, 0 4px 12px rgba(0,0,0,.12));
            display: flex;
            flex-direction: column;
            max-height: 280px;
            overflow: hidden;
        }
        .lzs-search-wrap {
            padding: 6px 8px;
            border-bottom: 1px solid var(--cms-border, #e5e7eb);
            flex-shrink: 0;
        }
        .lzs-search {
            width: 100%; border: 1px solid var(--cms-btn-border, #d1d5db);
            border-radius: var(--cms-radius-sm, 3px); padding: 4px 8px;
            font-size: .8125rem; outline: none;
            &:focus { border-color: var(--cms-accent, #F5A623); box-shadow: 0 0 0 2px var(--cms-accent-light, #FEF7E6); }
        }
        .lzs-list { flex: 1; overflow-y: auto; }
        .lzs-group-header {
            padding: 4px 12px 2px;
            font-size: .65rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: .04em;
            color: var(--cms-text-muted, #848b96);
            background: var(--cms-border-light, #f0f2f5);
            border-top: 1px solid var(--cms-border, #e5e7eb);
            border-bottom: 1px solid var(--cms-border, #e5e7eb);
            position: sticky;
            top: 0;
            z-index: 1;
        }
        .lzs-group-header:first-child { border-top: 0; }
        .lzs-option {
            display: flex; align-items: center; gap: 6px;
            width: 100%; padding: 7px 12px;
            background: none; border: none; text-align: left;
            font-size: .8125rem; color: var(--cms-text, #111827);
            cursor: pointer; transition: background .1s;
            .bi { font-size: .75rem; color: var(--cms-accent, #F5A623); }
            &:hover { background: var(--cms-border-light, #f0f2f5); }
        }
        .lzs-option--selected { font-weight: 500; }
        .lzs-message {
            padding: 12px; text-align: center;
            font-size: .8125rem; color: var(--cms-text-muted, #848b96);
            display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .lzs-hint {
            padding: 4px 12px; font-size: .7rem;
            color: var(--cms-text-muted, #848b96); border-top: 1px solid var(--cms-border, #e5e7eb);
            flex-shrink: 0;
        }
    `],
})
export class LazySelectComponent implements OnInit {
    // --- Inputs ------------------------------------------------------

    /** Currently-selected option id. Empty string = nothing selected. */
    value = input<string>('');

    /** Placeholder for the trigger when nothing is selected. */
    placeholder = input<string>('— Select —');

    /** Human label used in the search box placeholder ("Search calendar…"). */
    entityLabel = input<string>('option');

    /** Render an "x" inside the trigger that resets the selection. */
    allowClear = input<boolean>(false);

    /** How many rows to request per page (server mode). */
    pageSize = input<number>(50);

    // --- Server-search mode ------------------------------------------

    /**
     * REST collection endpoint. When set, the component builds its own
     * loader using {@link searchStyle} + {@link searchField}.
     */
    apiUrl = input<string | null>(null);

    /** Query-param style for the built-in loader. */
    searchStyle = input<LazySelectSearchStyle>('rql');

    /** RQL field name targeted by the `cn` filter (server mode, RQL style). */
    searchField = input<string>('title');

    /**
     * Optional extra RQL filter clause, AND-combined with the search filter
     * and applied even when the search box is empty. E.g. `'isSystem eq false'`
     * to hide platform system users from a user picker. Sent as an additional
     * `filter=` query param (the backend reads the raw query string and
     * AND-combines repeated `filter` clauses), so the backend's grid config
     * MUST whitelist the field. RQL-style endpoints only (ignored for `q`
     * style). Static; not re-read reactively.
     */
    extraFilter = input<string | null>(null);

    /**
     * Field on each API row treated as the wire-format identifier
     * (server mode). Defaults to `id` for resource-style endpoints;
     * OptionSource endpoints (`/api/v1/options/{source}`) use
     * `value` since they're not relational and don't carry an
     * `id`. The trigger and the form model both bind to this token.
     */
    valueKey = input<string>('id');

    /**
     * Field on each API row used as the section header. Set to e.g.
     * `'group'` when consuming an OptionSource endpoint that buckets
     * its rows by region (timezones), so the dropdown renders sticky
     * group headers. Omit (default) to skip grouping.
     */
    groupKey = input<string | null>(null);

    /**
     * Ordered list of fields probed on each result row to derive the
     * display label. First non-empty wins. Defaults to a sensible
     * fallback chain covering the most common entity shapes.
     */
    labelKeys = input<readonly string[]>(['label', 'name', 'title', 'fullName', 'identifier', 'slug']);

    /**
     * Optional fully custom loader. Takes precedence over `apiUrl`.
     * Useful when the data source isn't a Hydra collection or needs
     * client-side post-filtering.
     */
    loader = input<LazySelectLoader | null>(null);

    // --- Client-side mode --------------------------------------------

    /**
     * Static option list. Used when neither `apiUrl` nor `loader` is
     * set. The search input then filters this list by substring on
     * label (case-insensitive).
     */
    options = input<readonly LazySelectOption[]>([]);

    /**
     * Optional preloaded selection — guarantees the trigger label is
     * known even before the dropdown is opened. Useful in custom
     * loader mode where the component can't fetch by id.
     */
    preloadedSelection = input<LazySelectOption | null>(null);

    // --- Outputs -----------------------------------------------------

    valueChange = output<string>();

    // --- Internals ---------------------------------------------------

    private readonly http       = inject(HttpClient);
    private readonly store      = inject(Store);
    private readonly destroyRef = inject(DestroyRef);

    @ViewChild('wrapper')   wrapperRef!:     ElementRef<HTMLElement>;
    @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
    @ViewChild('dropPanel', { static: false }) set dropPanelRef(ref: ElementRef<HTMLElement> | undefined) {
        this.dropdownPanelEl = ref?.nativeElement ?? null;
    }

    private dropdownPanelEl: HTMLElement | null = null;

    readonly isOpen          = signal(false);
    readonly loading         = signal(false);
    /** Result rows from the most recent fetch (server mode) or the static input. */
    readonly serverOptions   = signal<readonly LazySelectOption[]>([]);
    readonly totalCount      = signal(0);
    readonly searchQuery     = signal('');

    // Fixed-position coords for the dropdown — recalculated on open
    readonly dropTop   = signal(0);
    readonly dropLeft  = signal(0);
    readonly dropWidth = signal(200);

    readonly searchControl = new FormControl('');

    /** Whether the component is operating in server-search mode. */
    private readonly serverMode = computed(() =>
        this.loader() !== null || (this.apiUrl() ?? '') !== '',
    );

    /**
     * The list rendered in the dropdown.
     *
     * Server mode: `serverOptions` is already filtered by the backend
     * for RQL endpoints. For OptionSource endpoints (which return the
     * whole short catalogue on first fetch), we narrow client-side so
     * typing still works without a roundtrip.
     * Client mode: filter `options` by the typed query.
     */
    readonly filteredOptions = computed<readonly LazySelectOption[]>(() => {
        const q = this.searchQuery().trim().toLowerCase();
        const list = this.serverMode() ? this.serverOptions() : this.options();
        if (q === '') return list;
        return list.filter(o =>
            o.label.toLowerCase().includes(q)
            || (o.group ?? '').toLowerCase().includes(q),
        );
    });

    /**
     * Visible rows bucketed by group for grouped rendering. When no
     * option carries a non-null `group`, the entire list collapses
     * into a single `{name: null, rows: …}` bucket and the template
     * renders without any sticky header. Bucket order follows the
     * first-encountered order of each group name; row order within a
     * bucket matches the upstream sequence.
     */
    readonly groupedOptions = computed<ReadonlyArray<{ name: string | null; rows: readonly LazySelectOption[] }>>(() => {
        const out: { name: string | null; rows: LazySelectOption[] }[] = [];
        const byName = new Map<string | null, LazySelectOption[]>();
        for (const opt of this.filteredOptions()) {
            const key = opt.group ?? null;
            let bucket = byName.get(key);
            if (!bucket) {
                bucket = [];
                byName.set(key, bucket);
                out.push({ name: key, rows: bucket });
            }
            bucket.push(opt);
        }
        return out;
    });

    /**
     * The option backing the current `value()`.
     *
     * Searches:
     *  1. the visible options (`filteredOptions`)
     *  2. the unfiltered server cache (`serverOptions`)
     *  3. the static `options` input
     *  4. the `preloadedSelection` input (used by custom-loader callers)
     */
    readonly selectedOption = computed<LazySelectOption | null>(() => {
        const id = this.value();
        if (id === '') return null;
        return (
            this.filteredOptions().find(o => o.id === id) ??
            this.serverOptions().find(o => o.id === id) ??
            this.options().find(o => o.id === id) ??
            (this.preloadedSelection()?.id === id ? this.preloadedSelection() : null)
        );
    });

    constructor() {
        // Re-fetch the initial page whenever apiUrl/loader/options shape changes.
        effect(() => {
            void this.apiUrl();
            void this.loader();
            void this.options();
            if (this.isOpen()) {
                // re-open will refresh
                return;
            }
            // Cold-start: prefetch only when the caller is in server mode so
            // the trigger label can render before the dropdown opens.
            if (this.serverMode()) {
                this.fetchOptions('');
            }
        });
    }

    ngOnInit(): void {
        this.searchControl.valueChanges.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(query => {
            this.searchQuery.set(query ?? '');
            if (this.serverMode()) {
                this.fetchOptions(query ?? '');
            }
        });
    }

    // --- User interactions -------------------------------------------

    @HostListener('document:click', ['$event.target'])
    onOutsideClick(target: EventTarget | null): void {
        // `$event.target` is an EventTarget; narrow it once so the DOM
        // containment check below stays a real check.
        const node = target instanceof Node ? target : null;
        if (!this.isOpen()) return;
        const inTrigger  = this.wrapperRef?.nativeElement.contains(node);
        const inDropdown = this.dropdownPanelEl?.contains(node);
        if (!inTrigger && !inDropdown) this.close();
    }

    toggleOpen(): void {
        this.isOpen.update(v => !v);
        if (this.isOpen()) {
            const rect = this.wrapperRef.nativeElement.getBoundingClientRect();
            this.dropTop.set(rect.bottom + 2);
            this.dropLeft.set(rect.left);
            this.dropWidth.set(Math.max(rect.width, 220));
            // Focus the search box on the next tick (template just rendered).
            setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
            // Fresh fetch on open for server mode (ensure latest results).
            if (this.serverMode() && this.serverOptions().length === 0) {
                this.fetchOptions('');
            }
        }
    }

    close(): void {
        this.isOpen.set(false);
        this.searchControl.reset('', { emitEvent: false });
        this.searchQuery.set('');
    }

    selectOption(opt: LazySelectOption): void {
        this.valueChange.emit(opt.id);
        this.close();
    }

    clear(event: Event): void {
        event.stopPropagation();
        this.valueChange.emit('');
    }

    // --- Server-mode loader plumbing ---------------------------------

    /**
     * Fetch options for the given query. Uses the custom `loader` when
     * provided, otherwise builds an HTTP call from `apiUrl` /
     * `searchStyle` / `searchField`.
     */
    private fetchOptions(query: string): void {
        this.loading.set(true);

        const obs$ = this.loader()
            ? this.loader()!(query, this.pageSize())
            : this.fetchFromApi(query);

        obs$.pipe(
            catchError(() => of({ items: [] as LazySelectOption[], total: 0 })),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(({ items, total }) => {
            this.serverOptions.set(items);
            this.totalCount.set(total ?? items.length);
            this.loading.set(false);

            // For built-in HTTP mode, ensure the selected row is in the
            // list even when it isn't on the first page.
            if (query === '' && this.apiUrl() && !this.loader()) {
                this.ensureSelectedInList(items.map(i => i.id));
            }
        });
    }

    /**
     * Default HTTP loader: hits {@link apiUrl} with `?filter=` (RQL) or
     * `?q=` depending on {@link searchStyle}.
     */
    private fetchFromApi(query: string): Observable<{ items: LazySelectOption[]; total?: number }> {
        const token   = this.store.selectSnapshot(AuthState.accessToken);
        const limit   = this.pageSize();
        const apiUrl  = this.apiUrl()!;

        let params = new HttpParams().set('limit', String(limit));
        // An always-on extra clause (e.g. `isSystem eq false`). Appended as its
        // own `filter` param so it AND-combines with the search clause below
        // rather than overwriting it (the backend reads the raw query string and
        // honours repeated `filter` keys).
        const extra = (this.extraFilter() ?? '').trim();
        if (extra !== '') {
            params = params.append('filter', extra);
        }
        if (query !== '') {
            if (this.searchStyle() === 'rql') {
                const filterExpr = `${this.searchField()} cn "${query.replace(/"/g, '\\"')}"`;
                params = params.append('filter', filterExpr);
            } else {
                params = params.set('q', query);
            }
        }

        return new Observable<{ items: LazySelectOption[]; total?: number }>(subscriber => {
            const sub = this.http.get<Record<string, unknown>>(apiUrl, {
                headers: {
                    Accept:        'application/ld+json',
                    Authorization: `Bearer ${token ?? ''}`,
                },
                params,
            }).subscribe({
                next: r => {
                    const members = (r['member'] ?? r['hydra:member'] ?? r ?? []) as
                        ReadonlyArray<Record<string, unknown>>;
                    const items = (Array.isArray(members) ? members : []).map(row => this.rowToOption(row));
                    subscriber.next({
                        items,
                        total: (r['totalItems'] as number | undefined) ?? items.length,
                    });
                    subscriber.complete();
                },
                error: err => subscriber.error(err),
            });
            return () => sub.unsubscribe();
        });
    }

    /**
     * Project an opaque API row into a {@link LazySelectOption}.
     *
     * Uses {@link valueKey} as the primary wire id (defaults to `id`,
     * falls back to `slug` for back-compat with existing resource
     * endpoints, then to `value` for OptionSource rows). The label
     * walks {@link labelKeys} for the first non-empty string. When
     * {@link groupKey} is set the matching row field populates
     * `group`, enabling the dropdown's sticky section headers.
     */
    private rowToOption(row: Record<string, unknown>): LazySelectOption {
        const vk = this.valueKey();
        const id = String(row[vk] ?? row['id'] ?? row['slug'] ?? row['value'] ?? '');
        let label = '';
        for (const key of this.labelKeys()) {
            const v = row[key];
            if (typeof v === 'string' && v.trim() !== '') {
                label = v;
                break;
            }
        }
        const gk = this.groupKey();
        const groupValue = gk !== null && typeof row[gk] === 'string'
            ? (row[gk])
            : null;
        return {
            id,
            label: label || id,
            group: groupValue,
            extras: row,
        };
    }

    /**
     * If the selected `value()` isn't in the currently-loaded page,
     * fetch it individually via `GET {apiUrl}/{id}` and prepend so the
     * trigger always shows the correct label.
     */
    private ensureSelectedInList(loadedIds: readonly string[]): void {
        const id = this.value();
        if (id === '' || loadedIds.includes(id)) return;

        const apiUrl = this.apiUrl();
        if (!apiUrl) return;

        const token = this.store.selectSnapshot(AuthState.accessToken);
        this.http.get<Record<string, unknown>>(
            `${apiUrl}/${encodeURIComponent(id)}`,
            {
                headers: {
                    Accept:        'application/ld+json',
                    Authorization: `Bearer ${token ?? ''}`,
                },
            },
        ).pipe(
            catchError(() => of(null)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(raw => {
            if (!raw) return;
            const opt = this.rowToOption(raw);
            if (opt.id === '' || this.serverOptions().some(o => o.id === opt.id)) return;
            this.serverOptions.update(opts => [opt, ...opts]);
        });
    }
}
