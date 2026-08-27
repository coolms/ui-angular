import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    inject,
    input,
    OnInit,
    output,
    signal,
    untracked,
} from '@angular/core';
import { Store } from '@ngxs/store';
import { Dialog } from '@angular/cdk/dialog';
import { filter, map, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { DynamicRecordService, DynamicRecordDto } from './dynamic-record.service';
import { DynamicRecordFormComponent } from './dynamic-record-form.component';
import { RUNTIME_TYPES_PORT } from '../schema/runtime-types.port';
import type { DynamicEntityTypeDto, EntityTypeSchema } from '../schema/schema.types';
import { ConfirmDialogService } from '../ui/confirm-dialog.service';
import { ToastService } from '../ui/toast.service';
import { PageActionsService } from '../ui/page-actions.service';
import { PageFooterService } from '../ui/page-footer.service';
import { PageTitleService } from '../ui/page-title.service';
import { DataGridComponent } from '../datagrid/datagrid.component';
import { DataGridData } from '../datagrid/datagrid.types';
import { AppConfigState } from '@coolms/core-angular';
@Component({
    selector: 'app-dynamic-record-list',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, DataGridComponent],
    template: `
        @if (configLoadFailed()) {
            <!-- No fields defined yet, or type not found (gridId config returned 404) -->
            <div class="drl-empty">
                <i class="bi bi-table drl-empty__icon"></i>
                <p class="drl-empty__text">No fields defined yet.</p>
                @if (embedded()) {
                    <button class="drl-empty__link"
                            (click)="switchToStructure.emit()">
                        Add fields here
                    </button>
                } @else {
                    <a routerLink="/system/entities" class="drl-empty__link">
                        Add fields in Domain Explorer
                    </a>
                    <span class="drl-empty__hint"> to see columns here.</span>
                }
            </div>
        } @else if (configBaseUrl()) {
            <!-- DataGrid — config fetched from /api/v1/datagrids/dynamic:{alias}.
                 Guarded by configBaseUrl() so the DataGrid never fires a request
                 with an empty base URL before AppConfigState.manifest has loaded.
                 externalData is seeded with hasMore:true so the sentinel fires the
                 first loadMore after config resolves; records are then loaded via
                 (loadMore) and pushed back into gridData signal by loadRecords(). -->
            <coolms-datagrid
                [embedded]="embedded()"
                [gridId]="gridId()"
                [configBaseUrl]="configBaseUrl()"
                [externalData]="gridData()"
                (rowSelected)="rowSelected.emit($event)"
                (rowContextMenu)="recordRowContextMenu.emit($event)"
                (backgroundContextMenu)="recordBgContextMenu.emit($event)"
                (rowActionTriggered)="onRowActionEvent($event)"
                (loadMore)="onLoadMore($event)"
                (configError)="onConfigError()" />
        }
    `,
    styles: [`
        :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }

        .drl-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex: 1;
            gap: 8px;
            padding: 48px 24px;
            color: var(--cms-text-muted);
            text-align: center;
        }
        .drl-empty__icon { font-size: 2.5rem; opacity: .4; }
        .drl-empty__text { margin: 0; font-size: .95rem; }
        .drl-empty__link { color: var(--cms-primary); text-decoration: underline; cursor: pointer; }
        .drl-empty__hint { font-size: .85rem; }
    `],
})
export class DynamicRecordListComponent implements OnInit {
    readonly typeAlias  = input.required<string>();
    readonly title      = input<string | null>(null);
    readonly showCreate = input<boolean>(true);
    /**
     * When true: no title/page-actions registration, no footer updates,
     * DataGrid runs in lazy (infinite-scroll) mode with embedded styling.
     * Defaults to false so all existing standalone usages are unaffected.
     */
    readonly embedded   = input<boolean>(false);

    /** Emits the total record count after every successful load. */
    readonly totalChange = output<number>();
    /**
     * Emitted in embedded mode when the user triggers the "New record" action
     * via the toolbar button. The host component (e.g. DomainExplorerDetail)
     * handles the actual dialog open so it can reload the record list afterwards.
     */
    readonly createRequested    = output<void>();
    readonly switchToStructure  = output<void>();

    /**
     * Passes through the DataGrid's rowSelected event so the host can update
     * toolbar state (e.g. show edit/delete actions when a row is selected).
     */
    readonly rowSelected = output<Record<string, unknown> | null>();

    /** Pass-through of the inner grid's rowContextMenu so the host can open
     *  its own context menu with the current selection. */
    readonly recordRowContextMenu = output<MouseEvent>();

    /** Pass-through of the inner grid's backgroundContextMenu so the host can
     *  open a background-surface context menu on the records grid area. */
    readonly recordBgContextMenu  = output<MouseEvent>();

    private readonly recordSvc   = inject(DynamicRecordService);
    private readonly runtimeTypes = inject(RUNTIME_TYPES_PORT);
    private readonly store       = inject(Store);
    private readonly dialog      = inject(Dialog);
    private readonly confirmSvc  = inject(ConfirmDialogService);
    private readonly toast       = inject(ToastService);
    private readonly actions     = inject(PageActionsService, { optional: true });
    private readonly footer      = inject(PageFooterService, { optional: true });
    private readonly pageTitleSvc = inject(PageTitleService);
    private readonly destroyRef  = inject(DestroyRef);

