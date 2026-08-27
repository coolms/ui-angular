import { ChangeDetectionStrategy, Component, Type, computed, inject, input } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import {
    DataGridCellWidgetConfig,
    DataGridCellWidgetInputs,
    DataGridCellWidgetRegistry,
} from './datagrid-cell-widget-registry';

/**
 * Renders the cell widget registered for a `kind` — the single seam the DataGrid
 * cell goes through to turn a column's `cellWidget.kind` + a row into custom cell
 * content. The display-side twin of `DataGridFilterHostComponent`.
 *
 * Resolves `kind` to a component via {@link DataGridCellWidgetRegistry} and binds
 * it with the {@link DataGridCellWidgetInputs} contract through
 * `NgComponentOutlet`. When no widget is registered for the kind it renders
 * nothing — but the grid gates on registry resolution before choosing this
 * branch, so in practice the host only renders when a component resolves.
 */
@Component({
    selector: 'app-datagrid-cell-host',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgComponentOutlet],
    template: `
        @if (component(); as comp) {
            <ng-container [ngComponentOutlet]="comp" [ngComponentOutletInputs]="inputs()" />
        }
    `,
})
export class DataGridCellHostComponent {
    private readonly registry = inject(DataGridCellWidgetRegistry);

    /** The widget kind to render (e.g. `sparkline`). */
    readonly kind = input<string | null | undefined>();
    /** The cell value (`row[column]`). */
    readonly value = input<unknown>();
    /** The full row (so a composite cell can read sibling fields). */
    readonly row = input.required<Record<string, unknown>>();
    /** Cell-widget config (column, label, merged options). */
    readonly config = input.required<DataGridCellWidgetConfig>();

    /** The resolved component for {@link kind}, or null when none is registered. */
    readonly component = computed<Type<unknown> | null>(() => this.registry.componentFor(this.kind()));

    /** Inputs handed to the widget via `ngComponentOutletInputs`. */
    readonly inputs = computed<DataGridCellWidgetInputs>(() => ({
        value: this.value(),
        row: this.row(),
        config: this.config(),
    }));
}
