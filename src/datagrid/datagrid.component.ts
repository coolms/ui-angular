import {
    AfterViewChecked,
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    ElementRef,
    HostListener,
    inject,
    input,
    OnDestroy,
    OnInit,
    output,
    signal,
    untracked,
    ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CmsLoaderComponent } from '@coolms/core-angular';

import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import {
    CdkDragDrop,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPreview,
    CdkDragPlaceholder,
    moveItemInArray,
} from '@angular/cdk/drag-drop';
import { catchError, of } from 'rxjs';
import {
    ActiveFilter,
    DataGridColumnDef,
    DataGridConfig,
    DataGridData,
    DataGridRowAction,
    EnumOption,
    SortState,
} from './datagrid.types';

/** Row decorated with tree position for the DFS-flatten path. */
type TreeRow = Record<string, unknown> & { readonly _depth: number };

/** Per-parent load request emitted on chevron expansion. */
interface LoadChildrenRequest {
    readonly parentId: string;
    readonly sort:     string | null;
}

/** Drop-on-row request emitted when drag-drop succeeds the pre-validation. */
interface MoveRequest {
    readonly sourceId:   string;
    readonly targetId:   string;
    readonly sourcePath: string;
    readonly targetPath: string;
}

/** Indent in pixels per tree depth level. Wider than the old 16px so nesting
 *  reads clearly in a flat table (the indent only shifts the chevron cell). */
const TREE_INDENT_PER_DEPTH_PX = 24;

/** Delay before auto-expanding a hovered-over collapsed Directory drop target. */
const TREE_DRAG_AUTO_EXPAND_MS = 700;
import { DataGridRowActionsComponent } from './datagrid-row-actions.component';
import { ColumnChooserComponent } from './column-chooser.component';
import { DataGridLiveEventsService, type DataGridChangeEvent } from './datagrid-live-events.service';
import { UserPreferencesService, NaviGraphService } from '@coolms/core-angular';
import { ContextMenuService, ContextMenuItem } from '../context-menu/context-menu.service';
import {
    DateRangePickerComponent,
    type DateRangeValue,
    DateTimeRangePickerComponent,
    type DateTimeRangeValue,
    TimeRangePickerComponent,
    type TimeRangeValue,
} from '../ui/range-picker';
import {
    MultiOptionSelectComponent,
    type MultiOptionRow,
} from '../ui/multi-option-select/multi-option-select.component';
import { DataGridFilterHostComponent } from './filter-widgets/datagrid-filter-host.component';
import {
    DataGridFilterWidgetRegistry,
    type DataGridFilterWidgetConfig,
} from './filter-widgets/datagrid-filter-widget-registry';
import { DataGridCellHostComponent } from './cell-widgets/datagrid-cell-host.component';
import {
    DataGridCellWidgetRegistry,
    type DataGridCellWidgetConfig,
} from './cell-widgets/datagrid-cell-widget-registry';
import { UserCalendarPreferencesService } from '../util/user-calendar-preferences.service';
import { LoadingComponent } from '../ui/state/loading.component';
import { EmptyStateComponent } from '../ui/state/empty-state.component';
import { ErrorBannerComponent } from '../ui/state/error-banner.component';

// Convention-based enum value -> Bootstrap badge colour mapping. Case-insensitive.
const POSITIVE_ENUM_VALUES = new Set(['ready', 'published', 'active', 'enabled', 'success', 'done', 'complete', 'approved']);
const NEGATIVE_ENUM_VALUES = new Set(['failed', 'error', 'rejected', 'denied', 'blocked', 'disabled']);
const PENDING_ENUM_VALUES  = new Set(['pending', 'queued', 'waiting', 'processing', 'draft']);
const NEUTRAL_ENUM_VALUES  = new Set(['archived', 'cancelled', 'unknown']);

/**
 * Generic DataGrid component backed by `/api/v1/datagrids/{id}` (config)
 * and `/api/v1/datagrids/{id}/data` (paginated rows).
 *
 * Inputs (API-backed mode):
 *   gridId        — datagrid config ID (e.g. 'navi_nodes')
 *   configBaseUrl — manifest.dataGrid.configBase
 *   routeParams   — extra route params merged into source (e.g. { slug: 'main' })
 *
 * Inputs (external / inline mode — for use without a dedicated backend endpoint):
 *   externalConfig — DataGridConfig built by the parent; skips the config API call.
 *   externalData   — DataGridData provided by the parent; skips the data API call and
 *                    hides DataGrid's own pagination (parent manages paging externally).
 *
 * Outputs:
 *   rowActionTriggered — emitted for every row action click. When externalConfig is
 *                        set (and rowActions have no `route`), the parent must handle
 *                        all actions here. When using API config with `route`, internal
 *                        HTTP delete still fires AND this output is emitted.
 */
@Component({
    selector: 'coolms-datagrid',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CmsLoaderComponent, FormsModule, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPreview, CdkDragPlaceholder, DataGridRowActionsComponent, ColumnChooserComponent, LoadingComponent, EmptyStateComponent, ErrorBannerComponent, DateRangePickerComponent, DateTimeRangePickerComponent, TimeRangePickerComponent, MultiOptionSelectComponent, DataGridFilterHostComponent, DataGridCellHostComponent],
    host: {
        style: 'display:flex; flex-direction:column; flex:1; min-height:0',
        // The grid is a SELECTABLE SURFACE. `ExplorerLayout` treats any
        // click in the main area that is not inside `[data-selectable]` as a
        // background click and tells the host page to clear its selection — a
        // convention the tile views declare per item and the grid never did.
        // Inside an explorer that meant every row click set the host's
        // selection and then immediately cleared it, so the grid could not be
        // used to select anything at all; the same click also wiped a
        // selection made in tile mode. Marking the whole host, not each row,
        // because the filter row, the header and the column chooser live
        // inside the grid too and clicking them is not "background" either.
        '[attr.data-selectable]': '""',
    },
    styles: [
        '.cdk-drag-animating { transition: transform 250ms ease; }',
        // Keyboard-navigation cursor. Visible whether or not the row is also selected.
        // Left-border accent rather than a fill so it reads on top of .table-active.
        'tr.table-focus { box-shadow: inset 3px 0 0 var(--cms-accent); }',
        '.drag-handle { cursor: grab; color: var(--cms-text-muted); user-select: none; }',
        '.drag-handle:active { cursor: grabbing; }',
        // FIX 1: prevent header text from wrapping; ellipsis on overflow.
        // .col-chooser-th overrides overflow so its absolute dropdown is not clipped.
        'th { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        'th.sortable { cursor: pointer; user-select: none; }',
        'th.sortable:hover { background: var(--cms-border-light); }',
        '.sort-icon { opacity: .4; font-size: .75em; }',
        '.sort-icon.active { opacity: 1; }',
        '.filter-row th { padding: 4px 8px; }',
        '.filter-row input, .filter-row select { font-size: .8rem; }',
        '.col-resize-handle { position: absolute; right: 0; top: 0; bottom: 0; width: 6px; cursor: col-resize; background: transparent; }',
        '.col-resize-handle:hover { background: var(--cms-border-light); }',
        // Action column: hidden on pointer devices when showActionColumn = false;
        // restored on touch devices so users always have a tap-accessible path.
        '.action-col-hidden { display: none; }',
        '@media (hover: none) { .action-col-hidden { display: table-cell !important; } }',
        // Embedded mode: strip card chrome so the grid blends into its host panel.
        '.datagrid-embedded { border: none; box-shadow: none; border-radius: 0; }',
        '.datagrid-embedded table thead tr th { background: transparent; border-bottom: 2px solid var(--cms-border); }',
        // Spacer: expands below the table to fill remaining scroll-container height.
        '.datagrid-spacer { flex: 1; min-height: 40px; }',
        // FIX 3: column-chooser sticky column.
        // overflow:visible overrides the general th rule so the dropdown panel is never clipped.
        '.col-chooser-th { width: 36px; min-width: 36px; padding: 2px 4px; position: relative; overflow: visible; vertical-align: middle; text-align: center; }',
        '.col-chooser-td { width: 36px; min-width: 36px; padding: 0; }',
        // Default truncation for all data cells.
        // Applied only to .data-cell to avoid affecting action/chooser/sentinel <td>s.
        // max-width:0 is the standard trick to make text-overflow fire in auto-layout tables
        // (the actual column width comes from the <th>; max-width:0 just opts the cell out
        // of content-driven width expansion so overflow:hidden can clip correctly).
        'td.data-cell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0; }',
        // Opt-out: set truncate: false on a column definition to allow text to wrap.
        'td.data-cell.no-truncate { white-space: normal; overflow: visible; text-overflow: clip; max-width: none; }',
        // The writable-boolean cell's toggle USED to be defined here. It moved to
 // the kit (`styles.scss`) because a shared control declared in a
        // component's SCOPED styles is shared with nobody — Angular scopes them by
        // default, which is why `cms-toggle` was the only toggle in the admin
        // despite being perfectly reusable. Keeping a copy here would just be two
        // definitions free to drift, which is the same fault the badge modifiers
        // had. The markup is unchanged.
        // Drag preview chip + placeholder slot.
        '.datagrid-drag-preview { background: var(--cms-surface); border: 1px solid var(--cms-border); border-radius: var(--cms-radius); box-shadow: var(--cms-shadow-md); }',
        '.datagrid-drag-handle-glyph { color: var(--cms-text-muted); }',
        '.datagrid-drag-placeholder { height: 37px; background: var(--cms-accent-light); border: 2px dashed var(--cms-accent); opacity: .6; }',
        // Phase 2 DataGrid live -- 2s fade flash on a row whose
        // entity received a live change event from Centrifugo. Uses
        // the existing `--cms-accent-light` warm-cream tone so the
        // attention-getting state matches other admin SPA accents
        // (active button, drag placeholder).
        '@keyframes coolms-datagrid-row-flash { 0% { background-color: var(--cms-accent-light); } 100% { background-color: transparent; } }',
        'tr.cms-datagrid__row--flash { animation: coolms-datagrid-row-flash 2s ease-out; }',
        // Tree mode: matching row in a filtered tree.
        'tr.cms-tree-row--match { background-color: var(--cms-accent-light); }',
        // Tree mode: active drop target during drag-drop reparent.
        'tr.cms-tree-row--drop-target { outline: 2px solid var(--cms-accent); outline-offset: -2px; }',
        // Tree disclosure lead lives inside the first data cell. It is a single
        // inline-block atom so the cell\'s text-overflow ellipsis applies to the trailing
        // label, never to the indent/connector/chevron at the start.
        '.cms-tree-lead { display: inline-block; vertical-align: middle; white-space: nowrap; }',
        '.cms-tree-indent { display: inline-block; vertical-align: middle; }',
        // ONE fixed-width slot per row holds the chevron, the `└` leaf-connector, or
        // nothing — so every first-column label lines up per depth and a child sits
        // exactly one step in. The label follows the slot directly (no extra gap).
        '.cms-tree-toggle { display: inline-block; width: 1.25rem; text-align: center; vertical-align: middle; }',
        // Bare chevron button (no Bootstrap .btn box, which added stray width/padding).
        '.cms-tree-chevron { padding: 0; border: 0; background: none; cursor: pointer; color: var(--cms-text-muted); line-height: 1; vertical-align: middle; }',
        '.cms-tree-chevron:hover { color: var(--cms-accent); }',
        '.cms-tree-connector { color: var(--cms-text-muted); opacity: .55; font-size: .85rem; vertical-align: middle; }',
        // -- Loading skeleton — shimmer placeholder rows on initial load --
        '.cms-skeleton-row td { vertical-align: middle; }',
        '.cms-skeleton-bar { display: block; height: .75rem; border-radius: var(--cms-radius-sm, 4px); width: 70%; background: linear-gradient(90deg, var(--cms-border-light) 25%, var(--cms-border) 37%, var(--cms-border-light) 63%); background-size: 400% 100%; animation: cms-skeleton-shimmer 1.4s ease infinite; }',
        // Vary widths so the rows read as content, not a grid of identical bars.
        '.cms-skeleton-row td:first-child .cms-skeleton-bar { width: 45%; }',
        '.cms-skeleton-row td:nth-child(even) .cms-skeleton-bar { width: 85%; }',
        '@keyframes cms-skeleton-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }',
        // -- Rich cells ------------------------------------------------------
        // Link cell.
        '.dg-link { color: var(--cms-accent-text); text-decoration: none; }',
        '.dg-link:hover { text-decoration: underline; }',
        // Avatar cell: initials/image disc + name (+ optional muted subtitle).
        '.dg-avatar { display: flex; align-items: center; gap: .5rem; min-width: 0; }',
        '.dg-avatar__disc { flex: 0 0 auto; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: .7rem; font-weight: 600; text-transform: uppercase; background: var(--cms-accent-light); color: var(--cms-accent-text); overflow: hidden; }',
 // Shape modifiers. Circle stays the default (identity); square
        // and wide exist for pictures OF things, where a disc crop throws away
        // the image. `wide` is ~16:9, the aspect a share image is authored at.
        '.dg-avatar__disc--square { border-radius: var(--cms-radius-sm, 4px); }',
        '.dg-avatar__disc--wide { width: 48px; border-radius: var(--cms-radius-sm, 4px); }',
        '.dg-avatar__disc img { width: 100%; height: 100%; object-fit: cover; }',
        '.dg-avatar__text { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }',
        '.dg-avatar__name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
        '.dg-avatar__sub { font-size: .78rem; color: var(--cms-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
        // Icon cell: per-row glyph beside the value. The glyph does not
        // shrink — a squashed file-type icon is worse than a truncated name —
        // so only the text takes the ellipsis.
        '.dg-icon-cell { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }',
        '.dg-icon-cell__glyph { flex: 0 0 auto; font-size: 1.05rem; line-height: 1; color: var(--cms-text-muted); }',
        '.dg-icon-cell__text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
        // Snippet cell: multi-line clamp (count set per-column via --dg-snippet-lines).
        '.dg-snippet { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: var(--dg-snippet-lines, 2); line-clamp: var(--dg-snippet-lines, 2); overflow: hidden; white-space: normal; word-break: break-word; font-size: .85rem; color: var(--cms-text); }',
    ],
    templateUrl: './datagrid.component.html',
})
export class DataGridComponent implements OnInit, AfterViewChecked, OnDestroy {
    /** Datagrid config ID (e.g. 'navi_nodes') — required in API-backed mode. */
    readonly gridId        = input('');
    /** Base URL from manifest.dataGrid.configBase — required in API-backed mode. */
    readonly configBaseUrl = input('');
    /** Extra route params merged into API data requests (e.g. { slug: 'main' }). */
    readonly routeParams   = input<Record<string, string>>({});