    /** Schema — loaded separately for form dialogs and title resolution. */
    readonly schema  = signal<EntityTypeSchema | null>(null);

    readonly records = signal<DynamicRecordDto[]>([]);
    readonly total   = signal(0);
    readonly loading = signal(false);
    readonly page    = signal(1);
    readonly limit   = 50;

    /** Current sort expression (e.g. `title asc`) emitted by the DataGrid. */
    readonly currentSort    = signal<string | null>(null);
    /** Current RQL column-filter expressions (e.g. `title cn "product"`) emitted by the DataGrid. */
    readonly currentFilters = signal<ReadonlyArray<string>>([]);

    /** True when there are more pages to load (used by DataGrid lazy sentinel). */
    readonly hasMore = signal(false);

    /** True when the gridId config endpoint returned an error (e.g. 404 — no fields yet). */
    readonly configLoadFailed = signal(false);

    /** DataGrid config ID derived from the type alias. */
    readonly gridId = computed(() => `dynamic:${this.typeAlias()}`);

    /** DataGrid config base URL from the API manifest. */
    readonly configBaseUrl = computed(() =>
        this.store.selectSnapshot(AppConfigState.manifest)?.dataGrid?.configBase ?? '',
    );

    readonly pageTitle = computed(() =>
        this.title() ?? this.schema()?.label ?? this.typeAlias(),
    );

    readonly totalPages = computed(() =>
        Math.max(1, Math.ceil(this.total() / this.limit)),
    );

    /**
     * Seeded with hasMore:true so that when the DataGrid resolves its config and
     * calls onSentinelVisible(), the guard `data().hasMore === false` does NOT
     * short-circuit and the first loadMore event is emitted.
     *
     * Updated explicitly by loadRecords() after every successful response.
     * A signal (not computed) is used so we control exactly when the DataGrid's
     * externalData effect fires, preventing spurious mid-load intermediate updates.
     */
    readonly gridData = signal<DataGridData>({
        items: [], totalItems: 0, page: 1,
        limit: 50, totalPages: 0, hasMore: true,
    });

