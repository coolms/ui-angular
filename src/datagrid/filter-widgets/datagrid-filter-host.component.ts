import { ChangeDetectionStrategy, Component, Type, computed, inject, input, output } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { ActiveFilter } from '../datagrid.types';
import {
    DataGridFilterWidgetConfig,
    DataGridFilterWidgetInputs,
    DataGridFilterWidgetRegistry,
} from './datagrid-filter-widget-registry';

/**
 * Renders the filter widget registered for a `kind` — the single seam the
 * DataGrid filter row goes through to turn a column's `filterWidget.kind` +
 * current filters into a live, operator-aware filter input.
 *
 * Resolves `kind` to a component via {@link DataGridFilterWidgetRegistry} and
 * binds it with the {@link DataGridFilterWidgetInputs} contract through
 * `NgComponentOutlet`. The inner widget's `valueChange` callback is bridged to
 * this host's `(filterChange)` output, so the grid receives the emitted
 * {@link ActiveFilter} entries via a normal output binding (and always knows the
 * column, even when the widget emits an empty "cleared" set).
 *
 * When no widget is registered for the kind it renders nothing — but the grid
 * gates on registry resolution before choosing this branch, so in practice the
 * host only renders when a component resolves.
 */
@Component({
    selector: 'app-datagrid-filter-host',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgComponentOutlet],
    template: `
        @if (component(); as comp) {
            <ng-container [ngComponentOutlet]="comp" [ngComponentOutletInputs]="inputs()" />
        }
    `,
})
export class DataGridFilterHostComponent {
    private readonly registry = inject(DataGridFilterWidgetRegistry);

    /** The widget kind to render (e.g. `option-source`). */
    readonly kind = input<string | null | undefined>();
    /** Current active filters for this column (the widget's value). */
    readonly value = input<readonly ActiveFilter[]>([]);
    /** Operator-aware widget config (column, ops, merged options). */
    readonly config = input.required<DataGridFilterWidgetConfig>();
    /** Whether the input is read-only. */
    readonly disabled = input(false);

    /** Emitted with the widget's full replacement filter set for the column. */
    readonly filterChange = output<readonly ActiveFilter[]>();

    /** The resolved component for {@link kind}, or null when none is registered. */
    readonly component = computed<Type<unknown> | null>(() => this.registry.componentFor(this.kind()));

    /** True when a widget is registered for {@link kind} (else the host renders nothing). */
    readonly resolved = computed(() => this.component() !== null);

    /**
     * Stable callback handed to the inner widget — re-emits as the host's
     * output. Defined once (not in the computed) so the inner widget's `value`
     * input identity stays stable across change-detection runs.
     */
    private readonly emit = (updates: readonly ActiveFilter[]): void => this.filterChange.emit(updates);

    /** Inputs handed to the widget via `ngComponentOutletInputs`. */
    readonly inputs = computed<DataGridFilterWidgetInputs>(() => ({
        value: this.value(),
        config: this.config(),
        disabled: this.disabled(),
        valueChange: this.emit,
    }));
}