    /** Optional: pass config directly to skip the config API call. */
    readonly externalConfig = input<DataGridConfig | null>(null);
    /** Optional: pass data directly to skip the data API call (parent manages paging). */
    readonly externalData   = input<DataGridData | null>(null);

    /**
     * Phase 2 DataGrid live -- when set, the component subscribes
     * to `datagrid.{entityAlias}.list` via Centrifugo and emits
     * `liveEvent` per publication. The alias must match the
     * backend `#[ClassMeta(alias: ...)]` declaration (e.g.,
     * 'user'). Leaving this empty disables live updates entirely.
     */
    readonly entityAlias = input<string>('');

    /**
     * When true the outer card border, box-shadow and grid label are suppressed —
     * intended for use inside explorer panels and detail slots where the host
     * already provides the visual container.
     * Defaults to false so all existing standalone usages are unaffected.
     */
    readonly embedded = input<boolean>(false);

    /**
     * Emitted when the gridId config fetch fails (e.g. 404 — type not found or no schema yet).
     * Consumers can use this to show a fallback empty-state UI.
     */
    readonly configError = output<void>();

    /** Emitted for every row action click. */
    readonly rowActionTriggered = output<{ action: string; row: Record<string, unknown> }>();

    /**
     * Emitted ONLY for size transitions to 1 (the selected row) or 0 (null).
     * Backward compatible with the original single-select contract. Multi-select
     * consumers should use rowsSelected instead.
     */
    readonly rowSelected = output<Record<string, unknown> | null>();

    /**
     * Emitted on EVERY selection change with the current selection as an array
     * (empty when nothing is selected). Multi-select consumers wire here.
     */
    readonly rowsSelected = output<ReadonlyArray<Record<string, unknown>>>();

    /**
     * Emitted when the keyboard-navigation focus moves to a different row, or
     * null when focus is cleared (e.g., Esc). Independent of selection -- focus
     * can move without selection during Ctrl+Arrow navigation.
     */
    readonly rowFocused = output<Record<string, unknown> | null>();

    /**
     * Double-click on a row: "open this".
     *
     * The grid had no dblclick handling at all, so every consumer that wanted
     * open-on-activate had to hang a row ACTION off the context menu — a
     * gesture nobody discovers. The tile views (`CmsItemInteractions`, Media,
     * Documents) have meant dblclick = activate; a table that
     * lists the same things should not answer the same gesture differently.
     *
     * Selection is left to the click that precedes it: a dblclick fires click
     * first, so the row is already selected when this arrives.
     */
    readonly rowActivated = output<Record<string, unknown>>();

    /**
     * Emitted when the user right-clicks on the table background (not on a row).
     * The selection is cleared before this event fires.
     */
    readonly backgroundContextMenu = output<MouseEvent>();

    /**
     * Emitted when the user right-clicks on a row, regardless of whether
     * rowActions are configured. Fires after rowSelected (row is already
     * highlighted). Lets the parent render its own page-level overlay when
     * rowActions are empty or when custom menu behaviour is needed.
     */
    readonly rowContextMenu = output<MouseEvent>();

    /**
     * Emitted when a row is dragged to a new position and cfg.reorderRoute is null/absent.
     * The local display order is updated immediately; the parent is responsible for
     * persisting the new sort order (e.g. via a PATCH or POST request).
     */
    readonly dropReorder = output<{ item: Record<string, unknown>; newIndex: number }>();

    /**
     * Emitted when data needs to be loaded (lazy scroll) or reloaded (sort/filter change).
     *
     * - `offset === 0` + `reset === true`  -> caller should replace existing data
     * - `offset > 0`  + `reset === false`  -> caller should append (next page)
     *
     * `sort` is the current sort param string (e.g. '-createdAt'), or null.
     *
     * `columnFilters` contains pre-built RQL filter expressions for all active column
     * filter row inputs, e.g. `['identifier cn "john"', 'isActive eq true']`.
     * The parent appends any additional toolbar-level filters and passes the combined
     * array to the API.  Boolean and numeric values are unquoted; string values are
     * double-quoted with internal quotes escaped.
     */
    readonly loadMore = output<{
        offset:        number;
        sort:          string | null;
        reset:         boolean;
        columnFilters: ReadonlyArray<string>;
        /**
         * The same filters as `columnFilters`, STRUCTURED — for endpoints
         * that take named query params rather than RQL.
         *
         * Most list endpoints are RQL-native (relational, so the RQL
         * visitor builds their DQL) and want `columnFilters` verbatim. A
         * few aren't: the Definitions catalog merges rows across modules
         * in memory, so it exposes `?modules=`/`?definitionKey=`/… and
         * has no RQL parser behind it. Those pages map these entries to
         * their params — far better than regex-parsing the RQL strings
         * back apart.
         */
        activeFilters: ReadonlyArray<ActiveFilter>;
    }>();

    /**
     * Tree-mode chevron expansion. The parent fetches the requested parent's
     * direct children and feeds them back via `setTreeChildren(parentId, rows)`.
     */
    readonly loadChildren = output<LoadChildrenRequest>();

    /**
     * Tree-mode drag-drop. Emitted when the user drops a draggable row onto a
     * row whose `nodeType` matches `tree.dragMove.targetTypes` AND the source
     * is not an ancestor of the target. The parent issues the VFS `mv` and
     * (on success) refreshes the affected branches via `setTreeChildren`.
     */
    readonly moveRequested = output<MoveRequest>();

    /**
     * Emitted when the user toggles a writable boolean cell. The parent is
     * responsible for persisting the change (e.g., PATCH the resource) and for
     * any optimistic UI updates. The new value is the inverse of the row's
     * current value at the moment of the toggle.
     */
    readonly cellValueChanged = output<{
        column: string;
        row:    Record<string, unknown>;
        value:  boolean;
    }>();

    /**
     * Phase 2 DataGrid live -- emitted once per Centrifugo
     * publication on the channel `datagrid.{entityAlias}.list`.
     * The parent decides how to react: typically refetch a single
     * row on `row.updated` and remove the row on `row.deleted`.
     * The DataGrid itself does NOT mutate `externalData` since the
     * parent owns the data signal; instead it flashes the loaded
     * row to give the user visual feedback.
     */
    readonly liveEvent = output<DataGridChangeEvent>();

    @ViewChild('lazySentinel', { static: false })
    private readonly sentinelRef?: ElementRef<HTMLElement>;

    @ViewChild('scrollContainer', { static: false })
    private readonly scrollContainerRef?: ElementRef<HTMLElement>;

    private io?: IntersectionObserver;
    /** Prevents duplicate loadMore emissions while a page is in flight. */
    private readonly loadingMore = signal(false);

    private readonly http        = inject(HttpClient);
    private readonly prefs       = inject(UserPreferencesService);
    private readonly contextMenu = inject(ContextMenuService);
    private readonly liveEvents  = inject(DataGridLiveEventsService);
    private readonly filterWidgetRegistry = inject(DataGridFilterWidgetRegistry);
    private readonly cellWidgetRegistry   = inject(DataGridCellWidgetRegistry);
    /** Reused for `rowActions.showWhen` evaluation in the context menu. */
    private readonly naviGraph   = inject(NaviGraphService);
    private readonly destroyRef  = inject(DestroyRef);
    /**
     * DataGrid Ship C — TZ-aware rendering for `'datetime'` columns. The
     * Calendar prefs service is `providedIn: 'root'` so it always
     * resolves; we only consume `tz()`/`dateFormat()`/`timeFormat()`
     * when projecting `datetime` cells. Same dependency pattern as the
 * range-picker components.
     */
    private readonly userCalendarPrefs = inject(UserCalendarPreferencesService);

    /**
     * Phase 2 DataGrid live -- ids of currently flashing rows.
     * Each entry stays for ~2s while the row-flash CSS animation
     * runs; re-receiving a publication for the same id restarts
     * the timer by re-adding the id to a fresh Set instance.
     */
    protected readonly flashingRowIds = signal<ReadonlySet<string>>(new Set());

    // -- State signals ----------------------------------------------------------
    readonly config  = signal<DataGridConfig | null>(null);
    readonly data    = signal<DataGridData | null>(null);
    readonly loading = signal(false);
    readonly error   = signal<string | null>(null);

    /**
     * Multi-select state: source of truth is the Set of row ids.
     * Click/keyboard handlers mutate this; the template consults it via .has(id).
     */
    readonly selectedRowIds = signal<ReadonlySet<string>>(new Set());

    /** Anchor for Shift+click range select. Set by plain/Ctrl+click; preserved by Shift+click. */
    private readonly lastClickedRowId = signal<string | null>(null);

    /**
     * Keyboard-navigation cursor. Visually distinct from selection (.table-focus).
     * Selection follows focus on plain Arrow nav; on Ctrl+Arrow focus moves alone.
     */
    readonly focusedRowId = signal<string | null>(null);

    /** Backward-compat: previous single-select consumers expected a scalar id. */
    readonly selectedRowId = computed(() => {
        const ids = this.selectedRowIds();
        return ids.size === 1 ? [...ids][0] : null;
    });

    private readonly currentPage = signal(1);
    private readonly sortStateS  = signal<SortState | null>(null);

    /** Applied column filters — each entry has column, op, and value. */
    private readonly filtersS = signal<ReadonlyArray<ActiveFilter>>([]);

    /**
     * Pending display values for debounced text filter inputs.
     * Key: `${column}\0${op}`. Updated immediately on every keypress so the
     * input shows what the user typed before the debounce fires.
     */
    private readonly pendingTextFilters = signal<Record<string, string>>({});

    /** Per-key debounce timers for text filter inputs. */
    private readonly filterTimers = new Map<string, ReturnType<typeof setTimeout>>();

    readonly sortState = this.sortStateS.asReadonly();
    readonly rows      = computed<ReadonlyArray<Record<string, unknown>>>(() => {
        const items = this.data()?.items ?? [];
        // Server/lazy and self-fetching grids: data() is already filtered + sorted
        // server-side — render verbatim.
        if (this.isLazy() || this.externalData() === null) {
            return items;
        }
        // Eager + externalData grids (loadingMode≠lazy, parent supplies the full
        // set — e.g. Cockpit / Leads): there is no server refetch on filter/sort
        // change (toggleSort / afterFiltersChanged only re-emit for lazy grids),
        // so apply BOTH the column filters and the active sort IN MEMORY —
        // otherwise the filter row and sort headers are cosmetic.
        let out = items;
        const filters = this.filtersS();
        if (filters.length > 0) {
            out = out.filter(row => filters.every(f => this.matchesClientFilter(row, f)));
        }
        const sort = this.sortStateS();
        if (sort) {
            const dir = sort.direction === 'desc' ? -1 : 1;
            out = [...out].sort((a, b) => dir * this.compareRows(a[sort.column], b[sort.column]));
        }
        return out;
    });

    /**
     * True when the grid is empty BECAUSE a column filter excluded everything,
     * as opposed to there being nothing to show in the first place.
     *
     * The distinction drives the empty state: "no matches" needs to point at
     * the filter (the row is still on screen, so the fix is one click away),
     * while "nothing yet" should orient a new user instead of implying they
     * searched for something. The grid said "No data found" for both.
     */
    private readonly emptiedByFilter = computed(() => this.filtersS().length > 0);

    /**
     * Empty-state heading. `emptyLabel` from the grid YAML names the thing
     * ("contacts", "backup bundles") so a first run reads "No contacts yet";
     * without it the wording stays generic but still honest.
     */
    readonly emptyStateTitle = computed(() => {
        if (this.emptiedByFilter()) return 'No matches';
        const label = this.config()?.emptyLabel;

        return label ? `No ${label} yet` : 'Nothing here yet';
    });

    /** Only the filtered case gets a hint — it is the one with an action attached. */
    readonly emptyStateHint = computed(() =>
        this.emptiedByFilter() ? 'Try clearing or widening the filters.' : '',
    );

    readonly emptyStateIcon = computed(() => this.emptiedByFilter() ? 'funnel' : 'inbox');

    // -- Tree-mode state --------------------------------------------------------
    //
    // Lazy per-parent children cache. Root rows live in `rows()`; non-root rows
    // come from this map keyed by parent id. Re-collapse retains the cache for
    // instant re-expand; toolbar Reload clears it.
    private readonly treeChildren     = signal<ReadonlyMap<string, ReadonlyArray<Record<string, unknown>>>>(new Map());
    private readonly treeExpanded     = signal<ReadonlySet<string>>(new Set());
    private readonly treeLoading      = signal<ReadonlySet<string>>(new Set());
    /** Highlighted row ids when a filter is active (rows that matched). */
    private readonly treeHighlighted  = signal<ReadonlySet<string>>(new Set());
    /** Snapshot of `treeExpanded` taken when a filter is first applied. */
    private treeExpandedSnapshot: ReadonlySet<string> | null = null;
    /**
     * Parent-supplied filter matches (expand-to-match mode). When set, the
     * filter-expand pass highlights + expands THESE rows' ancestor chains
     * rather than whatever is in the root feed — so the parent can keep the
     * real tree in `externalData` while still surfacing matches that live deep
     * in the tree. Null = no parent-driven matches (flatten fallback: highlight
     * whatever rows the feed carries).
     */
    private readonly filterMatches = signal<ReadonlyArray<Record<string, unknown>> | null>(null);

    /** True when tree mode is active per config. */
    readonly isTree = computed(() => this.config()?.tree?.enabled === true);

    /** True when drag-move is opted in for this grid. */
    readonly isTreeDragMove = computed(() =>
        this.isTree() && this.config()?.tree?.dragMove?.enabled === true,
    );

    /** Allowed `nodeType` values for drop targets when tree drag-move is on. */
    private readonly treeDropTargetTypes = computed<ReadonlySet<string>>(() =>
        new Set(this.config()?.tree?.dragMove?.targetTypes ?? []),
    );

