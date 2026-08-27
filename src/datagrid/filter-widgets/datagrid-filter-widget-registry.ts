import { InjectionToken, Injectable, Type, inject } from '@angular/core';
import { ActiveFilter } from '../datagrid.types';

/**
 * Config handed to a filter widget. Unlike the field-widget contract, this is
 * **operator-aware**: `ops` carries every RQL operator the column accepts (from
 * its `filterOp`), so a range widget knows it owns `ge`/`le` and a single-op
 * widget knows it owns its one operator. `column` is the field key the emitted
 * {@link ActiveFilter} entries must carry; `options` is the column's `options`
 * bag merged with the backend `filterWidget.options`.
 */
export interface DataGridFilterWidgetConfig {
    readonly column:   string;
    readonly label:    string;
    readonly ops:      readonly string[];
    readonly options:  Record<string, unknown>;
}

/**
 * The inputs every filter-widget component receives (passed via
 * `ngComponentOutletInputs`). Parallel to `FieldWidgetInputs`, but the
 * `valueChange` callback emits **one or more** {@link ActiveFilter} entries
 * rather than a single scalar — so a range widget cleanly emits its `ge`/`le`
 * pair and a single-op widget emits one. `value` is the column's current active
 * filters (the subset of the grid's `ActiveFilter[]` for this column), letting a
 * widget reconstruct what's applied. Emitting `[]` clears the column.
 */
export interface DataGridFilterWidgetInputs extends Record<string, unknown> {
    readonly value:       readonly ActiveFilter[];
    readonly config:      DataGridFilterWidgetConfig;
    readonly disabled:    boolean;
    readonly valueChange: (updates: readonly ActiveFilter[]) => void;
}

interface DataGridFilterWidgetEntry {
    readonly kind:      string;
    readonly component: Type<unknown>;
}

/** Multi-provider token a module uses to register a filter widget (see {@link provideDataGridFilterWidget}). */
export const DATAGRID_FILTER_WIDGET = new InjectionToken<readonly DataGridFilterWidgetEntry[]>('DATAGRID_FILTER_WIDGET');

/**
 * Front-end side of the DataGrid filter-widget registry — the operator-aware
 * sibling of `FieldWidgetRegistry`. Maps a widget `kind` (carried by a column's
 * `filterWidget.kind` from `GET /api/v1/datagrids/{id}`) to the Angular
 * component that renders it in the filter row.
 *
 * A module registers its widget once (e.g. `provideDataGridFilterWidget('option-source', …)`
 * in `app.config`); the filter row then resolves the component by kind, so a
 * column declaring a custom filter input needs no edit to the filter-row cascade.
 * When no widget is registered for a column's kind, the filter row falls back to
 * its type-driven input — the registry is additive, never a dead end.
 */
@Injectable({ providedIn: 'root' })
export class DataGridFilterWidgetRegistry {
    private readonly byKind = new Map<string, Type<unknown>>();

    constructor() {
        for (const entry of inject(DATAGRID_FILTER_WIDGET, { optional: true }) ?? []) {
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
 * Register a filter-widget component for a widget `kind`. Add the result to an
 * application's providers (e.g. `app.config.ts`); the component is then used in
 * the filter row wherever a column declares `filterWidget.kind === kind`.
 */
export function provideDataGridFilterWidget(
    kind: string,
    component: Type<unknown>,
): { provide: typeof DATAGRID_FILTER_WIDGET; useValue: DataGridFilterWidgetEntry; multi: true } {
    return { provide: DATAGRID_FILTER_WIDGET, useValue: { kind, component }, multi: true };
}
