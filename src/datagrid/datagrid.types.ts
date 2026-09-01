// Typed contract — mirrors DataGridRenderDefinition / DataGridResult PHP VOs exactly.
// No `any` anywhere.

/**
 * Column kinds supported by the DataGrid renderer / filter row.
 *
 * - `text` (default) — string content; debounced text filter.
 * - `boolean`        — Yes/No badge or writable toggle; "All / Yes / No" filter.
 * - `number`         — numeric cell; range filter (ge/le pair).
 * - `filesize`       — a byte count rendered as B/KB/MB/GB. Sorts and filters as
 *                      the NUMBER it is: formatting to a string column instead
 *                      would order "886 B" above "328.4 KB", alphabetically.
 * - `date`           — calendar date (YYYY-MM-DD); date-range picker filter
 *                      (consumes `<app-date-range-picker>`, emits ge/le pair).
 * - `datetime`       — ISO-8601 timestamp; cell rendered in the user's TZ via
 *                      `UserCalendarPreferencesService.tz()`; filter uses
 *                      `<app-datetime-range-picker>` (also TZ-aware).
 * - `time`           — wall-clock time (HH:MM[:SS]); filter uses
 *                      `<app-time-range-picker>` emitting an HH:MM ge/le pair.
 * - `badge`          — value rendered as a coloured pill. `options.badgeMap`
 *                      ({value: variant}) picks the colour, `options.badgeLabels`
 *                      / `options.enumOptions` relabel the text.
 * - `enum`           — backed-enum value rendered as a badge; filter is a
 *                      `<select>` populated from `options.enumOptions`.
 * - `link`           — value rendered as an `<a>`. `options.hrefPrefix`
 *                      (e.g. `mailto:`/`tel:`) prepends the value; `options.hrefField`
 *                      / `options.textField` source URL/text from other fields;
 *                      `options.external: true` opens a new tab.
 * - `avatar`         — initials (or `options.imageField` image) avatar beside the
 *                      value; `options.subtitleField` adds a muted second line.
 * - `snippet`        — multi-line clamped text; `options.lines` sets the clamp.
 *
 * `datetime` + `time` added by DataGrid Ship C; `link`/`avatar`/`snippet` (and the
 * real `badge` renderer) by the rich-cell ship; all other tokens are the
 * historical set inherited from Tree DataGrid Ship A.
 *
 * Anything richer than a built-in is a registered cell widget — see
 * {@link CellWidgetConfigDto} and `provideDataGridCellWidget`.
 */
export type DataGridColumnType =
    | 'text'
    | 'boolean'
    | 'number'
    | 'filesize'
    | 'date'
    | 'datetime'
    | 'time'
    | 'badge'
    | 'enum'
    | 'link'
    | 'avatar'
    // A glyph beside the value — file-type icons and the like.
    // Distinct from `avatar`, whose fallback is INITIALS: a Word document has
    // no initials, and "WE" beside "welcome-letter" is noise where a document
    // icon is information. Reads `options.iconField` (a Bootstrap-icon class)
    // and optional `options.colorField` off the ROW, so the icon can vary per
    // row without the grid knowing anything about formats.
    | 'icon'
    | 'snippet';

/** Single option for an enum-typed column filter (select dropdown). */
export interface EnumOption {
    readonly value: string;
    readonly label: string;
}

/**
 * Declares a custom filter-row input for a column — mirrors the PHP
 * server's filter-widget config value object.
 *
 * `kind` is resolved to an Angular component via the
 * `DataGridFilterWidgetRegistry`; `options` is an opaque per-widget config bag.
 * When present (and the kind is registered) the filter row renders this widget
 * instead of the type-driven input. The operators the widget owns are derived
 * from the column's `filterOp`, not carried here.
 */
export interface FilterWidgetConfigDto {
    readonly kind:     string;
    readonly options?: Record<string, unknown>;
}