    /**
     * DFS-flattened visible rows for tree mode. Each row carries `_depth` so
     * the template can apply per-level indent.
     * Falls back to flat `rows()` when tree mode is off.
     */
    readonly visibleRows = computed<ReadonlyArray<TreeRow>>(() => {
        if (!this.isTree()) {
            return this.rows().map(r => ({ ...r, _depth: 0 }));
        }
        const expanded = this.treeExpanded();
        const children = this.treeChildren();
        const out: TreeRow[] = [];
        const walk = (parents: ReadonlyArray<Record<string, unknown>>, depth: number): void => {
            for (const row of parents) {
                out.push({ ...row, _depth: depth });
                const id = this.rowId(row);
                if (id !== '' && expanded.has(id)) {
                    const kids = children.get(id);
                    if (kids && kids.length > 0) {
                        walk(kids, depth + 1);
                    }
                }
            }
        };
        walk(this.rows(), 0);
        return out;
    });

    /**
     * The rows that are currently selectable / keyboard-navigable: the
     * DFS-flattened visible rows (roots + expanded children) in tree mode, else
     * the flat root rows. Selection, range-select, reconcile and keyboard nav all
     * operate over THIS — never raw `rows()` — so an expanded child row can be
     * selected/edited without the parent having to merge children into
     * `externalData` (doing so would re-render them as duplicate root rows).
     */
    private selectableRows(): ReadonlyArray<Record<string, unknown>> {
        return this.isTree() ? this.visibleRows() : this.rows();
    }

    /** True when the row has the optimistic-or-computed chevron rendered. */
    rowHasChildren(row: Record<string, unknown>): boolean {
        if (!this.isTree()) return false;
        const strat = this.config()?.tree?.hasChildrenStrategy ?? 'optimistic';
        if (strat === 'computed') return row['hasChildren'] === true;
        // Optimistic: any container-shaped row (Directory) gets a chevron.
        // Falls back to explicit `hasChildren` when present.
        if (row['hasChildren'] === true) return true;
        if (row['hasChildren'] === false) return false;
        return row['nodeType'] === 'directory';
    }

    isRowExpanded(row: Record<string, unknown>): boolean {
        const id = this.rowId(row);
        return id !== '' && this.treeExpanded().has(id);
    }

    isRowLoadingChildren(row: Record<string, unknown>): boolean {
        const id = this.rowId(row);
        return id !== '' && this.treeLoading().has(id);
    }

    isRowHighlighted(row: Record<string, unknown>): boolean {
        const id = this.rowId(row);
        return id !== '' && this.treeHighlighted().has(id);
    }

    /**
     * Leading indent before the fixed-width toggle slot. depth × step puts every
     * row's toggle (chevron / `└` connector / empty) on a clean per-level column,
     * so a child sits exactly one step in from its parent.
     */
    rowIndentPx(row: TreeRow): number {
        return (row._depth ?? 0) * TREE_INDENT_PER_DEPTH_PX;
    }

    /** A nested (child) row -- gets the branch connector + indent in tree mode. */
    rowIsChild(row: TreeRow): boolean {
        return (row._depth ?? 0) > 0;
    }

    /**
     * Stable `*ngFor` identity for grid rows, keyed by the row's id (falls back
     * to the visible index for id-less rows). Without this, `visibleRows()`
     * returns fresh `{...row}` objects on every recompute, so a tree expand/
     * collapse destroyed + recreated the entire <tbody> -- which collapsed the
     * scroll container back to the top. Keying by id reuses the existing rows
     * and only inserts the newly-revealed children.
     */
    readonly trackRow = (index: number, row: Record<string, unknown>): string => {
        const id = this.rowId(row);
        return id !== '' ? id : '__row_' + index;
    };

    /**
     * Toggle the chevron on a tree row. Collapse is purely visual; expand
     * triggers a `(loadChildren)` emission only when the children cache is
     * empty for this parent.
     */
    toggleExpand(row: Record<string, unknown>, event: Event): void {
        event.stopPropagation();
        const id = this.rowId(row);
        if (id === '') return;
        const expanded = new Set(this.treeExpanded());
        if (expanded.has(id)) {
            expanded.delete(id);
            this.treeExpanded.set(expanded);
            return;
        }
        expanded.add(id);
        this.treeExpanded.set(expanded);
        if (!this.treeChildren().has(id)) {
            const loading = new Set(this.treeLoading());
            loading.add(id);
            this.treeLoading.set(loading);
            this.loadChildren.emit({
                parentId: id,
                sort:     this.currentSortParam(),
            });
        }
    }

    /**
     * Double-click a parent row to toggle its expansion — a file-explorer
     * affordance so the whole row is a target, not just the small chevron.
     * No-op for leaf rows and non-tree grids; single-click selection is
     * unaffected (toggleExpand stops propagation so no spurious select fires).
     */
    onRowDblClick(row: Record<string, unknown>, event: MouseEvent): void {
        // In a TREE, dblclick has always meant "expand this branch", and that
        // stays — the gesture is already spoken for on rows that have children.
        if (this.isTree() && this.rowHasChildren(row)) {
            this.toggleExpand(row, event);

            return;
        }

        // Everywhere else it means "open this". The binding existed and
        // returned early for every non-tree grid, so a dblclick on an ordinary
        // row did nothing at all — consumers wanting open-on-activate had to
        // hide it in the context menu.
        this.rowActivated.emit(row);
    }

    /** Pointer cursor hints that an expandable tree row is interactive (double-clickable). */
    rowCursor(row: Record<string, unknown>): string {
        return this.isTree() && this.rowHasChildren(row) ? 'pointer' : 'default';
    }

    /** Placeholder rows rendered while the grid shows its loading skeleton. */
    readonly skeletonRows: readonly number[] = [0, 1, 2, 3, 4, 5];

    /**
     * True during the INITIAL load only — config has arrived (so columns are
     * known) but no rows have yet. Shows shimmer rows so the body doesn't flash
     * blank. A refresh that already has rows keeps them + the "Refreshing…" note.
     *
     * `awaitingRows()` is what covers `externalData` grids: `loading()` tracks
     * the grid's OWN fetch, which a parent-fed lazy grid never makes.
     */
    showSkeleton(): boolean {
        return (this.loading() || this.awaitingRows()) && this.visibleRows().length === 0;
    }

    /**
     * True while a `(loadMore)` request the PARENT owns is in flight.
     *
     * In `loadingMode: lazy` the grid does not fetch: it emits `loadMore` and
     * waits for `externalData` to change. So `loading()` — which only tracks the
     * grid's own HTTP call — is false for that whole window, and with no rows yet
     * the body fell through to the empty state. Every lazy page therefore
     * asserted "No <things> yet" for a beat before its first page landed, which
     * since the empty state started naming the collection reads as a statement of
     * fact rather than a spinner. `loadingMore` is already the in-flight guard;
     * this just exposes it to the template.
     */
    awaitingRows(): boolean {
        return this.loadingMore();
    }

    /**
     * Parent-facing API: set the cached children for a given parent.
     * Clears the loading flag for that parent. Pass an empty array when
     * the fetch returned no rows so the chevron does not look stuck.
     */
    setTreeChildren(parentId: string, rows: ReadonlyArray<Record<string, unknown>>): void {
        const map = new Map(this.treeChildren());
        map.set(parentId, rows);
        this.treeChildren.set(map);
        const loading = new Set(this.treeLoading());
        loading.delete(parentId);
        this.treeLoading.set(loading);
    }

    /**
     * Parent-facing API (tree mode): supply the current filter matches so the
     * grid highlights them and expands-to-match their ancestor chains while the
     * real root tree stays visible in `externalData`. Each match must carry an
     * `ancestorIds` array (RFC-4122 UUIDs of its ancestor Nodes). Pass `null` to
     * clear — e.g. when falling back to a flat match feed, or when the filter is
     * cleared. The expand/highlight is (re)applied by the external-data effect
     * on the next `externalData` change, so set this BEFORE pushing the roots.
     */
    setTreeFilterMatches(matches: ReadonlyArray<Record<string, unknown>> | null): void {
        this.filterMatches.set(matches);
    }

    /** Parent-facing helper: drop all cached children + collapse everything. */
    resetTreeState(): void {
        this.treeChildren.set(new Map());
        this.treeExpanded.set(new Set());
        this.treeLoading.set(new Set());
        this.treeHighlighted.set(new Set());
        this.treeExpandedSnapshot = null;
        this.filterMatches.set(null);
    }

    /**
     * Apply filter-mode expand: take a snapshot of current expansion, then
     * force-expand the union of every row's `ancestorIds` and highlight
     * the matching row ids. Subsequent filter changes update the highlight
     * + expand union without re-taking the snapshot.
     *
     * When the matches carry `ancestorIds` (expand-to-match mode, fed via
     * {@link setTreeFilterMatches}) the matches live deep in the tree, not in
     * the root feed, so we also lazily fetch the children of every force-expanded
     * ancestor — materialising the chain from a visible root down to each match.
     * In the flatten fallback (matches fed as roots, no `ancestorIds`) `expand`
     * is empty, so the lazy-load pass is a no-op and behaviour is unchanged.
     */
    private applyTreeFilterExpand(rows: ReadonlyArray<Record<string, unknown>>): void {
        if (this.treeExpandedSnapshot === null) {
            this.treeExpandedSnapshot = new Set(this.treeExpanded());
        }
        const expand = new Set<string>();
        const highlight = new Set<string>();
        for (const row of rows) {
            const id = this.rowId(row);
            if (id !== '') highlight.add(id);
            const anc = row['ancestorIds'];
            if (Array.isArray(anc)) {
                for (const a of anc) {
                    if (typeof a === 'string' && a !== '') expand.add(a);
                }
            }
        }
        this.treeHighlighted.set(highlight);
        this.treeExpanded.set(expand);
        this.loadFilterExpandedAncestors(expand);
    }

    /**
     * Emit `loadChildren` for every force-expanded ancestor whose children
     * aren't cached yet (and aren't already loading), spinning its chevron. The
     * parent's `(loadChildren)` handler feeds the rows back via
     * {@link setTreeChildren}, and the DFS walk then reveals the path to each
     * match. Ancestor ids that don't correspond to a visible row (e.g. the
     * synthetic VFS root) resolve to an off-tree cache entry — harmless, never
     * rendered. Idempotent: an already-cached/loading ancestor is skipped, so
     * re-running on each filter keystroke doesn't double-fetch.
     */
    private loadFilterExpandedAncestors(expand: ReadonlySet<string>): void {
        const cache   = this.treeChildren();
        const loading = new Set(this.treeLoading());
        let changed = false;
        for (const id of expand) {
            if (!cache.has(id) && !loading.has(id)) {
                loading.add(id);
                changed = true;
                this.loadChildren.emit({ parentId: id, sort: this.currentSortParam() });
            }
        }
        if (changed) {
            this.treeLoading.set(loading);
        }
    }

    /** Restore the pre-filter expand state and clear the highlight + matches. */
    private restoreTreeFilterExpand(): void {
        if (this.treeExpandedSnapshot !== null) {
            this.treeExpanded.set(this.treeExpandedSnapshot);
            this.treeExpandedSnapshot = null;
        }
        this.treeHighlighted.set(new Set());
        this.filterMatches.set(null);
    }

    // -- Column preference signals ----------------------------------------------

    /** Ordered list of visible column field names. */
    readonly visibleColumnFields = signal<string[]>([]);

    /** Per-column widths set by the user via drag-resize. */
    readonly columnWidths = signal<Record<string, number>>({});

    /** Visible column definitions in display order. */
    readonly visibleColumns = computed<DataGridColumnDef[]>(() => {
        const cfg    = this.config();
        const fields = this.visibleColumnFields();
        if (!cfg) return [];
        return fields
            .map(f => cfg.columns.find(c => c.field === f))
            .filter((c): c is DataGridColumnDef => c !== undefined);
    });

    // Resize state — not reactive, managed via DOM events
    private resizing: { field: string; startX: number; startWidth: number } | null = null;

    /** Set when restored widths still need the rest pinned after first render. */
    private pinAfterRender = false;

    /**
     * Computed query-params snapshot — tracked by the effect so that ANY change
     * to page, sort or filters triggers a re-fetch without inadvertently tracking
     * other signals read deeper inside doFetch().
     */
    private readonly rqlQuery = computed(() => this.buildQueryParams());

    /**
     * Pre-built RQL filter expressions for all active column filters.
     * Recomputed whenever filtersS changes. Boolean values are unquoted;
     * string values are double-quoted with internal quotes escaped.
     */
    private readonly columnFilterRql = computed<ReadonlyArray<string>>(() => {
        const cfg = this.config();
        return this.filtersS()
            .filter(f => f.value !== '')
            .map(f => {
                const col = cfg?.columns.find(c => c.field === f.column);
                // OptionSource ship — `in` op: value is a JSON array of
                // tokens already (set by onMultiSelectFilterChange). Emit
                // unquoted so the RQL parser sees `field in ["a","b"]`.
                if (f.op === 'in') {
                    return `${f.column} in ${f.value}`;
                }
                // Boolean, numeric, or literal true/false values: no quotes
                const isRaw = col?.type === 'boolean'
                    || col?.type === 'number'
                    // A filesize IS a number — it only renders differently
                    //, so quoting its bound would break the predicate.
                    || col?.type === 'filesize'
                    || f.value === 'true'
                    || f.value === 'false';
                const val = isRaw ? f.value : `"${f.value.replace(/"/g, '\\"')}"`;
                return `${f.column} ${f.op} ${val}`;
            });
    });

    // -- Lifecycle --------------------------------------------------------------

