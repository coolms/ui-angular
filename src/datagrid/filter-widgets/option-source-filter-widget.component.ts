import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ActiveFilter } from '../datagrid.types';
import {
    MultiOptionSelectComponent,
    type MultiOptionRow,
} from '../../ui/multi-option-select/multi-option-select.component';
import { DataGridFilterWidgetConfig } from './datagrid-filter-widget-registry';

/**
 * Filter widget (`kind: 'option-source'`) that renders the grouped
 * `<app-multi-option-select>` in the filter row — the reference widget proving
 * the {@link DataGridFilterWidgetRegistry} end-to-end while reusing the existing
 * OptionSource primitive.
 *
 * Reads its options from `config.options`: a static `enumOptions` list and/or a
 * tagged `source` key (-> `/api/v1/options/{source}`), exactly like the
 * type-driven multi-select branch in the grid. It owns the `in` operator
 * (falling back to the column's first operator) and stores the picked tokens as
 * a JSON-array string in a single {@link ActiveFilter} entry — the wire shape
 * `columnFilterRql` already expects. Clearing emits an empty set, which the host
 * relays to drop the column's filter.
 */
@Component({
    selector: 'app-option-source-filter-widget',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MultiOptionSelectComponent],
    template: `
        <app-multi-option-select
                [values]="selectedValues()"
                [options]="staticOptions()"
                [apiUrl]="apiUrl()"
                [placeholder]="placeholder()"
                [entityLabel]="config().label || 'option'"
                (valuesChange)="onChange($event)" />
    `,
})
export class OptionSourceFilterWidgetComponent {
    readonly value = input<readonly ActiveFilter[]>([]);
    // Non-required with an inert default — matches the field-widget builtins,
    // which are likewise instantiated via NgComponentOutlet (the host always
    // supplies a real config, so the default never renders meaningfully).
    readonly config = input<DataGridFilterWidgetConfig>({ column: '', label: '', ops: [], options: {} });
    readonly disabled = input(false);
    readonly valueChange = input<(updates: readonly ActiveFilter[]) => void>(() => {});

    /** The operator this widget owns: `in` when offered, else the column's first op. */
    private readonly op = computed<string>(() => {
        const ops = this.config().ops;
        return ops.includes('in') ? 'in' : ops[0] ?? 'in';
    });

    /** Trigger placeholder — mirrors the type-driven multi-select branch's text. */
    readonly placeholder = computed<string>(() => {
        const label = this.config().label;
        return label ? `— Any ${label} —` : '— Any —';
    });

    /** Static option pool from `options.enumOptions`. Empty when API-backed. */
    readonly staticOptions = computed<readonly MultiOptionRow[]>(() => {
        const raw = this.config().options['enumOptions'];
        if (!Array.isArray(raw)) return [];
        const out: MultiOptionRow[] = [];
        for (const o of raw) {
            if (typeof o === 'object' && o !== null) {
                const row = o as Record<string, unknown>;
                const value = String(row['value'] ?? '');
                if ('' === value) continue;
                out.push({
                    value,
                    label:       String(row['label'] ?? value),
                    group:       (row['group'] as string | null | undefined) ?? null,
                    description: (row['description'] as string | null | undefined) ?? null,
                });
            }
        }
        return out;
    });

    /** OptionSource endpoint from `options.source`, or null for static mode. */
    readonly apiUrl = computed<string | null>(() => {
        const src = this.config().options['source'];
        return typeof src === 'string' && '' !== src
            ? `/api/v1/options/${encodeURIComponent(src)}`
            : null;
    });

    /** Decode the current selection from the column's stored JSON-array filter. */
    readonly selectedValues = computed<readonly string[]>(() => {
        const op = this.op();
        const raw = this.value().find(f => f.op === op)?.value ?? '';
        if ('' === raw) return [];
        try {
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter((v): v is string => typeof v === 'string');
        } catch {
            return [];
        }
    });

    onChange(values: readonly string[]): void {
        const updates: ActiveFilter[] = values.length === 0
            ? []
            : [{ column: this.config().column, op: this.op(), value: JSON.stringify(values) }];
        this.valueChange()(updates);
    }
}