/**
 * Declares a custom cell renderer for a column — the display-side twin of
 * {@link FilterWidgetConfigDto}, mirroring the server's `
 * CellWidgetConfig` VO.
 *
 * `kind` is resolved to an Angular component via the `DataGridCellWidgetRegistry`;
 * `options` is an opaque per-widget config bag. When present (and the kind is
 * registered) the column's cells render this widget instead of the `type`-driven
 * renderer. Cells are display-only — the widget receives the value, the row, and
 * the merged config, but no change callback.
 */
export interface CellWidgetConfigDto {
    readonly kind:     string;
    readonly options?: Record<string, unknown>;
}

export interface DataGridColumnDef {
    readonly field:           string;
    readonly label:           string;
    readonly type:            DataGridColumnType;
    readonly sortable:        boolean;
    readonly filterable:      boolean;
    /**
     * RQL operator(s) the backend accepts for this column.
     *
     * When a single value is given the datagrid uses it as-is.
     * When an array is given the first entry is used as the default for the
     * column filter row (date columns always use 'ge'/'le' for from/to).
     * Examples: 'cn', ['cn','eq','bw'], ['gt','lt','ge','le']
     */
    readonly filterOp?:       string | string[];
    /**
     * Optional DB path override for RQL filtering.
     * Populated from the YAML `field:` property on the column definition.
     */
    readonly filterField?:    string;
    readonly required?:       boolean;   // cannot be hidden
    readonly hideable?:       boolean;   // user can toggle visibility
    readonly defaultVisible?: boolean;   // initial visibility when no prefs stored
    /**
     * Boolean-column render hint. When true, the cell renders as an interactive
     * toggle switch that emits (cellValueChanged) on click. When false or
     * omitted, the cell renders as a read-only Yes/No badge.
     */
    readonly writable?:       boolean;
    readonly width?:          number | null;
    /**
     * Arbitrary metadata bag mirrored from PHP `ColumnConfig::$options`.
     * Used by enum columns: `options.enumOptions: EnumOption[]`.
     */
    readonly options?:        Record<string, unknown>;
    /**
     * Optional custom filter-row input (mirrors PHP `ColumnConfig::$filterWidget`).
     * When set and the `kind` is registered, the filter row renders the
     * registered widget instead of the type-driven input. Absent ⇒ historical
     * type-driven behaviour (fully backward compatible).
     */
    readonly filterWidget?:   FilterWidgetConfigDto;
    /**
     * Optional custom cell renderer (mirrors PHP `ColumnConfig::$cellWidget`).
     * When set and the `kind` is registered, the column's cells render the
     * registered widget instead of the `type`-driven renderer. Absent ⇒
     * built-in `type`-driven rendering (fully backward compatible).
     */
    readonly cellWidget?:     CellWidgetConfigDto;
    /**
     * Controls text truncation for data cells in this column.
     *
     * Omitted        -> truncate with ellipsis, EXCEPT for `avatar` / `snippet`
     *                   columns and cell widgets, which lay themselves out.
     * true           -> truncate, including those three. Pair it with
     *                   `width` on a column whose values can be long: under
     *                   `table-layout: auto` a declared width is only advisory
     *                   against content that refuses to shrink.
     * false          -> allow text to wrap (sets white-space:normal on the cell).
     *
     * Truncation uses max-width:0 + overflow:hidden + text-overflow:ellipsis so that
     * the column's table-assigned width (from the <th>) acts as the clipping boundary.
     */
    readonly truncate?:       boolean;
}

export interface DataGridRowAction {
    readonly id:           string;
    readonly label:        string;
    /**
     * API route for built-in HTTP handling (e.g. DELETE on 'delete' action).
     * Omit when the parent component handles the action via (rowActionTriggered).
     */
    readonly route?:       string;
    /** Route param tokens mapped to row field names, used with `route`. */
    readonly routeParams?: Record<string, string>;
    readonly icon?:        string | null;
    readonly confirm:      boolean;
    /**
     * Optional row-level visibility predicate (same shape as the navi
     * toolbar's `showWhen`: `{field, op, value}` with optional
     * `and`/`or` nesting). When set, the DataGrid evaluates the
     * predicate against the row when assembling the right-click
     * context menu — actions that fail are hidden. Mirror of the
     * toolbar gating so Delete on a default-personal calendar (etc.)
     * stays consistent across both surfaces.
     */
    readonly showWhen?:    Record<string, unknown>;
}