    constructor() {
        // Phase 2 DataGrid live -- when the entityAlias is provided,
        // subscribe to `datagrid.{alias}.list` once. The input is
        // typically set at component creation and does not change
        // afterwards; the effect captures the first non-empty value
        // and never re-subscribes. takeUntilDestroyed wires cleanup
        // to the component lifecycle.
        let liveSubscribed = false;
        effect(() => {
            const alias = this.entityAlias();
            if ('' === alias || liveSubscribed) {
                return;
            }
            liveSubscribed = true;
            untracked(() => {
                this.liveEvents.watch(alias)
                    .pipe(takeUntilDestroyed(this.destroyRef))
                    .subscribe(event => this.handleLiveEvent(event));
            });
        });

        // Apply external config when provided — skips the API config fetch.
        effect(() => {
            const ext = this.externalConfig();
            if (ext !== null) {
                untracked(() => {
                    this.config.set(ext);
                    this.applyStoredPrefs(ext);
                });
            }
        });

        // Apply external data when provided — skips the API data fetch.
        effect(() => {
            const ext = this.externalData();
            if (ext !== null) {
                untracked(() => {
                    this.data.set(ext);
                    this.loading.set(false);
                    // Only release the in-flight guard when actual data arrives.
                    // An empty items list with hasMore=true is a reset-in-progress
                    // intermediate state: releasing here would let the sentinel's
                    // IntersectionObserver fire a second loadMore before the first
                    // response returns, producing duplicate rows (e.g. 100 instead of 50).
                    if (ext.items.length > 0 || ext.hasMore === false) {
                        this.loadingMore.set(false);
                        // IntersectionObserver is edge-triggered: after we append rows,
                        // the sentinel may still be intersecting but no new event fires.
                        // Re-observing delivers a fresh entry for the current state, so
                        // onSentinelVisible() runs again if more pages are still needed.
                        if (this.io && this.sentinelRef && ext.hasMore !== false) {
                            this.io.unobserve(this.sentinelRef.nativeElement);
                            this.io.observe(this.sentinelRef.nativeElement);
                        }
                    }
                    // Tree-mode filter UX: when a filter is active, snapshot expand
                    // state (once) and force-expand ancestor union; highlight matches.
                    // Expand-to-match mode drives this from the parent-supplied
                    // matches (which carry ancestorIds + live deep in the tree);
                    // the flatten fallback uses the feed rows directly.
                    if (this.isTree() && this.filtersS().length > 0) {
                        this.applyTreeFilterExpand(this.filterMatches() ?? ext.items);
                    }
                });
            }
        });

        // Re-fetch whenever page / sort / filters change (API-backed mode only).
        // rqlQuery() is READ here so the effect tracks all three underlying signals.
        // doFetch() is wrapped in untracked() so that any signal reads inside it
        // (configBaseUrl, gridId, …) don't add spurious dependencies to this effect.
        //
        // IMPORTANT: guard with `externalConfig() === null` so that when a parent
        // provides externalConfig but externalData is transiently null (loading state),
        // we do NOT call doFetch() — that would build the URL as
        // `${configBaseUrl}/${gridId}/data` = `//data` (both inputs default to '').
        effect(() => {
            const params = this.rqlQuery(); // ← tracks currentPage, sortStateS, filtersS
            if (this.externalConfig() === null && this.config() && this.externalData() === null) {
                untracked(() => this.doFetch(params));
            }
        });

        // Re-fetch config when gridId or configBaseUrl changes (e.g., Domain
        // Explorer switches from one dynamic type to another). The ngOnInit
        // fetch only fires once -- without this effect a new gridId is silently
        // ignored and stale config/data remains.
        effect(() => {
            const id   = this.gridId();
            const base = this.configBaseUrl();
            if (this.externalConfig() !== null) return;
            if (!id || !base) return;
            const url = `${base}/${id}`;
            if (this.lastFetchedGridUrl === url) return;
            untracked(() => this.resetAndFetchConfig(url));
        });

        // Drop selection when the underlying rows array changes (pagination,
        // filter, sort, parent reload). Also prunes ids that are no longer
        // present (e.g., a row deleted from outside). Tree mode reconciles
        // against the flattened visible rows so an expanded child stays selected
        // across child loads, and is pruned only when its subtree is collapsed.
        effect(() => {
            const rows = this.isTree() ? this.visibleRows() : this.rows();
            untracked(() => this.reconcileSelectionWithRows(rows));
        });
    }

    ngOnInit(): void {
        // In external-config mode the parent already provides the config; skip API fetch.
        if (this.externalConfig() === null) {
            const id   = this.gridId();
            const base = this.configBaseUrl();
            if (id && base) {
                this.lastFetchedGridUrl = `${base}/${id}`;
            }
            this.fetchConfig();
        }
    }

    private lastFetchedGridUrl: string | null = null;

    private resetAndFetchConfig(url: string): void {
        this.lastFetchedGridUrl = url;
        this.config.set(null);
        this.data.set(null);
        this.filtersS.set([]);
        this.sortStateS.set(null);
        this.currentPage.set(1);
        this.loadingMore.set(false);
        this.error.set(null);
        this.fetchConfig();
    }

    /** Sets up the IntersectionObserver for lazy loading as soon as the sentinel is rendered. */
    ngAfterViewChecked(): void {
        // Restored widths need a rendered header row to measure the REST
        // against. Runs once — pinning clears the flag, and
        // pinCurrentColumnWidths never overwrites a width already set.
        if (this.pinAfterRender && this.scrollContainerRef) {
            this.pinAfterRender = false;
            this.pinCurrentColumnWidths();
        }
        if (!this.io && this.sentinelRef && this.config()?.loadingMode === 'lazy') {
            // root must be the overflow:auto scroll container, not the viewport —
            // the sentinel lives inside the card and the viewport IO never fires
            // as the user scrolls within the container.
            this.io = new IntersectionObserver(
                entries => { if (entries[0].isIntersecting) this.onSentinelVisible(); },
                { threshold: 0.1, root: this.scrollContainerRef?.nativeElement ?? null },
            );
            this.io.observe(this.sentinelRef.nativeElement);
        }
    }

    ngOnDestroy(): void {
        this.io?.disconnect();
        for (const timer of this.filterTimers.values()) clearTimeout(timer);
        for (const timer of this.treeAutoExpandTimers.values()) clearTimeout(timer);
    }

    private onSentinelVisible(): void {
        if (this.loadingMore()) return;
        // In external-data mode the internal `data` signal stays null; the source
        // of truth for hasMore is `externalData`. Checking both covers API-backed
        // mode and parent-managed pagination.
        if (this.data()?.hasMore === false) return;
        if (this.externalData()?.hasMore === false) return;
        const items = this.externalData()?.items ?? this.data()?.items ?? [];
        this.loadingMore.set(true);
        this.loadMore.emit({
            offset:        items.length,
            sort:          this.currentSortParam(),
            reset:         false,
            columnFilters: this.columnFilterRql(),
            activeFilters: this.filtersS(),
        });
    }

    /** Current sort as a query-param string (e.g. '-createdAt'), or null. */
    private readonly currentSortParam = computed((): string | null => {
        const s = this.sortStateS();
        if (!s) return null;
        return `${s.direction === 'desc' ? '-' : ''}${s.column}`;
    });

    /** Derived flag for template: is this grid in lazy-load mode? */
    readonly isLazy = computed(() => this.config()?.loadingMode === 'lazy');

    /**
     * When false, the inline action-button column carries the CSS class
     * `action-col-hidden` which hides it on pointer devices but restores it
     * on touch devices via @media (hover: none).
     */
    readonly showInlineActions = computed(() => this.config()?.showActionColumn !== false);

    /** True when there are hideable columns — controls column-chooser visibility. */
    hasHideableColumns(cfg: DataGridConfig): boolean {
        return cfg.columns.some(c => c.hideable);
    }

    // -- Data fetching ----------------------------------------------------------

    private fetchConfig(): void {
        const id = this.gridId();
        // Skip when gridId is absent -- callers gate rendering via template guards,
        // but this guards against `/datagrids/null` requests during parallel data arrival.
        if (!id || 'null' === id) {
            this.loading.set(false);
            return;
        }
        this.loading.set(true);
        const url = `${this.configBaseUrl()}/${encodeURIComponent(id)}`;
        this.http.get<DataGridConfig>(url).pipe(
            catchError(err => {
                this.error.set(`Failed to load grid config: ${err?.message ?? 'Unknown error'}`);
                this.configError.emit();
                this.loading.set(false);
                return of(null);
            }),
        ).subscribe(cfg => {
            if (cfg) {
                this.config.set(cfg);
                this.applyStoredPrefs(cfg);
                // Only fetch data internally when no external data provider is present.
                // When externalData is provided (lazy-load with parent-managed paging),
                // emit the initial loadMore directly — the sentinel IntersectionObserver
                // may not fire synchronously (e.g. inside overflow:auto containers), so
                // we kick off the first page here. loadingMore guards against duplicates
                // if the IO does also fire later.
                if (this.externalData() === null) {
                    this.fetchData();
                } else {
                    this.loading.set(false);
                    if (cfg.loadingMode === 'lazy') {
                        this.onSentinelVisible();
                    }
                }
            } else {
                this.loading.set(false);
            }
        });
    }

    /** Public fetch helper: builds fresh params and dispatches HTTP request. */
    private fetchData(): void {
        this.doFetch(this.buildQueryParams());
    }

    /** Core HTTP dispatch — always called with a pre-built params snapshot. */
    private doFetch(params: Record<string, string>): void {
        this.loading.set(true);
        const url = `${this.configBaseUrl()}/${encodeURIComponent(this.gridId())}/data`;
        this.http.get<DataGridData>(url, { params }).pipe(
            catchError(err => {
                this.error.set(`Failed to load grid data: ${err?.message ?? 'Unknown error'}`);
                this.loading.set(false);
                return of(null);
            }),
        ).subscribe(d => {
            if (d) {
                this.data.set(d);
                this.error.set(null);
            }
            this.loading.set(false);
        });
    }

    private buildQueryParams(): Record<string, string> {
        const params: Record<string, string> = { page: String(this.currentPage()) };
        Object.assign(params, this.routeParams());
        const sort = this.currentSortParam();
        if (sort) params['sort'] = sort;
        for (const f of this.filtersS()) {
            params[`filter[${f.column}]`] = f.value;
        }
        return params;
    }

    reload(): void {
        this.currentPage.set(1);
        // Tree mode: a full reload invalidates the children cache + expand state.
        if (this.isTree()) {
            this.resetTreeState();
        }
        if (this.externalData() !== null) {
            // Raise the in-flight guard before emitting: the parent will synchronously
            // clear its items (externalData -> empty list), which would otherwise drop
            // loadingMore via the external-data effect and let the sentinel fire twice.
            this.loadingMore.set(true);
            this.loadMore.emit({
                offset:        0,
                sort:          this.currentSortParam(),
                reset:         true,
                columnFilters: this.columnFilterRql(),
                activeFilters: this.filtersS(),
            });
        } else {
            this.fetchData();
        }
    }

    /**
     * Refresh data WITHOUT collapsing the tree. Reloads the root rows and
     * re-fetches the children of every currently-expanded parent, preserving the
     * `treeExpanded` set. Used after an in-place edit (e.g. the page editor's
     * Save) where the tree structure is unchanged but a row's projected fields
     * (variant count, status) may have moved — a plain `reload()` would
     * `resetTreeState()` and collapse everything. Falls back to `reload()` when
     * tree mode is off.
     */
    reloadPreserveTree(): void {
        if (!this.isTree()) {
            this.reload();
            return;
        }
        this.currentPage.set(1);
        const expanded = [...this.treeExpanded()];
        // Spin the chevrons while children re-fetch. The children cache is
        // retained (not cleared) so expanded rows don't flicker to empty —
        // each loadChildren response overwrites its parent's entry as it lands.
        if (expanded.length > 0) {
            const loading = new Set(this.treeLoading());
            for (const id of expanded) loading.add(id);
            this.treeLoading.set(loading);
        }
        if (this.externalData() !== null) {
            this.loadingMore.set(true);
            this.loadMore.emit({
                offset:        0,
                sort:          this.currentSortParam(),
                reset:         true,
                columnFilters: this.columnFilterRql(),
                activeFilters: this.filtersS(),
            });
        } else {
            this.fetchData();
        }
        for (const id of expanded) {
            this.loadChildren.emit({ parentId: id, sort: this.currentSortParam() });
        }
    }

    // -- Column preferences -----------------------------------------------------

    private applyStoredPrefs(cfg: DataGridConfig): void {
        const stored = this.prefs.getGridPref(cfg.id);
        if (stored?.columns) {
            const required = cfg.columns.filter(c => c.required).map(c => c.field);
            // Columns with hideable === false are always visible — they cannot be
            // toggled by the user via the column chooser and must appear regardless
            // of what stored prefs say.  This matters when a grid that previously
            // had hideable columns (prefs were saved) is later reconfigured so all
            // columns are hideable:false — without this, the stored-prefs branch
            // would produce an empty visibleColumnFields and render no columns at all.
            const alwaysOn = cfg.columns
                .filter(c => c.hideable === false && !required.includes(c.field))
                .map(c => c.field);
            const ordered  = [
                ...required,
                ...alwaysOn,
                ...stored.columns.filter(f =>
                    !required.includes(f) &&
                    !alwaysOn.includes(f) &&
                    cfg.columns.some(c => c.field === f && c.hideable),
                ),
            ];
            this.visibleColumnFields.set(ordered);
        } else {
            this.visibleColumnFields.set(
                cfg.columns
                    .filter(c => c.defaultVisible !== false || c.required)
                    .map(c => c.field),
            );
        }
        if (stored?.columnWidths) {
            this.columnWidths.set({ ...stored.columnWidths });
            // A restored width has to HOLD. Under `table-layout: auto`
            // it is advisory and content overrides it, so a column the
            // operator sized last session would quietly spring back. Pinning
            // the rest is deferred to the first render, when there is a header
            // row to measure.
            this.pinAfterRender = Object.keys(stored.columnWidths).length > 0;
        }
    }

    onColumnsChange(fields: string[]): void {
        this.visibleColumnFields.set(fields);
        const gridId = this.config()?.id;
        if (gridId) {
            this.prefs.setColumns(gridId, fields);
        }
    }

    /**
     * Called by the column chooser's Reset button.
     * Resets column visibility + widths to YAML defaults, clears stored prefs,
     * and clears all active column filters.
     */
    onResetAll(): void {
        const cfg = this.config();
        if (!cfg) return;

        // Cancel any pending text-filter debounce timers
        for (const timer of this.filterTimers.values()) clearTimeout(timer);
        this.filterTimers.clear();

        // Clear all active filter state
        this.filtersS.set([]);
        this.pendingTextFilters.set({});

        // Reset columns to YAML defaults (ignore stored prefs)
        const defaults = cfg.columns
            .filter(c => c.defaultVisible !== false || c.required)
            .map(c => c.field);
        this.visibleColumnFields.set(defaults);
        this.columnWidths.set({});
        // Back to content-sized columns: clearing the widths without
        // releasing the pin would leave `table-layout: fixed` with nothing to
        // go on, and every column would render an equal share.
        this.widthsPinned.set(false);
        this.pinAfterRender = false;
        this.prefs.resetGrid(cfg.id);

        // Trigger reload
        if (this.externalData() !== null && this.isLazy()) {
            this.loadingMore.set(true);
            this.loadMore.emit({
                offset:        0,
                sort:          this.currentSortParam(),
                reset:         true,
                columnFilters: [],
                activeFilters: [],
            });
        }
    }

