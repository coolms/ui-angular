import { InjectionToken, Injectable, Type, inject } from '@angular/core';

/**
 * Config handed to a cell widget. The display-side twin of
 * `DataGridFilterWidgetConfig`: `column`/`label` identify the column and
 * `options` is the column's `options` bag merged with the backend
 * `cellWidget.options`. Unlike a field/filter widget there is no operator or
 * change channel — cells are read-only.
 */
export interface DataGridCellWidgetConfig {
    readonly column:  string;
    readonly label:   string;
    readonly options: Record<string, unknown>;
}

/**
 * The inputs every cell-widget component receives (passed via
 * `ngComponentOutletInputs`). Parallel to `DataGridFilterWidgetInputs`, but
 * display-only: `value` is the cell value (`row[column]`), `row` is the full row
 * (so a composite cell can read sibling fields), and `config` is the merged
 * descriptor. No `valueChange` — a cell never writes back (row actions and the
 * writable-boolean toggle remain the mutation paths).
 */
export interface DataGridCellWidgetInputs extends Record<string, unknown> {
    readonly value:  unknown;
    readonly row:    Record<string, unknown>;
    readonly config: DataGridCellWidgetConfig;
}

interface DataGridCellWidgetEntry {
    readonly kind:      string;
    readonly component: Type<unknown>;
}

/** Multi-provider token a module uses to register a cell widget (see {@link provideDataGridCellWidget}). */
export const DATAGRID_CELL_WIDGET = new InjectionToken<readonly DataGridCellWidgetEntry[]>('DATAGRID_CELL_WIDGET');

/**
 * Front-end side of the DataGrid cell-widget registry — the display-side sibling
 * of `FieldWidgetRegistry` / `DataGridFilterWidgetRegistry`. Maps a widget `kind`
 * (carried by a column's `cellWidget.kind` from `GET /api/v1/datagrids/{id}`) to
 * the Angular component that renders the column's cells.
 *
 * A module registers its widget once (e.g. `provideDataGridCellWidget('sparkline', …)`
 * in `app.config`); the grid then resolves the component by kind, so a column
 * declaring a custom cell needs no edit to the cell-render cascade. When no
 * widget is registered for a column's kind, the grid falls back to its
 * type-driven cell — the registry is additive, never a dead end.
 */
@Injectable({ providedIn: 'root' })
export class DataGridCellWidgetRegistry {
    private readonly byKind = new Map<string, Type<unknown>>();

    constructor() {
        for (const entry of inject(DATAGRID_CELL_WIDGET, { optional: true }) ?? []) {
            // First registration per kind wins.
            if (!this.byKind.has(entry.kind)) {
                this.byKind.set(entry.kind, entry.component);
            }
        }
    }

    /** The component for the given widget kind, or null when none is registered. */
    componentFor(kind: string | null | undefined): Type<unknown> | null {
        return kind ? this.byKind.get(kind) ?? null : null;
    }
}

/**
 * Register a cell-widget component for a widget `kind`. Add the result to an
 * application's providers (e.g. `app.config.ts`); the component is then used to
 * render cells wherever a column declares `cellWidget.kind === kind`.
 */
export function provideDataGridCellWidget(
    kind: string,
    component: Type<unknown>,
): { provide: typeof DATAGRID_CELL_WIDGET; useValue: DataGridCellWidgetEntry; multi: true } {
    return { provide: DATAGRID_CELL_WIDGET, useValue: { kind, component }, multi: true };
}
