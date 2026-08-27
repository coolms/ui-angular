
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, debounceTime, of, switchMap } from 'rxjs';

import {
    FieldDescriptor,
    FieldType,
    FilterRow,
    OPERATOR_LABELS,
    VALUELESS_OPERATORS,
    VirtualFieldDescriptor,
} from './cms-filter-builder.types';
import { EntityFieldsService } from './entity-fields.service';

/** Phase X-2.5b -- the normalized shape the builder iterates over:
 *  every selectable field carries an `isVirtual` flag plus an
 *  optional description that powers the row-level tooltip. Stored
 *  fields carry `isVirtual: false` and `description: null`; virtual
 *  fields are projected onto the same shape so the template's
 *  type-aware value-input switch can dispatch identically. */
type FilterField = FieldDescriptor & {
    readonly isVirtual: boolean;
    readonly description: string | null;
};

/**
 * Phase X-2.6a — generic, entity-agnostic filter builder.
 *
 * Reads the X-2.5 endpoint's field descriptors and renders an
 * AND-chained criterion editor on top. Each row has a field
 * selector (filterable fields only), an operator selector (per
 * descriptor's `filterOperators`), and a type-aware value input.
 *
 * Emits the composed RQL `filter=` body on every change, debounced
 * 300ms. Empty / all-blank rows compose to the empty string — the
 * host treats that as "no criteria" and disables the wizard's
 * "Preview audience" call.
 *
 * The builder owns the criterion list locally (signal) for
 * encapsulation; the host receives only the RQL string. Round-trip
 * editing of pre-existing RQL is out of scope for X-2.6a — wizards
 * start from a blank slate.
 */