    columnWidth(field: string): number | null {
        return this.columnWidths()[field]
            ?? this.config()?.columns.find(c => c.field === field)?.width
            ?? null;
    }

    // -- Sort -------------------------------------------------------------------

    toggleSort(column: string): void {
        const current = this.sortStateS();
        if (current?.column === column) {
            // Cycle: asc -> desc -> null (clear)
            if (current.direction === 'asc') {
                this.sortStateS.set({ column, direction: 'desc' });
            } else {
                this.sortStateS.set(null);
            }
        } else {
            this.sortStateS.set({ column, direction: 'asc' });
        }
        this.currentPage.set(1);
        // In external-data + lazy mode: notify parent to reset and reload with new sort.
        // Raise the guard first — same sentinel-double-fire prevention as reload().
        if (this.externalData() !== null && this.isLazy()) {
            this.loadingMore.set(true);
            this.loadMore.emit({
                offset:        0,
                sort:          this.currentSortParam(),
                reset:         true,
                columnFilters: this.columnFilterRql(),
                activeFilters: this.filtersS(),
            });
        }
    }

    sortIcon(column: string): string {
        const s = this.sortStateS();
        if (s?.column !== column) return '⇅';
        return s.direction === 'asc' ? '▲' : '▼';
    }

    // -- Column filters ---------------------------------------------------------

    /**
     * Get the applied (post-debounce) filter value for a specific column+operator.
     * For boolean filters use op='eq'. For date-range filters use op='ge' (from) or
     * op='le' (to). For text filters use the column's primary filterOp.
     */
    getFilter(column: string, op: string): string {
        return this.filtersS().find(f => f.column === column && f.op === op)?.value ?? '';
    }

    /**
     * Get the pending (pre-debounce) display value for a text filter input.
     * This tracks what the user has typed before the 300ms debounce fires, so
     * the input shows the correct value at all times.
     */
    getPendingText(column: string, op: string): string {
        return this.pendingTextFilters()[`${column}\0${op}`] ?? '';
    }

    /**
     * Primary RQL operator for a column's filter input.
     * For arrays, returns the first element. Date columns always use separate
     * 'ge'/'le' inputs — this method is not called for date columns.
     */
    getFilterOp(col: DataGridColumnDef): string {
        if (!col.filterOp) return 'eq';
        if (Array.isArray(col.filterOp)) return col.filterOp[0];
        return col.filterOp;
    }

    /** True when this column should show a filter cell in the column filter row. */
    hasColumnFilter(col: DataGridColumnDef): boolean {
        return col.filterable === true && !!col.filterOp;
    }

    /**
     * Returns the enum options array for a column whose type is 'enum'.
     * Backend populates this in column.options.enumOptions as [{value, label}, ...].
     * Returns empty array for any other column type or when options absent.
     */
    getEnumOptions(col: DataGridColumnDef): ReadonlyArray<EnumOption> {
        const opts = col.options?.['enumOptions'];
        return Array.isArray(opts) ? (opts as ReadonlyArray<EnumOption>) : [];
    }

    /**
     * Resolves the displayed label for an enum value by looking up the matching
     * option in the column's enumOptions metadata. Falls back to the raw value
     * if no match (defensive; should not happen with well-formed metadata).
     */
    getEnumLabel(col: DataGridColumnDef, value: unknown): string {
        if (value === null || value === undefined || value === '') return '';
        const opts = this.getEnumOptions(col);
        const match = opts.find(o => String(o.value) === String(value));
        return match?.label ?? String(value);
    }

    /**
     * Maps an enum value to a CMS badge class by convention.
     * Case-insensitive matching against well-known semantic value sets.
     */
    getEnumBadgeClass(value: unknown): string {
        if (value === null || value === undefined || value === '') return 'cms-badge cms-badge--muted';
        const v = String(value).toLowerCase();

        if (POSITIVE_ENUM_VALUES.has(v)) return 'cms-badge cms-badge--success';
        if (NEGATIVE_ENUM_VALUES.has(v)) return 'cms-badge cms-badge--danger';
        if (PENDING_ENUM_VALUES.has(v))  return 'cms-badge cms-badge--warning';
        if (NEUTRAL_ENUM_VALUES.has(v))  return 'cms-badge cms-badge--muted';
        return 'cms-badge cms-badge--muted';
    }

    // --- Rich cell rendering -----------------------------------------------
    //
    // A column's `type` selects a built-in cell renderer (badge / link / avatar
    // / snippet, alongside the historical text / enum / number / date types) and
    // `options` configures it — no per-column FE code. The first branch of the
    // cell cascade is the cell-widget registry (`cellWidget.kind`), the additive
    // escape hatch for anything the built-ins don't express; the helpers below
    // back the type-driven branches.

    /** Bootstrap-badge variants the `badge` cell understands (others ⇒ convention map). */
    private static readonly BADGE_VARIANTS = new Set(['success', 'danger', 'warning', 'info', 'muted']);

    /**
     * CSS class for a `badge`-type cell. `options.badgeMap` ({value: variant})
     * wins; otherwise the convention colour map ({@link getEnumBadgeClass}).
     */
    badgeClass(col: DataGridColumnDef, value: unknown): string {
        const map = col.options?.['badgeMap'];
        if (map && typeof map === 'object') {
            const variant = (map as Record<string, unknown>)[String(value)];
            if (typeof variant === 'string' && DataGridComponent.BADGE_VARIANTS.has(variant)) {
                return `cms-badge cms-badge--${variant}`;
            }
        }
        return this.getEnumBadgeClass(value);
    }

    /**
     * Display text for a `badge`-type cell. `options.badgeLabels` ({value: label})
     * wins; otherwise `options.enumOptions` ({@link getEnumLabel}); else the raw value.
     */
    badgeText(col: DataGridColumnDef, value: unknown): string {
        if (value === null || value === undefined || value === '') return '';
        const labels = col.options?.['badgeLabels'];
        if (labels && typeof labels === 'object') {
            const label = (labels as Record<string, unknown>)[String(value)];
            if (typeof label === 'string') return label;
        }
        return this.getEnumLabel(col, value);
    }

    /** href for a `link`-type cell — `options.hrefPrefix` + (`options.hrefField`|value). */
    linkHref(col: DataGridColumnDef, row: Record<string, unknown>): string {
        const o = col.options ?? {};
        const field = typeof o['hrefField'] === 'string' ? o['hrefField'] : col.field;
        const raw = String(row[field] ?? '');
        if (raw === '') return '';
        const prefix = typeof o['hrefPrefix'] === 'string' ? o['hrefPrefix'] : '';
        return prefix + raw;
    }

    /** Visible text for a `link`-type cell — `options.textField` or the cell value. */
    linkText(col: DataGridColumnDef, row: Record<string, unknown>): string {
        const o = col.options ?? {};
        const field = typeof o['textField'] === 'string' ? o['textField'] : col.field;
        return String(row[field] ?? '');
    }

    /** True when a `link`-type cell should open in a new tab (`options.external`). */
    linkExternal(col: DataGridColumnDef): boolean {
        return col.options?.['external'] === true;
    }

    /** Primary name for an `avatar`-type cell — `options.nameField` or the cell value. */
    avatarName(col: DataGridColumnDef, row: Record<string, unknown>): string {
        const field = col.options?.['nameField'];
        const key = typeof field === 'string' ? field : col.field;
        return String(row[key] ?? '');
    }

    /** Muted subtitle for an `avatar`-type cell — `options.subtitleField` or ''. */
    avatarSubtitle(col: DataGridColumnDef, row: Record<string, unknown>): string {
        const field = col.options?.['subtitleField'];
        return typeof field === 'string' ? String(row[field] ?? '') : '';
    }

    /** Image URL for an `avatar`-type cell — `options.imageField` or '' (⇒ initials). */
    avatarImage(col: DataGridColumnDef, row: Record<string, unknown>): string {
        const field = col.options?.['imageField'];
        return typeof field === 'string' ? String(row[field] ?? '') : '';
    }

    /**
     * Shape of an `avatar` cell's image box — `options.shape`.
     *
     * A circle is an IDENTITY signal: it says "this is a person", which is why
     * it is the default and why Leads, Contacts and Comments keep it. It is the
     * wrong frame for a picture OF something — an og:image is a 1200x630
     * landscape, and centre-cropping it into a 28px disc discards most of the
     * composition and still reads as a face slot.
     *
     *   circle (default) — 28x28 disc, people
     *   square           — 28x28, slightly rounded; icons, logos, 1:1 art
     *   wide             — 48x28 (~16:9), rounded; share images, covers,
     *                      screenshots — anything whose SHAPE is part of it
     */
    avatarShape(col: DataGridColumnDef): string {
        const shape = col.options?.['shape'];

        return 'square' === shape || 'wide' === shape ? String(shape) : 'circle';
    }

    /**
     * Bootstrap-icon class for an `icon` cell — `options.iconField` off the ROW.
     *
     * Per-row rather than per-column because the whole point is that the glyph
     * varies with the value: a folder listing mixes formats, and a column-wide
     * icon would say nothing. Empty string when unset, which the template
     * treats as "no glyph" rather than rendering an empty box.
     */
    iconClass(col: DataGridColumnDef, row: Record<string, unknown>): string {
        const field = col.options?.['iconField'];

        return typeof field === 'string' ? String(row[field] ?? '') : '';
    }

    /** Optional per-row colour for an `icon` cell — `options.colorField`. */
    iconColor(col: DataGridColumnDef, row: Record<string, unknown>): string {
        const field = col.options?.['colorField'];

        return typeof field === 'string' ? String(row[field] ?? '') : '';
    }