/**
 * Drag-move sub-config for tree mode.
 *  - `enabled`     -- false disables drag-drop even when the block is present.
 *  - `targetTypes` -- allowed `nodeType` values for drop targets, typically
 *                     `['directory']`. Drops on non-matching rows are blocked
 *                     by the FE drop-cursor logic.
 */
export interface TreeDragMoveConfigDto {
    readonly enabled:     boolean;
    readonly targetTypes: ReadonlyArray<string>;
}

/**
 * Tree-mode config block. Absent (`undefined`) means flat grid.
 *  - `parentColumn`        -- row key carrying the parent UUID; default `parentId`.
 *  - `hasChildrenStrategy` -- `optimistic` renders chevron on every container
 *                             row; `computed` requires the row to carry
 *                             `hasChildren: bool`.
 *  - `rootFilter`          -- provider-interpreted RQL bounding the root set.
 *  - `dragMove`            -- when present + `enabled: true`, drag-drop on
 *                             rows issues a VFS `mv` via the parent component.
 */
export interface TreeConfigDto {
    readonly enabled:             boolean;
    readonly parentColumn:        string;
    readonly hasChildrenStrategy: 'optimistic' | 'computed';
    readonly rootFilter?:         string;
    readonly dragMove?:           TreeDragMoveConfigDto;
}

export interface DataGridConfig {
    readonly id:          string;
    readonly label:       string;
    /**
     * Plural noun for the empty state — "contacts", "backup bundles" — so an
     * unfiltered empty grid reads "No contacts yet" instead of the generic
     * "Nothing here yet". Optional; the grid falls back when absent.
     *
     * NOT reusing `label`: that is declared `''` in every shipped grid YAML,
     * so it carries nothing to say.
     */
    readonly emptyLabel?: string;
    readonly columns:     ReadonlyArray<DataGridColumnDef>;
    readonly rowActions:  ReadonlyArray<DataGridRowAction>;
    readonly draggable:   boolean;
    readonly reorderRoute?: string | null;
    readonly perPage:     number;
    /**
     * 'eager'  — load all data upfront, show pagination controls (default).
     * 'lazy'   — infinite scroll: DataGrid emits (loadMore) when the sentinel
     *            row enters the viewport; the parent appends data incrementally.
     */
    readonly loadingMode?: 'eager' | 'lazy';
    /**
     * When false, the inline action-button column is hidden; row actions are
     * available only via the right-click context menu.
     * Touch devices (@media hover:none) always show the column regardless.
     * Defaults to true.
     */
    readonly showActionColumn?: boolean;
    /**
     * Tree-mode block. Absent means flat grid (default). When `tree.enabled`
     * is true the FE renders a chevron column + indent and the parent handles
     * per-parent children fetches via `(loadChildren)`.
     */
    readonly tree?: TreeConfigDto;
}

export interface DataGridData {
    readonly items:      ReadonlyArray<Record<string, unknown>>;
    readonly totalItems: number;
    readonly page:       number;
    readonly limit:      number;
    readonly totalPages: number;
    /** For lazy mode: false signals the end of the list (no more pages). */
    readonly hasMore?:   boolean;
}

/**
 * A single active column filter entry.
 * The `op` field carries the RQL operator (e.g. 'cn', 'eq', 'ge', 'le').
 * Date-range columns store two entries for the same column: op='ge' (from) and op='le' (to).
 */
export interface ActiveFilter {
    readonly column: string;
    readonly op:     string;
    readonly value:  string;
}

export interface SortState {
    readonly column:    string;
    readonly direction: 'asc' | 'desc';
}

export interface DataGridApiManifest {
    readonly configBase: string;  // base URL: /api/v1/datagrids
}