@Component({
    selector: 'cms-filter-builder',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <div class="cms-filter-builder">
            @if (loading()) {
                <div class="cms-filter-builder__state">Loading filter options…</div>
            } @else if (error()) {
                <div class="cms-filter-builder__state cms-filter-builder__state--error">
                    {{ error() }}
                </div>
            } @else if (filterableFields().length === 0) {
                <div class="cms-filter-builder__state">
                    No filterable fields are declared for this entity type.
                </div>
            } @else {
                @for (row of rows(); track row.id) {
                    <div class="cms-filter-builder__row">
                        <div class="cms-filter-builder__field-cell">
                            <select class="cms-filter-builder__field"
                                    [ngModel]="row.field"
                                    (ngModelChange)="updateField(row.id, $event)">
                                @for (f of filterableFields(); track f.field) {
                                    <option [value]="f.field"
                                            [title]="f.description ?? ''">{{ f.label }}{{ f.isVirtual ? ' (computed)' : '' }}</option>
                                }
                            </select>
                            @if (descriptorFor(row.field); as desc) {
                                @if (desc.isVirtual) {
                                    <span class="cms-filter-builder__virtual-badge"
                                          [title]="desc.description ?? 'Computed field'">computed</span>
                                }
                            }
                        </div>

                        <select class="cms-filter-builder__op"
                                [ngModel]="row.operator"
                                (ngModelChange)="updateOperator(row.id, $event)">
                            @for (op of operatorsFor(row.field); track op) {
                                <option [value]="op">{{ operatorLabel(op) }}</option>
                            }
                        </select>

                        @if (!isValueless(row.operator)) {
                            @switch (typeFor(row.field)) {
                                @case ('bool') {
                                    <select class="cms-filter-builder__value"
                                            [ngModel]="row.value"
                                            (ngModelChange)="updateValue(row.id, $event === 'true')">
                                        <option [value]="true">true</option>
                                        <option [value]="false">false</option>
                                    </select>
                                }
                                @case ('int') {
                                    <input class="cms-filter-builder__value"
                                           type="number"
                                           step="1"
                                           [ngModel]="row.value"
                                           (ngModelChange)="updateValue(row.id, parseNumeric($event, 'int'))" />
                                }
                                @case ('float') {
                                    <input class="cms-filter-builder__value"
                                           type="number"
                                           [ngModel]="row.value"
                                           (ngModelChange)="updateValue(row.id, parseNumeric($event, 'float'))" />
                                }
                                @case ('date') {
                                    <input class="cms-filter-builder__value"
                                           type="date"
                                           [ngModel]="row.value"
                                           (ngModelChange)="updateValue(row.id, $event)" />
                                }
                                @case ('enum') {
                                    <select class="cms-filter-builder__value"
                                            [ngModel]="row.value"
                                            (ngModelChange)="updateValue(row.id, $event)">
                                        @for (entry of enumEntriesFor(row.field); track entry.value) {
                                            <option [value]="entry.value">{{ entry.label }}</option>
                                        }
                                    </select>
                                }
                                @default {
                                    <input class="cms-filter-builder__value"
                                           type="text"
                                           [ngModel]="row.value"
                                           (ngModelChange)="updateValue(row.id, $event)" />
                                }
                            }
                        } @else {
                            <span class="cms-filter-builder__value cms-filter-builder__value--noop"></span>
                        }

                        <button type="button"
                                class="cms-filter-builder__remove"
                                aria-label="Remove criterion"
                                (click)="removeRow(row.id)">×</button>
                    </div>
                }

                <button type="button"
                        class="cms-filter-builder__add"
                        (click)="addRow()">
                    + Add criterion
                </button>
            }
        </div>
    `,
    styles: [
        `
            .cms-filter-builder {
                display: flex;
                flex-direction: column;
                gap: .5rem;
            }
            .cms-filter-builder__state {
                color: var(--cms-text-secondary);
                padding: .5rem 0;
            }
            .cms-filter-builder__state--error {
                color: var(--cms-danger);
            }
            .cms-filter-builder__row {
                display: grid;
                grid-template-columns: minmax(120px, 1fr) minmax(120px, 1fr) minmax(180px, 2fr) auto;
                gap: .5rem;
                align-items: center;
            }
            .cms-filter-builder__field-cell {
                display: flex;
                align-items: center;
                gap: .35rem;
                min-width: 0;
            }
            .cms-filter-builder__field-cell .cms-filter-builder__field {
                flex: 1 1 auto;
                min-width: 0;
            }
            .cms-filter-builder__virtual-badge {
                flex: 0 0 auto;
                display: inline-block;
                padding: 1px 8px;
                font-size: .7rem;
                font-weight: 500;
                background: var(--cms-border-light);
                color: var(--cms-text-secondary);
                border-radius: var(--cms-radius-sm);
                text-transform: lowercase;
                cursor: help;
            }
            .cms-filter-builder__field,
            .cms-filter-builder__op,
            .cms-filter-builder__value {
                padding: .35rem .5rem;
                border: 1px solid var(--cms-border);
                border-radius: 4px;
                background: var(--cms-surface);
                color: var(--cms-text);
                font: inherit;
            }
            .cms-filter-builder__value--noop {
                background: transparent;
                border-color: transparent;
            }
            .cms-filter-builder__remove {
                border: 1px solid var(--cms-border);
                background: var(--cms-btn-bg);
                color: var(--cms-text-secondary);
                width: 1.75rem;
                height: 1.75rem;
                border-radius: 4px;
                cursor: pointer;
            }
            .cms-filter-builder__remove:hover {
                color: var(--cms-danger);
                border-color: var(--cms-danger);
            }
            .cms-filter-builder__add {
                align-self: flex-start;
                padding: .35rem .75rem;
                border: 1px dashed var(--cms-border);
                background: transparent;
                color: var(--cms-text-secondary);
                border-radius: 4px;
                cursor: pointer;
            }
            .cms-filter-builder__add:hover {
                color: var(--cms-text);
                border-color: var(--cms-text-secondary);
            }
        `,
    ],
})
export class CmsFilterBuilderComponent {
    private readonly fields = inject(EntityFieldsService);
    private readonly destroyRef = inject(DestroyRef);

    /** Entity alias to load filters for. */
    readonly entityAlias = input.required<string>();

    /** Emitted whenever the composed RQL `filter=…` body changes
     *  (debounced 300ms). Empty list yields `''`. */
    readonly rqlChange = output<string>();

    /** All stored fields the endpoint reported. */
    private readonly allFields = signal<ReadonlyArray<FieldDescriptor>>([]);
    /** Phase X-2.5b -- virtual (computed) fields reported under the
     *  endpoint's `virtualFields` slot. Empty when the entity
     *  declares no virtual fields. */
    private readonly virtualFields = signal<ReadonlyArray<VirtualFieldDescriptor>>([]);
    /** Filterable union -- stored filterable fields followed by
     *  virtual fields (virtuals are implicitly filterable). Virtual
     *  fields are projected onto the same shape as stored fields so
     *  every template branch downstream of selection treats them
     *  identically. */
    protected readonly filterableFields = computed<ReadonlyArray<FilterField>>(() => {
        const stored: FilterField[] = this.allFields()
            .filter((f) => f.filterable)
            .map((f) => ({ ...f, isVirtual: false, description: null }));
        const virtual: FilterField[] = this.virtualFields().map((v) => ({
            field: v.name,
            label: v.label,
            type: v.filterType,
            filterable: true,
            filterOperators: v.allowedOps,
            sortable: false,
            searchable: false,
            enumValues: null,
            isVirtual: true,
            description: v.description,
        }));
        return [...stored, ...virtual];
    });

    protected readonly loading = signal(false);
    protected readonly error = signal<string | null>(null);

    /** Active criterion list. */
    protected readonly rows = signal<ReadonlyArray<FilterRow>>([]);

    /** Push-through subject for debouncing emits. */
    private readonly rqlSubject = new Subject<string>();

    constructor() {
        // Load fields whenever the alias changes. toObservable + switchMap
        // mirrors the EntitySearchService consumer pattern used in the
        // entity picker.
        toObservable(this.entityAlias)
            .pipe(
                switchMap((alias) => {
                    if (!alias) {
                        return of(null);
                    }
                    this.loading.set(true);
                    this.error.set(null);
                    return this.fields.fetch(alias).pipe(
                        catchError((err) => {
                            this.error.set(
                                err?.error?.detail ??
                                    err?.statusText ??
                                    'Could not load filter fields for this entity.',
                            );
                            return of(null);
                        }),
                    );
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((response) => {
                this.loading.set(false);
                this.allFields.set(response?.fields ?? []);
                this.virtualFields.set(response?.virtualFields ?? []);
                // Reset rows whenever the alias changes — stale criteria
                // referencing a different entity's fields would emit
                // invalid RQL.
                this.rows.set([]);
                this.emit('');
            });

        this.rqlSubject
            .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
            .subscribe((rql) => this.rqlChange.emit(rql));

        // Recompose RQL whenever rows mutate.
        effect(() => {
            const rql = this.composeRql(this.rows());
            this.rqlSubject.next(rql);
        });
    }

    // ─── Row mutation ────────────────────────────────────────────────────

    protected addRow(): void {
        const first = this.filterableFields()[0];
        if (!first) {
            return;
        }
        const initialOp = first.filterOperators[0] ?? 'eq';
        const row: FilterRow = {
            id: this.nextRowId(),
            field: first.field,
            operator: initialOp,
            value: this.defaultValueFor(first, initialOp),
        };
        this.rows.set([...this.rows(), row]);
    }

    protected removeRow(id: string): void {
        this.rows.set(this.rows().filter((r) => r.id !== id));
    }

    protected updateField(id: string, field: string): void {
        const meta = this.filterableFields().find((f) => f.field === field);
        if (!meta) {
            return;
        }
        const newOp = meta.filterOperators[0] ?? 'eq';
        this.rows.set(
            this.rows().map((r) =>
                r.id === id
                    ? { ...r, field, operator: newOp, value: this.defaultValueFor(meta, newOp) }
                    : r,
            ),
        );
    }

    protected updateOperator(id: string, operator: string): void {
        this.rows.set(
            this.rows().map((r) =>
                r.id === id
                    ? {
                          ...r,
                          operator,
                          // Drop the value when switching into a valueless
                          // operator so stale data doesn't leak into RQL
                          // composition.
                          value: VALUELESS_OPERATORS.has(operator) ? null : r.value,
                      }
                    : r,
            ),
        );
    }

    protected updateValue(id: string, value: unknown): void {
        this.rows.set(this.rows().map((r) => (r.id === id ? { ...r, value } : r)));
    }

    // ─── Read helpers used by the template ──────────────────────────────

    protected isValueless(op: string): boolean {
        return VALUELESS_OPERATORS.has(op);
    }

    protected operatorLabel(op: string): string {
        return OPERATOR_LABELS[op] ?? op;
    }

    protected operatorsFor(field: string): ReadonlyArray<string> {
        return this.filterableFields().find((f) => f.field === field)?.filterOperators ?? [];
    }

    protected descriptorFor(field: string): FilterField | undefined {
        return this.filterableFields().find((f) => f.field === field);
    }

    protected typeFor(field: string): FieldType {
        return this.filterableFields().find((f) => f.field === field)?.type ?? 'string';
    }

    protected enumEntriesFor(field: string): ReadonlyArray<{ value: string; label: string }> {
        const map = this.filterableFields().find((f) => f.field === field)?.enumValues;
        if (!map) {
            return [];
        }
        return Object.entries(map).map(([value, label]) => ({ value, label }));
    }

    protected parseNumeric(raw: unknown, kind: 'int' | 'float'): number | null {
        if (raw === '' || raw === null || raw === undefined) {
            return null;
        }
        const n = kind === 'int' ? parseInt(String(raw), 10) : parseFloat(String(raw));
        return Number.isFinite(n) ? n : null;
    }

    // ─── RQL composition ────────────────────────────────────────────────

    private composeRql(rows: ReadonlyArray<FilterRow>): string {
        const tokens: string[] = [];
        for (const row of rows) {
            if (!row.field || !row.operator) {
                continue;
            }
            if (VALUELESS_OPERATORS.has(row.operator)) {
                tokens.push(`${row.field} ${row.operator}`);
                continue;
            }
            if (row.value === null || row.value === undefined || row.value === '') {
                // Skip rows with no value — partial input shouldn't break
                // the RQL the host hands to the backend.
                continue;
            }
            tokens.push(`${row.field} ${row.operator} ${this.formatValue(row.value)}`);
        }
        // One `filter[]=` param PER criterion. The RQL DSL has no infix
        // conjunction: top-level filters are an implicit AND, expressed as
        // repeated params (`RqlParser::extractFilterParams` reads
        // `filter[]=a&filter[]=b` first, repeated `filter=` second).
        //
        // This used to join with a literal ' and ' (#1670), which produced a
        // single filter whose VALUE swallowed the rest of the expression —
        // and the damage depended on which criterion came first. Leading with
        // a real boolean column (`isActive eq true and fullName cn dzm`) made
        // Postgres reject `"true and fullName cn dzm"` as a boolean → 500 →
        // "Unable to compute count." Leading with a VIRTUAL field
        // (`fullName cn dzm and isActive eq true`) was worse: the virtual
        // preprocessor peels it off before the visitor, so it searched for
        // the literal string "dzm and isActive eq true", found nothing, and
        // reported a confident "No users match this filter."
        //
        // Each token is encoded so a value containing `&` or `=` cannot break
        // the segmentation the same way; both consumers decode it (Angular's
        // `HttpParams({fromString})` on the preview call, `parse_str` on the
        // stored `audienceCriteria.rql` at submit).
        return tokens.length
            ? tokens.map(t => `filter[]=${encodeURIComponent(t)}`).join('&')
            : '';
    }

    private formatValue(value: unknown): string {
        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }
        if (typeof value === 'number') {
            return String(value);
        }
        const s = String(value);
        // Quote strings that contain whitespace or RQL reserved tokens to
        // avoid parser ambiguity. Conservative — quoting an already-safe
        // value is harmless.
        if (/[\s"'(),]/.test(s)) {
            return `"${s.replace(/"/g, '\\"')}"`;
        }
        return s;
    }

    private defaultValueFor(field: FieldDescriptor, operator: string): unknown {
        if (VALUELESS_OPERATORS.has(operator)) {
            return null;
        }
        switch (field.type) {
            case 'bool':
                return true;
            case 'int':
            case 'float':
                return null; // numeric inputs render empty by default
            case 'date':
                return '';
            case 'enum': {
                const first = field.enumValues ? Object.keys(field.enumValues)[0] : undefined;
                return first ?? '';
            }
            default:
                return '';
        }
    }

    private rowIdCounter = 0;
    private nextRowId(): string {
        this.rowIdCounter += 1;
        return `row-${this.rowIdCounter}`;
    }

    private emit(value: string): void {
        this.rqlSubject.next(value);
    }
}