    /** Up-to-two-letter initials derived from a name (avatar fallback). */
    avatarInitials(name: string): string {
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    /** Line-clamp count for a `snippet`-type cell (`options.lines`, default 2). */
    snippetLines(col: DataGridColumnDef): number {
        const n = col.options?.['lines'];
        return typeof n === 'number' && n > 0 ? n : 2;
    }

    /**
     * True when the column declares a cell widget whose kind is registered.
     * Gates the first branch of the cell cascade; false ⇒ the cell falls through
     * to the type-driven renderers (so an unknown/unregistered kind never yields
     * an empty cell). Mirrors {@link hasFilterWidget}.
     */
    hasCellWidget(col: DataGridColumnDef): boolean {
        const kind = col.cellWidget?.kind;
        return !!kind && this.cellWidgetRegistry.componentFor(kind) !== null;
    }

    /** Config object passed to a column's cell widget (column `options` merged). */
    cellWidgetConfig(col: DataGridColumnDef): DataGridCellWidgetConfig {
        return {
            column:  col.field,
            label:   col.label,
            options: { ...(col.options ?? {}), ...(col.cellWidget?.options ?? {}) },
        };
    }

    /**
     * Whether this column's cells single-line-truncate. Avatar / snippet cells
     * and custom cell widgets manage their own layout, so they DEFAULT to
     * no-truncate; `truncate` set explicitly wins either way. The template
     * binds the negation as the `.no-truncate` class.
     *
     * The explicit-true case is new and it was a real gap: an avatar
     * column was unconditionally opted out, so `.no-truncate` cleared the
     * `max-width: 0` that makes a cell stop expanding — and under
     * `table-layout: auto` the column's declared `width` is only advisory
     * against content that refuses to shrink. Media's File column, with an
     * 80-character scanner filename in it, took 779px of a 1210px table and
     * pushed Type / Size / Status off-screen. The avatar's own markup was
     * always ready to clip: `.dg-avatar`, `__text`, `__name` and `__sub`
     * already carry `min-width: 0` plus ellipsis. Only the cell around them
     * was refusing to be bounded.
     */
    cellTruncates(col: DataGridColumnDef): boolean {
        if (col.truncate === false) return false;
        if (col.truncate === true) return true;
        if (col.type === 'avatar' || col.type === 'snippet') return false;
        if (this.hasCellWidget(col)) return false;
        return true;
    }

    /** True when at least one visible column has an active filter control. */
    hasFilterableColumns(): boolean {
        return this.visibleColumns().some(c => this.hasColumnFilter(c));
    }

    // --- Filter-widget registry (operator-aware custom filter inputs) ---
    //
    // The first branch of the filter-row cascade: a column declaring a
    // `filterWidget` whose `kind` is registered renders that widget instead
    // of the type-driven input. The widget owns its column's operators (from
    // `filterOp`) and emits one-or-more ActiveFilter entries — so a range
    // widget cleanly emits a ge/le pair, a single-op widget emits one. When
    // no widget is declared (or its kind isn't registered) the row falls
    // through to the historical type-driven inputs below — fully additive.

    /** Full list of RQL operators a column accepts (handed to its filter widget). */
    filterOpsFor(col: DataGridColumnDef): readonly string[] {
        if (!col.filterOp) return ['eq'];
        return Array.isArray(col.filterOp) ? col.filterOp : [col.filterOp];
    }

    /**
     * True when the column declares a filter widget whose kind is registered.
     * Gates the first branch of the filter-row cascade; false ⇒ the row falls
     * through to the type-driven inputs (so an unknown/unregistered kind never
     * yields an empty filter cell).
     */
    hasFilterWidget(col: DataGridColumnDef): boolean {
        if (!this.hasColumnFilter(col)) return false;
        const kind = col.filterWidget?.kind;
        return !!kind && this.filterWidgetRegistry.componentFor(kind) !== null;
    }

    /** Operator-aware config object passed to a column's filter widget. */
    filterWidgetConfig(col: DataGridColumnDef): DataGridFilterWidgetConfig {
        return {
            column:  col.field,
            label:   col.label,
            ops:     this.filterOpsFor(col),
            options: { ...(col.options ?? {}), ...(col.filterWidget?.options ?? {}) },
        };
    }

    /** Current active filters for a column — the value handed to its filter widget. */
    getColumnFilters(col: DataGridColumnDef): readonly ActiveFilter[] {
        return this.filtersS().filter(f => f.column === col.field);
    }

    /** Bridge the filter-widget host's `(filterChange)` to the filter state. */
    onFilterWidgetChange(column: string, updates: readonly ActiveFilter[]): void {
        this.applyColumnFilters(column, updates);
    }

    /**
     * Debounced text filter for `<input type="text">` filter cells.
     *
     * Updates the pending display value immediately (input stays responsive)
     * and applies the filter to the state after a 300ms quiet period.
     * Each column+op pair has its own independent debounce timer.
     */
    setFilter(column: string, op: string, value: string): void {
        const key = `${column}\0${op}`;
        // Update display immediately
        this.pendingTextFilters.update(p => ({ ...p, [key]: value }));
        // Cancel any existing debounce for this column+op
        const existing = this.filterTimers.get(key);
        if (existing !== undefined) clearTimeout(existing);
        // Schedule debounced apply
        const timer = setTimeout(() => {
            this.filterTimers.delete(key);
            this.applyFilter(column, op, value);
        }, 300);
        this.filterTimers.set(key, timer);
    }

    /**
     * Immediate filter for boolean selects, date inputs, and relation selects.
     * No debounce — applies and reloads synchronously.
     */
    setFilterImmediate(column: string, op: string, value: string): void {
        this.applyFilter(column, op, value);
    }

    // --- DataGrid Ship C — Range-picker filter bridges -----------------
    //
 // The three range pickers emit a `{start, end}` payload (or
    // `null`). The DataGrid's filter state stores two `ActiveFilter`
    // entries (op='ge' for the lower bound + op='le' for the upper) so
    // the wire-format with RQL stays exactly the same as before — the
    // pickers are a UI swap only, no contract change.

    /**
     * Reconstruct a {@link DateRangeValue} from the column's current
     * ge/le filter entries so the picker shows what's already applied.
     * Returns `null` when neither bound is set.
     *
     * NOTE: the stored `le` value carries a `T23:59:59.999` suffix to
     * cover datetime-backed columns (see {@link onDateRangeFilterChange}).
     * We strip the suffix back to `YYYY-MM-DD` so the picker re-renders
     * the user-chosen day.
     */
    getDateRangeValue(column: string): DateRangeValue | null {
        const start = this.getFilter(column, 'ge');
        const end   = this.getFilter(column, 'le');
        if (start === '' && end === '') return null;
        return {
            start: start.slice(0, 10),
            end:   end.slice(0, 10),
        };
    }

    /**
     * Bridge `<app-date-range-picker>`'s `(valueChange)` to two
     * immediate filter applies on the same column.
     *
     * `'date'` UI columns are commonly backed by a datetime DB column
     * (e.g. `createdAt`). A bare `le "YYYY-MM-DD"` would be parsed as
     * `YYYY-MM-DD 00:00:00` and silently exclude everything that
     * happened later that day. Widen the upper bound to end-of-day so
     * "from May 30 to May 30" includes a user created at 14:32 on the
     * 30th. The lower bound stays bare (midnight = start-of-day = the
     * correct inclusive lower bound).
     */
    onDateRangeFilterChange(column: string, value: DateRangeValue | null): void {
        const start = value?.start ?? '';
        const end   = value?.end   ?? '';
        this.setFilterImmediate(column, 'ge', start);
        this.setFilterImmediate(column, 'le', end === '' ? '' : `${end}T23:59:59.999`);
    }

    /**
     * Reconstruct a {@link DateTimeRangeValue} from the column's
     * current ge/le entries. Datetime filters never carry an All-day
     * flag in the filter row — the column type is fixed, so the
     * `allDay` slot is always `false` here.
     */
    getDateTimeRangeValue(column: string): DateTimeRangeValue | null {
        const start = this.getFilter(column, 'ge');
        const end   = this.getFilter(column, 'le');
        if (start === '' && end === '') return null;
        return { start, end, allDay: false };
    }

    /**
     * Bridge `<app-datetime-range-picker>`'s `(valueChange)`. The
     * `allDay` flag from the picker is ignored — datetime columns are
     * datetime regardless of picker state (the filter row never shows
     * the All-day toggle, see template).
     */
    onDateTimeRangeFilterChange(column: string, value: DateTimeRangeValue | null): void {
        const start = value?.start ?? '';
        const end   = value?.end   ?? '';
        this.setFilterImmediate(column, 'ge', start);
        this.setFilterImmediate(column, 'le', end);
    }

    /**
     * Reconstruct a {@link TimeRangeValue} from the column's current
     * ge/le entries.
     */
    getTimeRangeValue(column: string): TimeRangeValue | null {
        const start = this.getFilter(column, 'ge');
        const end   = this.getFilter(column, 'le');
        if (start === '' && end === '') return null;
        return { start, end };
    }

    /** Bridge `<app-time-range-picker>`'s `(valueChange)`. */
    onTimeRangeFilterChange(column: string, value: TimeRangeValue | null): void {
        const start = value?.start ?? '';
        const end   = value?.end   ?? '';
        this.setFilterImmediate(column, 'ge', start);
        this.setFilterImmediate(column, 'le', end);
    }

    // --- OptionSource ship — Multi-select filter cell ------------------
    //
    // Columns whose `filterOp` includes `in` and that declare either an
    // inline `options.enumOptions` list OR a tagged `options.source`
    // key render a grouped multi-select instead of a text input. The
    // selected values OR together at the backend RQL level (the column
    // value matches ANY of the picked tokens) — see `columnFilterRql`
    // for the `field in [...]` emission shape.

    /** True when the column should render the multi-option picker filter. */
    hasMultiSelectFilter(col: DataGridColumnDef): boolean {
        if (!this.hasColumnFilter(col)) return false;
        if (!this.opsInclude(col.filterOp, 'in')) return false;
        const opts = col.options ?? {};
        return Array.isArray(opts['enumOptions']) || typeof opts['source'] === 'string';
    }

    private opsInclude(op: string | string[] | undefined, needle: string): boolean {
        if (!op) return false;
        return Array.isArray(op) ? op.includes(needle) : op === needle;
    }

    /**
     * Read the current `in`-filter values for a column. Stored as a
     * JSON array string in the filter state (so `columnFilterRql` can
     * splice it straight into the RQL expression); decoded back to
     * `string[]` here for binding to the picker.
     */
    getMultiSelectValues(field: string): readonly string[] {
        const raw = this.getFilter(field, 'in');
        if ('' === raw) return [];
        try {
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            const out: string[] = [];
            for (const v of parsed) {
                if (typeof v === 'string') out.push(v);
            }
            return out;
        } catch {
            return [];
        }
    }

    /** Static option pool for a column declaring `options.enumOptions`. */
    getMultiSelectOptions(col: DataGridColumnDef): readonly MultiOptionRow[] {
        const opts = col.options?.['enumOptions'];
        if (!Array.isArray(opts)) return [];
        const out: MultiOptionRow[] = [];
        for (const o of opts) {
            if (typeof o === 'object' && o !== null) {
                const row = o as Record<string, unknown>;
                // Empty is a REAL value for some columns (the newsletter's
                // default list is stored as `''`); only a missing/null field is
                // a malformed row. Mirrors `<app-multi-option-select>`'s own
                // lazy-load guard, so static and API-backed pools agree.
                const raw = row['value'];
                if (raw === undefined || raw === null) continue;
                const value = String(raw);
                out.push({
                    value,
                    label:       String(row['label'] ?? value),
                    group:       (row['group'] as string | null | undefined) ?? null,
                    description: (row['description'] as string | null | undefined) ?? null,
                });
            }
        }
        return out;
    }

    /**
     * Build the OptionSource API URL for a column declaring
     * `options.source: <key>`. Empty string when the column uses
     * static `enumOptions` instead.
     */
    getMultiSelectApiUrl(col: DataGridColumnDef): string {
        const src = col.options?.['source'];
        return typeof src === 'string' && '' !== src
            ? `/api/v1/options/${encodeURIComponent(src)}`
            : '';
    }

    /**
     * Bridge `<app-multi-option-select>`'s `(valuesChange)`. Stores the
     * selected list as a JSON array string in filter state (op='in').
     * Empty list = no filter (cleared).
     */
    onMultiSelectFilterChange(column: string, values: readonly string[]): void {
        const serialised = values.length === 0
            ? ''
            : JSON.stringify(values);
        this.setFilterImmediate(column, 'in', serialised);
    }

    // --- DataGrid Ship C — TZ-aware datetime cell rendering -------------

    /**
     * Project a raw cell value (ISO-8601 string, Date, or epoch number)
     * into the user's preferred TZ + date/time format.
     *
     * Format string format follows the Angular `DatePipe` conventions
     * since that's what the previous `'date'`-column cell renderer
     * already used. We compose the user's dateFormat + timeFormat into
     * a single pattern; the `'time'` column case uses timeFormat only.
     */
    /**
     * Byte count -> B / KB / MB / GB.
     *
     * Binary units (1024), matching what every file manager in the product
     * already shows — Media's tiles and the VFS browser both divide by 1024,
     * and a table disagreeing with the tiles beside it about the size of the
     * same file is worse than either convention.
     *
     * Non-numeric input passes through as its own string rather than
     * rendering `NaN B`: a column can be pointed at a field the API stopped
     * sending, and an empty-looking cell is the honest answer.
     */
    formatFileSizeCell(value: unknown): string {
        const bytes = 'number' === typeof value ? value : Number(value);
        if (null === value || undefined === value || '' === value || Number.isNaN(bytes)) {
            return null === value || undefined === value || '' === value ? '' : String(value);
        }
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1048576) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        if (bytes < 1073741824) {
            return `${(bytes / 1048576).toFixed(1)} MB`;
        }

        return `${(bytes / 1073741824).toFixed(1)} GB`;
    }

    formatDateTimeCell(value: unknown, kind: 'date' | 'datetime' | 'time'): string {
        if (value === null || value === undefined || value === '') return '';
        // Lazy-import the DatePipe each call to avoid carrying a stable
        // instance (the user prefs can change at runtime and the
        // formatter doesn't reach into them on its own).
        const tz         = this.userCalendarPrefs.tz() || 'UTC';
        const dateFmt    = this.userCalendarPrefs.dateFormat() || 'yyyy-MM-dd';
        const timeIs12h  = this.userCalendarPrefs.timeFormat() === '12h';
        const timeFmt    = timeIs12h ? 'h:mm a' : 'HH:mm';
        const fmt = kind === 'date'     ? dateFmt
                  : kind === 'time'     ? timeFmt
                  : /* datetime */        `${dateFmt} ${timeFmt}`;
        try {
            // Angular's DatePipe is locale-aware — but at this layer we
            // only need TZ + pattern. Use Intl.DateTimeFormat via a
            // light wrapper for stability across browsers.
            const d = value instanceof Date ? value : new Date(String(value));
            if (Number.isNaN(d.getTime())) return String(value);
            return this.formatWithPattern(d, fmt, tz);
        } catch {
            return String(value);
        }
    }