    constructor() {
        // Reset all per-type state when the alias changes so a switch between
        // Dynamic Entity types loads cleanly. The DataGrid re-fetches its config
        // for the new gridId; this clears the records/total/page/gridData so the
        // first response from the new type does not collide with stale rows.
        // Seeding hasMore:true is critical -- it keeps the sentinel guard from
        // short-circuiting so the first loadMore fires for the new type.
        effect(() => {
            this.typeAlias(); // track
            untracked(() => {
                this.configLoadFailed.set(false);
                this.records.set([]);
                this.total.set(0);
                this.page.set(1);
                this.hasMore.set(false);
                this.currentSort.set(null);
                this.currentFilters.set([]);
                this.gridData.set({
                    items:      [],
                    totalItems: 0,
                    page:       1,
                    limit:      this.limit,
                    totalPages: 0,
                    hasMore:    true,
                });
            });
        });
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    ngOnInit(): void {
        if (!this.embedded()) {
            // Wire footer pagination buttons → prev/next page (standalone mode only)
            this.footer?.prevPage$.pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(() => this.prevPage());
            this.footer?.nextPage$.pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(() => this.nextPage());
        }

        // Load schema separately — used for form dialogs and title/breadcrumb resolution.
        // Records are loaded via the DataGrid's (loadMore) event after its config resolves,
        // so there is no forkJoin dependency between schema and record loading.
        this.runtimeTypes.listRuntimeTypes().pipe(
            map((types: DynamicEntityTypeDto[]) => {
                const dto = types.find(t => t.slug === this.typeAlias()) ?? null;
                if (!dto) return null;
                return { alias: dto.slug, label: dto.label, fields: dto.fields };
            }),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(schema => {
            this.schema.set(schema);

            if (!this.embedded()) {
                const resolvedTitle = this.pageTitle();
                this.actions?.setTitle(resolvedTitle);
                this.pageTitleSvc.set(resolvedTitle);
            }

            if (this.showCreate() && schema !== null) {
                this.actions?.register(
                    [{ id: 'create', icon: 'plus-lg', label: 'New record', primary: false }],
                    {
                        create: () => {
                            if (this.embedded()) {
                                this.createRequested.emit();
                            } else {
                                this.openCreate();
                            }
                        },
                    },
                );
            }
        });
    }

    // ── Config error handler ───────────────────────────────────────────────────

    onConfigError(): void {
        this.configLoadFailed.set(true);
    }

    // ── Row actions ────────────────────────────────────────────────────────────

    onRowActionEvent(event: { action: string; row: Record<string, unknown> }): void {
        const record = event.row as DynamicRecordDto;
        if (event.action === 'edit')   this.openEdit(record);
        if (event.action === 'delete') this.confirmDelete(record);
    }

    /**
     * Handles lazy-scroll loadMore events emitted by DataGrid's IntersectionObserver.
     * `reset: true`  → replace records (sort/filter changed, or first page)
     * `reset: false` → append next page of records
     *
     * NOTE: the DataGrid's onSentinelVisible() always emits reset:false, including
     * on the initial config-load kick-off. When offset === 0 the sentinel has no
     * data yet, which is functionally equivalent to a reset — treat it identically
     * so we always start from page 1 instead of jumping to page 2.
     */
    onLoadMore(event: { offset: number; sort: string | null; reset: boolean; columnFilters: ReadonlyArray<string> }): void {
        const isReset = event.reset || event.offset === 0;
        // Capture sort & filter state from the grid on every emit so subsequent
        // append pages (and refreshes after create/edit/delete) keep the same criteria.
        this.currentSort.set(event.sort);
        this.currentFilters.set(event.columnFilters);

        if (isReset) {
            this.page.set(1);
            this.records.set([]);
            // Clear displayed rows immediately while the first page loads.
            this.gridData.update(d => ({ ...d, items: [], totalItems: 0, page: 1, totalPages: 0, hasMore: true }));
        } else {
            this.page.update(p => p + 1);
        }
        this.loadRecords(isReset ? 'replace' : 'append');
    }

    // ── Pagination ─────────────────────────────────────────────────────────────

    prevPage(): void {
        if (this.page() <= 1) return;
        this.page.update(p => p - 1);
        this.loadRecords('replace');
    }

    nextPage(): void {
        if (this.page() >= this.totalPages()) return;
        this.page.update(p => p + 1);
        this.loadRecords('replace');
    }

    // ── CRUD ───────────────────────────────────────────────────────────────────

    openCreate(): void {
        this.dialog.open(DynamicRecordFormComponent, {
            data: { typeAlias: this.typeAlias(), schema: this.schema(), mode: 'create' },
        }).closed.pipe(filter(Boolean), takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.loadRecords('replace'));
    }

    openEdit(record: DynamicRecordDto): void {
        this.dialog.open(DynamicRecordFormComponent, {
            data: { typeAlias: this.typeAlias(), schema: this.schema(), record, mode: 'edit' },
        }).closed.pipe(filter(Boolean), takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.loadRecords('replace'));
    }

    confirmDelete(record: DynamicRecordDto): void {
        const name = (record['title'] as string) ?? record.id;
        this.confirmSvc.confirmDelete(name)
            .pipe(
                filter(Boolean),
                switchMap(() => this.recordSvc.deleteRecord(record.id)),
                takeUntilDestroyed(this.destroyRef),
            ).subscribe({
                next: () => { this.toast.success('Record deleted'); this.loadRecords('replace'); },
                error: (e: { error?: { detail?: string } }) =>
                    this.toast.error(e?.error?.detail ?? 'Delete failed'),
            });
    }

    // ── Private ────────────────────────────────────────────────────────────────

    private loadRecords(mode: 'replace' | 'append' = 'replace'): void {
        this.loading.set(true);

        this.recordSvc.listRecords(this.typeAlias(), {
            page:    this.page(),
            limit:   this.limit,
            filters: this.currentFilters(),
            sort:    this.currentSort() ?? undefined,
        }).pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: data => {
                    const items = data.items ?? [];
                    if (mode === 'append') {
                        this.records.update(prev => [...prev, ...items]);
                    } else {
                        this.records.set(items);
                    }
                    this.total.set(data.total ?? 0);
                    this.loading.set(false);
                    this.updateHasMore();

                    // Publish the updated snapshot to the DataGrid. Must come after
                    // updateHasMore() so hasMore() already reflects the new value.
                    this.gridData.set({
                        items:      this.records(),
                        totalItems: this.total(),
                        page:       this.page(),
                        limit:      this.limit,
                        totalPages: this.totalPages(),
                        hasMore:    this.hasMore(),
                    });

                    if (!this.embedded()) {
                        this.updateFooter();
                    }
                },
                error: (e: { error?: { detail?: string } }) => {
                    this.loading.set(false);
                    // Settle `hasMore`, or the failed page is retried forever: the
                    // snapshot is seeded with `hasMore: true` (so the FIRST loadMore
                    // fires once the grid resolves its config), and leaving it there
                    // means the sentinel keeps re-requesting a request that just
                    // failed — and keeps the grid's in-flight guard latched, so it
                    // shows the loading skeleton with no resting state.
                    this.hasMore.set(false);
                    this.gridData.update(d => ({ ...d, hasMore: false }));
                    this.toast.error(e?.error?.detail ?? 'Failed to load records');
                },
            });
    }

    private updateHasMore(): void {
        this.hasMore.set(this.records().length < this.total());
        this.totalChange.emit(this.total());
    }

    private updateFooter(): void {
        const total = this.total();
        this.footer?.update({
            count:      `${total} record${total === 1 ? '' : 's'}`,
            pagination: { page: this.page(), totalPages: this.totalPages() },
        });
    }
}
