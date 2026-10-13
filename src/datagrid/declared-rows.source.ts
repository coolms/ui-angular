import { computed, DestroyRef, inject, signal, type Signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngxs/store';
import { AppConfigState, ErrorHandlerService } from '@coolms/core-angular';
import type { DataGridConfig, DataGridData, DataGridRows } from './datagrid.types';

/** What the grid's `(loadMore)` asks -- the part a rows source reads. */
export interface DataGridLoadRequest {
    readonly offset:        number;
    readonly sort:          string | null;
    readonly reset:         boolean;
    readonly columnFilters: ReadonlyArray<string>;
}

/**
 * Where a grid stands with its rows: not yet told (`unknown`), the declared action's state for the caller
 * (`allowed`, `elevate`, `denied`), or a definition that names no source (`undeclared`).
 */
export type DeclaredRowsAvailability = 'unknown' | 'allowed' | 'elevate' | 'denied' | 'undeclared';

export interface DeclaredRowsSource {
    /** For `[externalData]`. Never null: a null externalData sends the grid to its own /data fetch. */
    readonly data:         Signal<DataGridData>;
    readonly availability: Signal<DeclaredRowsAvailability>;
    /** The last fetch's refusal or failure, as the server said it; null when the last fetch answered. */
    readonly error:        Signal<string | null>;
    /** True once the first fetch has answered or failed -- a footer count says nothing before it. */
    readonly loaded:       Signal<boolean>;
    /**
     * Whether the grid's body should be drawn: not while the rows are locked, refused or undeclared -- the grid's
     * empty state would say "No contacts yet" of a list the person may not read. Hide the grid then; do not remove
     * it: it must stay mounted to read its definition again when elevation changes.
     */
    readonly showsRows:    Signal<boolean>;
    /** For `(configLoaded)`: the definition says where the rows come from and what that comes to now. */
    use(config: DataGridConfig): void;
    /** For `(loadMore)`. A request that arrives before the definition is kept and run once it does. */
    load(request: DataGridLoadRequest): void;
    /**
     * Change the rows already loaded, in place -- a live event replacing an updated row or dropping a deleted one.
     * The count follows the number of rows removed or added.
     */
    update(change: (items: ReadonlyArray<Record<string, unknown>>) => ReadonlyArray<Record<string, unknown>>): void;
}

export interface DeclaredRowsOptions {
    /** Rows per request for `query: rql`. */
    readonly pageSize?:     number;
    /** RQL filters the PAGE adds (a toolbar search), sent after the grid's own column filters. */
    readonly extraFilters?: () => ReadonlyArray<string>;
    /**
     * Named parameters the page sends with every `rql` request, outside the RQL contract -- a SCOPE the operation
     * applies before its RQL (the leads' `?status=` tab). Not a route: the route is still the definition's.
     */
    readonly extraParams?:  () => Readonly<Record<string, string>>;
    /** Shape each row as the grid draws it (a display name joined from two fields, a group's label). */
    readonly mapRow?:       (row: Record<string, unknown>) => Record<string, unknown>;
}

interface HydraPage {
    readonly member?:     ReadonlyArray<Record<string, unknown>>;
    readonly totalItems?: number;
}

/**
 * A grid's rows, read from where its definition declares they come from (`rows.operation`) and nowhere else -- so a
 * page names no list route of its own. Call it in an injection context (a field initializer), and bind:
 *
 *     <coolms-datagrid [externalData]="rows.data()" (configLoaded)="rows.use($event)" (loadMore)="rows.load($event)">
 *
 * - `query: rql` -- each request sends the grid's paging, sort and filters as the operation reads them: `page`,
 *   `limit`, `sort` and one `filter` per RQL expression; the answer's Hydra `member` / `totalItems` become the rows.
 * - `query: none` -- one GET, every row, no parameters; the grid pages them itself.
 * - `elevate` and `denied` fetch nothing; the page shows the grid locked or not available (`availability`). The grid
 *   reads its definition again when elevation changes, and `use()` then starts over from the fresh state.
 */
export function declaredRowsSource(options: DeclaredRowsOptions = {}): DeclaredRowsSource {
    const http       = inject(HttpClient);
    const store      = inject(Store);
    const errors     = inject(ErrorHandlerService);
    const destroyRef = inject(DestroyRef);
    const pageSize   = options.pageSize ?? 50;

    const empty = (hasMore: boolean): DataGridData => ({
        items: [], totalItems: 0, page: 1, limit: pageSize, totalPages: 1, hasMore,
    });

    const data         = signal<DataGridData>(empty(true));
    const availability = signal<DeclaredRowsAvailability>('unknown');
    const error        = signal<string | null>(null);
    const loaded       = signal(false);
    let rows: DataGridRows | null = null;
    let pending: DataGridLoadRequest | null = null;
    let epoch = 0;

    /** `GET /api/v1/...` against the API's origin: the manifest's apiBase when it is absolute, else this page's. */
    const urlOf = (operation: string): string => {
        const path = operation.replace(/^GET\s+/, '');
        const apiBase = store.selectSnapshot(AppConfigState.manifest)?.apiBase ?? '';
        return /^https?:\/\//.test(apiBase) ? new URL(path, apiBase).toString() : path;
    };

    const fetchPage = (request: DataGridLoadRequest, source: DataGridRows): void => {
        const rql = 'rql' === source.query;
        if (!rql && request.offset > 0) {
            return; // one GET answered every row
        }
        const page = rql ? Math.floor(request.offset / pageSize) + 1 : 1;
        let params = new HttpParams();
        if (rql) {
            params = params.set('page', String(page)).set('limit', String(pageSize));
            if (null !== request.sort && '' !== request.sort) {
                params = params.set('sort', request.sort);
            }
            for (const filter of [...request.columnFilters, ...(options.extraFilters?.() ?? [])]) {
                if ('' !== filter.trim()) {
                    params = params.append('filter', filter);
                }
            }
            for (const [name, value] of Object.entries(options.extraParams?.() ?? {})) {
                params = params.set(name, value);
            }
        }
        const mine = ++epoch;
        const append = rql && !request.reset && request.offset > 0;

        http.get<HydraPage>(urlOf(source.operation), { params, headers: { Accept: 'application/ld+json' } })
            .pipe(takeUntilDestroyed(destroyRef))
            .subscribe({
                next: answer => {
                    if (mine !== epoch) return; // a later request has superseded this one
                    const got = (answer.member ?? []).map(row => options.mapRow?.(row) ?? row);
                    const items = append ? [...data().items, ...got] : [...got];
                    const total = answer.totalItems ?? items.length;
                    error.set(null);
                    loaded.set(true);
                    data.set({
                        items,
                        totalItems: total,
                        page,
                        limit:      pageSize,
                        totalPages: Math.max(1, Math.ceil(total / pageSize)),
                        hasMore:    rql && items.length < total,
                    });
                },
                error: (err: unknown) => {
                    if (mine !== epoch) return;
                    error.set(errors.humanize(err));
                    loaded.set(true);
                    // Settle hasMore, or the grid's sentinel asks for the failed page again forever.
                    data.set({ ...data(), hasMore: false });
                },
            });
    };

    return {
        data:         data.asReadonly(),
        availability: availability.asReadonly(),
        error:        error.asReadonly(),
        loaded:       loaded.asReadonly(),
        showsRows:    computed(() => 'unknown' === availability() || 'allowed' === availability()),

        use(config: DataGridConfig): void {
            const next = config.rows ?? null;
            const changed = next?.state !== rows?.state || next?.operation !== rows?.operation || null === rows;
            rows = next;
            if (null === next) {
                availability.set('undeclared');
                error.set('This list does not say where its rows come from.');
                data.set(empty(false));
                return;
            }
            availability.set(next.state);
            if ('allowed' !== next.state) {
                error.set(null);
                data.set(empty(false));
                return;
            }
            if (changed) {
                data.set(empty(true));
            }
            if (null !== pending) {
                const request = pending;
                pending = null;
                fetchPage({ ...request, offset: 0, reset: true }, next);
            } else if ('none' === next.query && changed) {
                fetchPage({ offset: 0, sort: null, reset: true, columnFilters: [] }, next);
            }
        },

        load(request: DataGridLoadRequest): void {
            if (null === rows || 'allowed' !== rows.state) {
                pending = request;
                return;
            }
            fetchPage(request, rows);
        },

        update(change): void {
            const before = data();
            const items = change(before.items);
            const total = Math.max(items.length, before.totalItems + (items.length - before.items.length));
            data.set({ ...before, items, totalItems: total });
        },
    };
}