    /**
     * Minimal pattern formatter matching the subset used by the user
     * prefs (`yyyy-MM-dd`, `dd/MM/yyyy`, `MM/dd/yyyy`, `dd MMM yyyy`,
     * `MMM d, yyyy`, `HH:mm`, `h:mm a`). Single-pass scanner; falls
     * back to ISO if a token is unrecognised.
     */
    private formatWithPattern(d: Date, pattern: string, tz: string): string {
        // Get the date parts via Intl.DateTimeFormat in the target TZ.
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone:    tz,
            year:        'numeric',
            month:       'short',
            day:         '2-digit',
            hour:        '2-digit',
            minute:      '2-digit',
            second:      '2-digit',
            hour12:      false,
        }).formatToParts(d).reduce<Record<string, string>>((acc, p) => {
            if (p.type !== 'literal') acc[p.type] = p.value;
            return acc;
        }, {});
        const yyyy = parts['year']   ?? '';
        const dd   = parts['day']    ?? '';
        const monthShort = parts['month'] ?? '';
        const HH   = parts['hour']   ?? '';
        const mm   = parts['minute'] ?? '';
        // 'MM' (numeric month) — derive from the short name via a lookup
        const monthIdx = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
            .indexOf(monthShort);
        const MM = monthIdx >= 0 ? String(monthIdx + 1).padStart(2, '0') : '01';
        // Numeric day without zero-pad
        const d_ = String(parseInt(dd, 10));
        // 12h hour + AM/PM
        const hourNum = parseInt(HH, 10);
        const hour12  = hourNum % 12 === 0 ? 12 : hourNum % 12;
        const ampm    = hourNum < 12 ? 'AM' : 'PM';
        // Replace tokens longest-first to avoid prefix collisions.
        return pattern
            .replace(/yyyy/g, yyyy)
            .replace(/MMM/g, monthShort)
            .replace(/MM/g, MM)
            .replace(/dd/g, dd)
            .replace(/HH/g, HH)
            .replace(/mm/g, mm)
            .replace(/h/g, String(hour12))
            .replace(/a/g, ampm)
            .replace(/d/g, d_);
    }

    /**
     * Clear a debounced text filter immediately.
     * Cancels any pending debounce for the column+op, clears the display value,
     * and applies the empty filter (removes the column from active filters).
     */
    clearTextFilter(column: string, op: string): void {
        const key = `${column}\0${op}`;
        const existing = this.filterTimers.get(key);
        if (existing !== undefined) { clearTimeout(existing); this.filterTimers.delete(key); }
        this.pendingTextFilters.update(p => { const c = { ...p }; delete c[key]; return c; });
        this.applyFilter(column, op, '');
    }

    /**
     * Apply a filter to the state and trigger a reload in lazy-external mode.
     * Called by setFilter (after debounce), setFilterImmediate, and clearTextFilter.
     */
    private applyFilter(column: string, op: string, value: string): void {
        const others = this.filtersS().filter(f => !(f.column === column && f.op === op));
        this.filtersS.set(value ? [...others, { column, op, value }] : others);
        this.afterFiltersChanged();
    }

    /**
     * Client-side row matcher for eager + externalData grids (see {@link rows}).
     * Mirrors the RQL operators the filter row emits: `cn` (contains, case-
     * insensitive), `eq`/`ne`, `ge`/`le` (numeric when both sides parse as
     * numbers, else lexicographic — covers ISO date/datetime range filters),
     * `in` (JSON array membership), and `nn`/`null` (presence). Unknown ops pass.
     */
    private matchesClientFilter(row: Record<string, unknown>, f: ActiveFilter): boolean {
        const raw = row[f.column];
        const cell = raw === null || raw === undefined ? '' : String(raw);
        const fv = f.value;
        switch (f.op) {
            case 'cn': return cell.toLowerCase().includes(fv.toLowerCase());
            case 'eq': return cell === fv;
            case 'ne': return cell !== fv;
            case 'ge': return this.compareCell(raw, fv) >= 0;
            case 'le': return this.compareCell(raw, fv) <= 0;
            case 'in': {
                let arr: unknown[] = [];
                try { const p: unknown = JSON.parse(fv); if (Array.isArray(p)) arr = p; } catch { /* not JSON */ }
                return arr.map(String).includes(cell);
            }
            case 'nn':   return cell !== '';
            case 'null': return cell === '';
            default:     return true;
        }
    }

    /** Numeric comparison when both sides are numeric, else lexicographic. */
    private compareCell(raw: unknown, filterVal: string): number {
        const n1 = Number(raw);
        const n2 = Number(filterVal);
        if (raw !== null && raw !== '' && !Number.isNaN(n1) && !Number.isNaN(n2)) {
            return n1 - n2;
        }
        const s1 = raw === null || raw === undefined ? '' : String(raw);
        return s1 < filterVal ? -1 : s1 > filterVal ? 1 : 0;
    }

    /**
     * Two-cell comparator for client-mode sorting (see {@link rows}). Numeric
     * when both cells parse as numbers; otherwise a locale-aware, numeric- and
     * case-insensitive string compare (`localeCompare {numeric, sensitivity}`),
     * which also orders ISO date/datetime strings chronologically. Blanks sort
     * as the empty string (first ascending).
     */
    private compareRows(a: unknown, b: unknown): number {
        const na = Number(a);
        const nb = Number(b);
        if (a !== null && a !== '' && b !== null && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) {
            return na - nb;
        }
        const sa = a === null || a === undefined ? '' : String(a);
        const sb = b === null || b === undefined ? '' : String(b);
        return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
    }

    /**
     * Replace ALL active filters for a column with the given set (empty-valued
     * entries dropped). Used by declared filter widgets, which own the entire
     * column's filter row: a range widget emits its `ge`/`le` pair, a single-op
     * widget emits one entry, and a cleared widget emits `[]`. Mirrors
     * {@link applyFilter}'s "empty value = remove" semantics.
     */
    private applyColumnFilters(column: string, updates: readonly ActiveFilter[]): void {
        const others = this.filtersS().filter(f => f.column !== column);
        const valid  = updates.filter(u => u.value !== '' && u.value !== null && u.value !== undefined);
        this.filtersS.set([...others, ...valid]);
        this.afterFiltersChanged();
    }

    /**
     * Side effects shared by every filter mutation (debounced text, immediate,
     * range pickers, and declared filter widgets): reset to page 1, restore the
     * tree expand snapshot when the last filter clears, and re-emit a lazy
     * external reload. Extracted so the filter-widget path stays identical to
     * the historical type-driven paths.
     */
    private afterFiltersChanged(): void {
        this.currentPage.set(1);
        // Tree mode: clearing the last filter restores the pre-filter expand
        // state; applying a filter snapshots once. The actual highlight + new
        // expansion happens after the reload returns and rows arrive (handled
        // in the external-data effect below).
        if (this.isTree() && this.filtersS().length === 0) {
            this.restoreTreeFilterExpand();
        }
        if (this.externalData() !== null && this.isLazy()) {
            this.loadingMore.set(true);
            this.loadMore.emit({
                offset:        0,
                sort:          this.currentSortParam(),
                reset:         true,
                columnFilters: this.columnFilterRql(),
                activeFilters: this.filtersS(),
            });
        }
    }

    // -- Pagination -------------------------------------------------------------

    goToPage(page: number): void {
        this.currentPage.set(page);
    }

    // -- Drag & drop reorder ----------------------------------------------------

    onDrop(event: CdkDragDrop<ReadonlyArray<Record<string, unknown>>>, cfg: DataGridConfig): void {
        if (event.previousIndex === event.currentIndex) return;
        const items = [...(this.data()?.items ?? [])];
        moveItemInArray(items, event.previousIndex, event.currentIndex);

        if (!cfg.reorderRoute) {
            // No endpoint configured: update local display and notify parent.
            this.data.update(d => d ? { ...d, items } : d);
            const movedItem = items[event.currentIndex];
            this.dropReorder.emit({ item: movedItem, newIndex: event.currentIndex });
            return;
        }

        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const reorderedIds = items
            .map((row, i) => ({ id: String(row['id']), sortOrder: (i + 1) * 10 }))
            .filter(item => UUID_RE.test(item.id));
        if (reorderedIds.length === 0) return;
        this.http.patch(cfg.reorderRoute, { items: reorderedIds }, {
            headers: { 'Content-Type': 'application/merge-patch+json' },
            observe: 'response',
        }).pipe(
            catchError(err => {
                this.error.set(`Reorder failed: ${err?.message ?? 'Unknown error'}`);
                return of(null);
            }),
        ).subscribe(res => {
            // res is null only when catchError fired (error path).
            // A 204 No Content delivers null as the body but res.ok === true.
            if (res !== null && res.ok) {
                this.data.update(d => d ? { ...d, items } : d);
            }
        });
    }

    // -- Column resize ----------------------------------------------------------

    /**
     * True once every visible column carries an explicit width, which is what
     * lets the table switch to `table-layout: fixed`.
     *
     * Not on by default: under fixed layout a column with NO width gets an
     * equal share of the table, so turning it on globally would re-flow every
     * grid in the product away from its content-sized defaults. It engages the
     * moment widths are pinned — on the first drag, or on restore when a
     * previous session left some.
     */
    readonly widthsPinned = signal(false);

    /** `table-layout` for the table element — see {@link widthsPinned}. */
    tableLayout(): 'fixed' | 'auto' {
        return this.widthsPinned() ? 'fixed' : 'auto';
    }

    /**
     * Pin the CURRENT rendered width of every visible column.
     *
     * Resizing used to fight `table-layout: auto`: the dragged column's width
     * is only advisory there, so the browser re-solved the whole row and every
     * OTHER column moved too — measured on the users grid, a 150px drag grew
     * the target by 202px and shrank all four neighbours (-123, -17, -20,
     * -42). Freezing the others first is what makes the drag local: they stop
     * being content-derived and become fixed, so there is nothing left to
     * redistribute.
     *
     * Only fills in columns that have no width yet — a width the operator set
     * earlier is never overwritten with a measurement.
     */
    private pinCurrentColumnWidths(): void {
        const host = this.scrollContainerRef?.nativeElement;
        if (!host) return;

        const next: Record<string, number> = { ...this.columnWidths() };
        for (const col of this.visibleColumns()) {
            if (next[col.field] !== undefined) continue;
            // BY FIELD, never by position: the header row carries a leading
            // drag cell and a trailing chooser cell, so index arithmetic
            // silently pins each column to a NEIGHBOUR's width — which looked
            // exactly like the redistribution bug it was meant to fix.
            const th = host.querySelector<HTMLElement>(
                `thead tr:first-child th[data-field="${CSS.escape(col.field)}"]`,
            );
            const w = th ? Math.round(th.getBoundingClientRect().width) : 0;
            if (w > 0) {
                next[col.field] = w;
            }
        }

        this.columnWidths.set(next);
        this.widthsPinned.set(true);
    }

    onResizeStart(event: MouseEvent, field: string): void {
        event.preventDefault();
        event.stopPropagation();
        // Freeze the neighbours BEFORE the drag begins, while they still show
        // the widths the operator can see.
        this.pinCurrentColumnWidths();
        const currentWidth = this.columnWidths()[field]
            ?? this.config()?.columns.find(c => c.field === field)?.width
            ?? 150;
        this.resizing = { field, startX: event.clientX, startWidth: currentWidth };
        const onMove = (e: MouseEvent) => {
            if (!this.resizing) return;
            const delta    = e.clientX - this.resizing.startX;
            const newWidth = Math.max(60, this.resizing.startWidth + delta);
            this.columnWidths.update(w => ({ ...w, [this.resizing!.field]: newWidth }));
        };
        const onUp = () => {
            if (this.resizing) {
                const { field: f } = this.resizing;
                const width  = this.columnWidths()[f] ?? 150;
                const gridId = this.config()?.id;
                if (gridId) {
                    this.prefs.setColumnWidth(gridId, f, width);
                }
            }
            this.resizing = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // -- Row actions ------------------------------------------------------------

    onRowAction(event: { action: DataGridRowAction; row: Record<string, unknown> }): void {
        // Always notify the parent — allows external handling of any action.
        this.rowActionTriggered.emit({ action: event.action.id, row: event.row });

        // Built-in HTTP delete: only when a `route` is configured (API-backed mode).
        if (event.action.id === 'delete' && event.action.route) {
            let url = event.action.route;
            const routeParams: Record<string, string> = event.action.routeParams ?? {};
            for (const [key, token] of Object.entries(routeParams)) {
                const value = String(event.row[token.replace(/[{}]/g, '')] ?? '');
                url = url.replace(`{${key}}`, encodeURIComponent(value));
            }
            this.http.delete(url).pipe(
                catchError(err => {
                    this.error.set(`Delete failed: ${err?.message ?? 'Unknown error'}`);
                    return of(null);
                }),
            ).subscribe(res => {
                if (res !== null) this.fetchData();
            });
        }
    }

    // -- Context menu & row selection ------------------------------------------

    /** Stable id extraction. Empty string when row['id'] is missing. */
    private rowId(row: Record<string, unknown>): string {
        return String(row['id'] ?? '');
    }

    /** Track previous selection size so we know when to fire the single-select event. */
    private lastEmittedSize = 0;

    /**
     * Apply a new selection set + focus + anchor and fire the right output events.
     *
     * Backward-compat contract for rowSelected:
     *   - new size 0 -> emit rowSelected(null)
     *   - new size 1 -> emit rowSelected(theRow)
     *   - new size N>1 -> do not emit rowSelected (existing single-select consumers
     *     never see this case; they use rowsSelected if they care)
     * rowsSelected fires on every change with the current array.
     */
    private applySelection(
        next: ReadonlySet<string>,
        focusId: string | null,
        anchorId: string | null,
    ): void {
        const previousFocus = this.focusedRowId();
        this.selectedRowIds.set(next);
        this.lastClickedRowId.set(anchorId);
        this.focusedRowId.set(focusId);

        const rows = this.selectableRows();
        const selectedRows = rows.filter(r => next.has(this.rowId(r)));
        this.rowsSelected.emit(selectedRows);

        if (next.size === 0 && this.lastEmittedSize !== 0) {
            this.rowSelected.emit(null);
        } else if (next.size === 1) {
            this.rowSelected.emit(selectedRows[0] ?? null);
        }
        this.lastEmittedSize = next.size;

        if (focusId !== previousFocus) {
            const focused = focusId === null
                ? null
                : rows.find(r => this.rowId(r) === focusId) ?? null;
            this.rowFocused.emit(focused);
        }
    }

    /** Inclusive index range from anchor (or focused) to clicked, in display order. */
    private rangeIds(anchorId: string | null, toId: string): string[] {
        const ids = this.selectableRows().map(r => this.rowId(r));
        const toIdx = ids.indexOf(toId);
        if (toIdx < 0) return [];
        const fromIdx = anchorId === null ? toIdx : ids.indexOf(anchorId);
        if (fromIdx < 0) return [toId];
        const lo = Math.min(fromIdx, toIdx);
        const hi = Math.max(fromIdx, toIdx);
        return ids.slice(lo, hi + 1);
    }

    /** Drop ids that are no longer present in the rows list; keeps anchor/focus in sync. */
    private reconcileSelectionWithRows(rows: ReadonlyArray<Record<string, unknown>>): void {
        const valid = new Set(rows.map(r => this.rowId(r)));
        const current = this.selectedRowIds();
        let changed = false;
        const next = new Set<string>();
        for (const id of current) {
            if (valid.has(id)) next.add(id);
            else changed = true;
        }
        const focus  = this.focusedRowId();
        const anchor = this.lastClickedRowId();
        const nextFocus  = focus  !== null && valid.has(focus)  ? focus  : null;
        const nextAnchor = anchor !== null && valid.has(anchor) ? anchor : null;

        if (changed || nextFocus !== focus || nextAnchor !== anchor) {
            this.applySelection(next, nextFocus, nextAnchor);
        }
    }

    onRowClick(row: Record<string, unknown>, event?: MouseEvent): void {
        const id = this.rowId(row);
        const ev = event;
        const ctrl  = !!(ev && (ev.ctrlKey || ev.metaKey));
        const shift = !!(ev && ev.shiftKey);
        const current = this.selectedRowIds();
        const anchor  = this.lastClickedRowId();

        // Ctrl+Shift+click: extend selection with anchor->id range, additive.
        if (ctrl && shift) {
            const next = new Set(current);
            for (const rid of this.rangeIds(anchor, id)) next.add(rid);
            this.applySelection(next, id, anchor);
            return;
        }
        // Shift+click: replace selection with anchor->id range, anchor preserved.
        if (shift) {
            const next = new Set(this.rangeIds(anchor, id));
            this.applySelection(next, id, anchor);
            return;
        }
        // Ctrl/Cmd+click: toggle this row in the selection.
        if (ctrl) {
            const next = new Set(current);
            if (next.has(id)) next.delete(id); else next.add(id);
            this.applySelection(next, id, id);
            return;
        }
        // Plain click on the only-selected row: toggle-deselect (legacy behaviour).
        if (current.size === 1 && current.has(id)) {
            this.applySelection(new Set(), null, null);
            return;
        }
        // Plain click: replace selection with this row.
        this.applySelection(new Set([id]), id, id);
    }

    onCellToggle(col: DataGridColumnDef, row: Record<string, unknown>, evt: Event): void {
        const checked = (evt.target as HTMLInputElement).checked;
        this.cellValueChanged.emit({ column: col.field, row, value: checked });
    }

    /**
     * File-manager pattern:
     *   - right-click on a row IN the current selection -> keep selection, show menu
     *   - right-click on a row OUTSIDE current selection -> replace selection with that row
     */
    onRowContextMenu(event: MouseEvent, row: Record<string, unknown>): void {
        event.preventDefault();
        const id = this.rowId(row);
        if (!this.selectedRowIds().has(id)) {
            this.applySelection(new Set([id]), id, id);
        } else {
            // Already in selection: just move keyboard focus to the right-clicked row.
            this.applySelection(this.selectedRowIds(), id, this.lastClickedRowId());
        }
        this.rowContextMenu.emit(event);

        const cfg = this.config();
        if (!cfg || cfg.rowActions.length === 0) return;
        // Filter actions by their optional row-level `showWhen` predicate
        // so the context menu mirrors the toolbar's gating. Delete on the
        // user's default-personal calendar, for example, is suppressed
        // here via `{field: isDefaultPersonal, op: eq, value: false}`.
        const visibleActions = cfg.rowActions.filter(a =>
            this.naviGraph.matchesShowWhen(a.showWhen, row),
        );
        if (visibleActions.length === 0) return;
        const items: ContextMenuItem[] = visibleActions.map(action => ({
            id:     action.id,
            label:  action.label,
            icon:   action.icon ?? undefined,
            danger: action.id === 'delete',
        }));
        this.contextMenu.open(event, items, actionId => {
            const rowAction = visibleActions.find(a => a.id === actionId);
            if (rowAction) this.onRowAction({ action: rowAction, row });
        });
    }

    /** Clears selection when the user clicks the table background. */
    onBackgroundClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (target.closest('tr[data-row-id]')) return;
        if (this.selectedRowIds().size > 0 || this.focusedRowId() !== null) {
            this.applySelection(new Set(), null, null);
        }
    }

    /** Clears selection and emits backgroundContextMenu on right-click of the background. */
    onBackgroundContextMenu(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (target.closest('tr[data-row-id]')) return;
        event.preventDefault();
        this.applySelection(new Set(), null, null);
        this.backgroundContextMenu.emit(event);
    }

    /**
     * Keyboard navigation. Guarded against form controls so typing is never intercepted.
     *
     * Movement keys (Up/Down/Home/End/PageUp/PageDown):
     *   plain      -> move focus, replace selection with focused row
     *   Shift+key  -> extend selection from anchor to new focus
     *   Ctrl+key   -> move focus only, selection unchanged
     *
     * Other keys:
     *   Ctrl/Cmd+A -> select all visible, focus moves to last
     *   Esc        -> clear selection, focus, anchor
     *   Enter      -> trigger 'edit' rowAction on focused row
     *   Delete     -> trigger 'delete' rowAction on EVERY selected row
     *   Space      -> toggle focused row in selection
     */
    @HostListener('document:keydown', ['$event'])
    onKeyDown(event: KeyboardEvent): void {
        const el = event.target as HTMLElement;
        // Skip editable inputs, including contenteditable hosts (e.g., the
        // Tiptap editor's `<div contenteditable="true">`). Without this guard
        // Enter inside the editor bubbles to document and triggers the grid's
        // 'edit' rowAction -- opening a stacked editor dialog on top of the
        // one the user is typing in.
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return;

        /**
         *  This listener is on `document`, so it fires for keystrokes
         * anywhere on the page — INCLUDING inside a CDK overlay, which
         * renders outside this component's DOM subtree entirely.
         *
         * That is how pressing Delete on the BPMN designer canvas (an
         * SVG — not an input, so the guard above lets it through) fired
         * the Definitions grid's `delete` row action on whatever row was
         * selected behind the dialog. A destructive action on an object
         * the user could not even see. It only became reachable when the
         * Definitions grid gained a `delete` row action; every other
         * grid with one has the same exposure.
         *
         * Two checks, because they catch different shapes: a BACKDROP
         * means something modal owns the page, and an event ORIGINATING
         * inside the overlay container means the user is interacting
         * with a menu/dialog even if it is backdrop-less.
         */
        const doc = el.ownerDocument ?? document;
        if (doc.querySelector('.cdk-overlay-backdrop') !== null) return;
        if (el.closest('.cdk-overlay-container') !== null) return;

        const ids = this.selectableRows().map(r => this.rowId(r));
        if (ids.length === 0 && event.key !== 'Escape') return;

        const ctrl  = event.ctrlKey || event.metaKey;
        const shift = event.shiftKey;
        const focus = this.focusedRowId();
        const focusIdx = focus === null ? -1 : ids.indexOf(focus);

        const arrowDelta =
            event.key === 'ArrowDown' ? 1
            : event.key === 'ArrowUp' ? -1
            : event.key === 'PageDown' ? 10
            : event.key === 'PageUp' ? -10
            : 0;

        if (arrowDelta !== 0) {
            event.preventDefault();
            const nextIdx = focusIdx < 0
                ? (arrowDelta > 0 ? 0 : ids.length - 1)
                : Math.max(0, Math.min(ids.length - 1, focusIdx + arrowDelta));
            this.handleMovement(ids, nextIdx, ctrl, shift);
            return;
        }

        if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            this.handleMovement(ids, event.key === 'Home' ? 0 : ids.length - 1, ctrl, shift);
            return;
        }

        if (event.key === 'Escape') {
            if (this.selectedRowIds().size > 0 || this.focusedRowId() !== null) {
                event.preventDefault();
                this.applySelection(new Set(), null, null);
            }
            return;
        }

        if (ctrl && (event.key === 'a' || event.key === 'A')) {
            event.preventDefault();
            const all = new Set(ids);
            this.applySelection(all, ids[ids.length - 1] ?? null, ids[0] ?? null);
            return;
        }

        if (event.key === ' ' || event.code === 'Space') {
            if (focus === null) return;
            event.preventDefault();
            const next = new Set(this.selectedRowIds());
            if (next.has(focus)) next.delete(focus); else next.add(focus);
            this.applySelection(next, focus, focus);
            return;
        }

        if (event.key === 'Enter') {
            const cfg = this.config();
            if (!cfg || focus === null) return;
            const row = this.selectableRows().find(r => this.rowId(r) === focus);
            const action = cfg.rowActions.find(a => a.id === 'edit');
            if (row && action) { event.preventDefault(); this.onRowAction({ action, row }); }
            return;
        }

        if (event.key === 'Delete') {
            const cfg = this.config();
            if (!cfg) return;
            const action = cfg.rowActions.find(a => a.id === 'delete');
            if (!action) return;
            const selected = this.selectableRows().filter(r => this.selectedRowIds().has(this.rowId(r)));
            if (selected.length === 0) return;
            event.preventDefault();
            // Multi-row delete fires one rowActionTriggered per selected row.
            // Parents that already handle 'delete' on a single row see one event per
            // selected row in their existing code path. No new event surface needed.
            for (const row of selected) this.onRowAction({ action, row });
        }
    }

    private handleMovement(ids: string[], nextIdx: number, ctrl: boolean, shift: boolean): void {
        const nextFocus = ids[nextIdx] ?? null;
        if (nextFocus === null) return;
        if (ctrl) {
            // Focus only -- selection unchanged.
            this.applySelection(this.selectedRowIds(), nextFocus, this.lastClickedRowId());
            return;
        }
        if (shift) {
            const anchor = this.lastClickedRowId() ?? this.focusedRowId() ?? nextFocus;
            const next = new Set(this.rangeIds(anchor, nextFocus));
            this.applySelection(next, nextFocus, anchor);
            return;
        }
        this.applySelection(new Set([nextFocus]), nextFocus, nextFocus);
    }

    // -- Helpers ----------------------------------------------------------------

    rowLabel(row: Record<string, unknown>): string {
        return String(row['title'] ?? row['label'] ?? row['name'] ?? row['id'] ?? '');
    }

    colCount(cfg: DataGridConfig): number {
        // +1 for the always-present column-chooser sticky column (FIX 3).
        // No tree column: in tree mode the disclosure (indent + connector + chevron)
        // lives INSIDE the first data cell, not a dedicated column.
        return this.visibleColumns().length
            + (cfg.draggable ? 1 : 0)
            + (cfg.rowActions.length > 0 ? 1 : 0)
            + 1;
    }

    /**
     * Phase 2 DataGrid live -- routes a typed event to the parent
     * (via `liveEvent` output) and flashes any matching loaded row.
     * `row.created` and `grid.refresh_required` are deferred to
     * Sub-phase D; emitting the output still lets a parent opt in
     * to bespoke handling without waiting for that ship.
     */
    private handleLiveEvent(event: DataGridChangeEvent): void {
        if (event.entityAlias !== this.entityAlias()) {
            return;
        }
        if ((event.type === 'row.updated' || event.type === 'row.deleted')
            && event.entityId !== null
            && this.isRowLoaded(event.entityId)
        ) {
            this.flashRow(event.entityId);
        }
        if (event.type === 'grid.refresh_required') {
            // Hard reset incoming -- cancel any in-progress row
            // flashes since the rows themselves are about to be
            // replaced by the consumer's reload. `row.created` is
            // also emitted to consumers but DataGrid takes no
            // visual action for it in Phase 2: new rows appear
            // when the user scrolls to them via lazy load. Future
            // refinement may prepend if sort matches and top is
            // loaded.
            this.flashingRowIds.set(new Set());
        }
        this.liveEvent.emit(event);
    }

    private isRowLoaded(entityId: string): boolean {
        return this.rows().some(row => String(row['id']) === entityId);
    }

    // -- Tree drag-drop ---------------------------------------------------------
    //
    // HTML5 drag API (not @angular/cdk drag-drop, which is used for the same-
    // level row reorder and is structurally different). Source row sets a
    // DataTransfer payload `{ id, path }` on dragstart; drop target reads the
    // payload, validates against `tree.dragMove.targetTypes` + the self-
    // descendant guard, and emits `(moveRequested)` for the parent to
    // execute the VFS `mv`.
    //
    // Auto-expand-on-hover (~700ms) gives the user file-manager UX: hovering
    // over a collapsed Directory while dragging expands it so the user can
    // drop deeper.

    /** Row id currently being dragged via HTML5 drag-drop (tree mode). */
    protected readonly treeDragSourceId = signal<string | null>(null);

    /** Row id currently a valid drop target (highlighted). */
    protected readonly treeDropTargetId = signal<string | null>(null);

    /** Per-target auto-expand timers. */
    private readonly treeAutoExpandTimers = new Map<string, ReturnType<typeof setTimeout>>();

    onTreeDragStart(event: DragEvent, row: Record<string, unknown>): void {
        if (!this.isTreeDragMove()) return;
        const id = this.rowId(row);
        const path = String(row['vfsPath'] ?? '');
        if (id === '' || path === '') return;
        this.treeDragSourceId.set(id);
        event.dataTransfer?.setData('application/x-coolms-tree-row', JSON.stringify({ id, path }));
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
        }
    }

    onTreeDragEnd(_event: DragEvent): void {
        this.treeDragSourceId.set(null);
        this.treeDropTargetId.set(null);
        for (const timer of this.treeAutoExpandTimers.values()) clearTimeout(timer);
        this.treeAutoExpandTimers.clear();
    }

    onTreeDragOver(event: DragEvent, target: Record<string, unknown>): void {
        if (!this.isTreeDragMove()) return;
        if (!this.isValidDropTarget(target)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        const id = this.rowId(target);
        if (this.treeDropTargetId() !== id) {
            this.treeDropTargetId.set(id);
        }
        if (id !== '' && !this.treeExpanded().has(id) && !this.treeAutoExpandTimers.has(id)) {
            const timer = setTimeout(() => {
                this.treeAutoExpandTimers.delete(id);
                // Re-check that we're still hovering over this target before expanding.
                if (this.treeDropTargetId() === id && this.treeDragSourceId() !== null) {
                    this.toggleExpand(target, new Event('auto-expand'));
                }
            }, TREE_DRAG_AUTO_EXPAND_MS);
            this.treeAutoExpandTimers.set(id, timer);
        }
    }

    onTreeDragLeave(_event: DragEvent, target: Record<string, unknown>): void {
        const id = this.rowId(target);
        if (this.treeDropTargetId() === id) {
            this.treeDropTargetId.set(null);
        }
        const timer = this.treeAutoExpandTimers.get(id);
        if (timer !== undefined) {
            clearTimeout(timer);
            this.treeAutoExpandTimers.delete(id);
        }
    }

    onTreeDrop(event: DragEvent, target: Record<string, unknown>): void {
        if (!this.isTreeDragMove()) return;
        event.preventDefault();
        const payload = event.dataTransfer?.getData('application/x-coolms-tree-row');
        this.treeDropTargetId.set(null);
        for (const timer of this.treeAutoExpandTimers.values()) clearTimeout(timer);
        this.treeAutoExpandTimers.clear();
        if (!payload) return;
        let parsed: { id: string; path: string };
        try {
            parsed = JSON.parse(payload) as { id: string; path: string };
        } catch {
            return;
        }
        if (!this.isValidDropTarget(target)) return;
        const targetId = this.rowId(target);
        const targetPath = String(target['vfsPath'] ?? '');
        if (targetId === '' || targetPath === '') return;
        if (parsed.id === targetId) return;
        if (this.isDescendantPath(targetPath, parsed.path)) return;
        this.moveRequested.emit({
            sourceId:   parsed.id,
            targetId,
            sourcePath: parsed.path,
            targetPath,
        });
    }

    /**
     * True when `target` is allowed as a drop destination per
     * `tree.dragMove.targetTypes` AND the source is set AND the source is not
     * an ancestor of the target.
     */
    private isValidDropTarget(target: Record<string, unknown>): boolean {
        if (!this.isTreeDragMove()) return false;
        const sourceId = this.treeDragSourceId();
        if (sourceId === null) return false;
        const targetId = this.rowId(target);
        if (targetId === '' || targetId === sourceId) return false;
        const nodeType = target['nodeType'];
        if (typeof nodeType !== 'string') return false;
        if (!this.treeDropTargetTypes().has(nodeType)) return false;
        // Self-descendant guard: lookup source path via the rows + children cache.
        const sourcePath = this.findRowPath(sourceId);
        const targetPath = String(target['vfsPath'] ?? '');
        if (sourcePath !== null && targetPath !== '' && this.isDescendantPath(targetPath, sourcePath)) {
            return false;
        }
        return true;
    }

    /** True when `candidatePath` is `sourcePath` itself or a path beneath it. */
    private isDescendantPath(candidatePath: string, sourcePath: string): boolean {
        if (candidatePath === sourcePath) return true;
        return candidatePath.startsWith(sourcePath + '/');
    }

    /** Lookup `vfsPath` for a given row id across roots + cached children. */
    private findRowPath(id: string): string | null {
        for (const row of this.rows()) {
            if (this.rowId(row) === id) return String(row['vfsPath'] ?? '') || null;
        }
        for (const kids of this.treeChildren().values()) {
            for (const row of kids) {
                if (this.rowId(row) === id) return String(row['vfsPath'] ?? '') || null;
            }
        }
        return null;
    }

    isDropTarget(row: Record<string, unknown>): boolean {
        return this.rowId(row) === this.treeDropTargetId();
    }

    private flashRow(entityId: string): void {
        const next = new Set(this.flashingRowIds());
        next.add(entityId);
        this.flashingRowIds.set(next);
        setTimeout(() => {
            const without = new Set(this.flashingRowIds());
            without.delete(entityId);
            this.flashingRowIds.set(without);
        }, 2000);
    }
}
