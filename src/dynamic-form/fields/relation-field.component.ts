import {
    Component, input, computed, DestroyRef, OnInit, signal, inject,
    ChangeDetectionStrategy,
} from '@angular/core';

import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FieldItem, DataSourceDefinition, DataSourceOption, DataSourceWidget } from '@coolms/core-angular';
// NOTE: inline-create-modal is deliberately NOT imported here — it is loaded
// on demand inside openInlineCreate(). See the comment there.
import { SelectTreeComponent } from './select-tree.component';
import { SelectSearchComponent } from './select-search.component';
import { FieldWidgetHostComponent } from '../../ui/field-widgets/field-widget-host.component';

@Component({
    selector: 'app-relation-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, SelectTreeComponent, SelectSearchComponent, FieldWidgetHostComponent],
    template: `
        <div class="form-group">
            <!-- Outer label suppressed for select-tree: SelectTreeComponent renders its own -->
            @if (widgetType() !== 'select-tree') {
                <label class="form-label">
                    {{ item().label }}
                    @if (item().required) { <span class="text-danger">*</span> }
                </label>
            }

            <!-- Selected tags (cardinality: many) -->
            @if (isMany() && selectedLabels().length > 0) {
                <div class="relation-tags mb-1">
                    @for (tag of selectedLabels(); track tag.iri) {
                        <span class="relation-tag">
                            {{ tag.label }}
                            <button type="button" class="relation-tag-remove"
                                    (click)="removeSelection(tag.iri)">✕</button>
                        </span>
                    }
                </div>
            }

            <!-- Option picker — delegates to widget-specific component -->
            @if (!isMany() || !maxReached()) {
                @switch (widgetType()) {

                    @case ('select-tree') {
                        <!--
                            SelectTreeComponent is fully self-contained:
                            it renders its own label, trigger button, dropdown, and
                            handles data fetching, tree building, and value binding.
                            We suppress the outer label for this widget to avoid duplication.
                        -->
                        <app-select-tree [item]="item()" [formGroup]="formGroup()" />
                    }

                    @case ('select-search') {
                        <app-select-search [item]="item()" [formGroup]="formGroup()" />
                    }

                    @case ('media-picker') {
                        <!--
                            Resolved through the field-widget registry, not
                            imported: the picker is the Media module's, and a
                            generic form field must not name a feature. When
                            Media is not installed this renders nothing, which
                            is the registry's documented behaviour.
                        -->
                        <app-field-widget-host
                            kind="media-picker"
                            [value]="mediaValue()"
                            [config]="mediaWidgetConfig()"
                            [disabled]="control().disabled"
                            [valueChange]="onMediaValueChange" />
                    }

                    @default {
                        <!-- Native select with optional search header (≤6: no search, >6: search above) -->
                        @if (loadingOptions()) {
                            <div class="form-control-plaintext text-muted" style="font-size:.85rem">
                                Loading…
                            </div>
                        } @else {
                            @if (allOptions().length > 6 || isLazy()) {
                                <input
                                    type="text"
                                    class="form-control form-control-sm mb-1"
                                    [placeholder]="isLazy() ? 'Type to search…' : 'Search…'"
                                    [formControl]="searchControl"
                                />
                            }
                            <!--
                                Selection is bound per OPTION, not as a
                                [value] on the select — see isSingleSelected().
                            -->
                            <select
                                class="form-select"
                                [class.is-invalid]="isInvalid()"
                                (change)="onSelectChange($event)"
                            >
                                <option value="">{{ item().placeholder ?? '— Select —' }}</option>
                                @for (opt of filteredOptions(); track opt.value) {
                                    <option [value]="opt.value"
                                            [selected]="isSingleSelected(opt.value)"
                                            [disabled]="isMany() && isSelected(opt.value)">
                                        {{ opt.label }}
                                    </option>
                                }
                            </select>
                        }
                    }

                }
            }

            <!-- Inline create button -->
            @if (item().relation?.targetFormId && !maxReached()) {
                <button type="button" class="cms-btn cms-btn-sm mt-1"
                        (click)="openInlineCreate()">
                    + Create new {{ item().label }}
                </button>
            }

            @if (item().hint && widgetType() !== 'select-tree') {
                <div class="form-text text-muted">{{ item().hint }}</div>
            }
            @if (isInvalid() && widgetType() !== 'select-tree') {
                <div class="invalid-feedback d-block">{{ item().label }} is required</div>
            }
        </div>
    `,
    styles: [`
        .relation-tags { display: flex; flex-wrap: wrap; gap: 4px; }
        .relation-tag {
            display: inline-flex; align-items: center; gap: 4px;
            background: var(--cms-info-subtle); color: var(--cms-info-text);
            padding: 2px 8px; border-radius: 12px; font-size: .8rem;
        }
        .relation-tag-remove {
            background: none; border: none; cursor: pointer;
            color: var(--cms-info-text); padding: 0; font-size: .75rem; line-height: 1;
        }
    `],
})
export class RelationFieldComponent implements OnInit {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();

    allOptions     = signal<DataSourceOption[]>([]);
    loadingOptions = signal(false);
    searchControl  = new FormControl('');

    /** Tracks FormControl.value as a signal so `computed()` reactions fire on value changes. */
    private readonly controlValue = signal<unknown>(undefined);

    private readonly http         = inject(HttpClient);
    private readonly destroyRef   = inject(DestroyRef);
    private readonly dialog       = inject(Dialog);
    private readonly searchSignal = toSignal(this.searchControl.valueChanges, { initialValue: '' });

    control = computed(() => this.formGroup().get(this.item().alias) as FormControl);

    isMany = computed(() => this.item().relation?.cardinality === 'many');

    /**
     * The current FormControl value for `cardinality: one` selects, as a
     * primitive string, so initial values (edit-mode load, programmatic
     * patchValue, etc.) render with the matching option pre-selected.
     * Returns '' when the control is empty or holds an array
     * (cardinality:many path uses tags instead).
     */
    singleValue = computed<string>(() => {
        const v = this.controlValue();
        return typeof v === 'string' ? v : '';
    });

    /**
     * Whether an `<option>` should render selected. cardinality:one only —
     * for many the picker is a queue whose picks become tags, so it stays on
     * its placeholder.
     *
     * Bound on the OPTION rather than as `<select [value]="singleValue()">`
     * deliberately, and the difference is not stylistic. A `[value]` binding
     * on the select is evaluated BEFORE the `@for` creates the option views in
     * the same change-detection pass, so the first write lands on a select
     * holding nothing but the placeholder and resolves to ''. The binding
     * having recorded the value it MEANT to write, it is then never
     * re-applied once the options do exist. Every edit-mode load — and every
     * `dataSource.type: 'api'` field, whose options arrive a round trip after
     * the first pass — therefore rendered "— Select —" over a populated
     * control, which is the very symptom the value binding was added to fix.
     * A per-option binding is immune: each option's binding first runs when
     * its own view is created, whenever that happens to be.
     */
    isSingleSelected(value: unknown): boolean {
        return !this.isMany() && value === this.singleValue();
    }

    isInvalid = computed(() => {
        void this.controlValue();
        const c = this.control();
        return c && c.invalid && c.touched;
    });

    isLazy = computed(() => this.item().relation?.dataSource?.loading === 'lazy');

    /**
     * Widget type from relation.dataSource.widget — drives which picker is rendered.
     * select-tree -> SelectTreeComponent (self-contained, handles own fetch + tree)
     * select-search -> (future) integrated search dropdown
     * select (default) -> native <select> with optional stacked search input
     */
    widgetType = computed<DataSourceWidget>(() =>
        this.item().relation?.dataSource?.widget ?? 'select',
    );

    /**
     * What the media widget is handed as its `config`: the backend-authored
     * `dataSource.widgetOptions` blob, plus the cardinality -- which only this
     * field knows, since it comes from the relation, not from Media.
     *
     * The blob is passed through UNINTERPRETED. Every key in it means
     * something to the picker and nothing here, so validating it in this file
     * would only duplicate the widget.
     */
    mediaWidgetConfig = computed<Record<string, unknown>>(() => ({
        ...(this.item().relation?.dataSource?.widgetOptions ?? {}) as Record<string, unknown>,
        cardinality: this.isMany() ? 'many' : 'one',
    }));

    /** Raw control value for the widget; it owns the narrowing and encoding. */
    mediaValue = computed<unknown>(() => this.controlValue());

    /**
     * Store whatever the widget hands back. An arrow property because the
     * registry contract is a callback passed by reference, not an output.
     */
    readonly onMediaValueChange = (next: unknown): void => {
        const c = this.control();
        if (!c) return;

        c.setValue(next);
        c.markAsDirty();
        c.markAsTouched();
    };

    filteredOptions = computed(() => {
        const ds = this.item().relation?.dataSource;

        // Lazy mode: server already filtered — return all loaded options as-is
        if (ds?.loading === 'lazy') {
            return this.allOptions();
        }

        // Eager mode: client-side filter
        const query = (this.searchSignal() ?? '').toLowerCase().trim();
        if (!query) return this.allOptions();
        return this.allOptions().filter(o =>
            o.label.toLowerCase().includes(query),
        );
    });

    selectedLabels = computed<{ iri: string; label: string }[]>(() => {
        const value = this.controlValue();
        if (!value) return [];
        const iris: string[] = Array.isArray(value) ? value : [value];
        return iris.map(iri => ({
            iri,
            label: this.allOptions().find(o => o.value === iri)?.label ?? iri,
        }));
    });

    maxReached = computed(() => {
        const max = this.item().relation?.maxItems;
        if (!max || !this.isMany()) return false;
        const value = this.controlValue();
        return Array.isArray(value) && value.length >= max;
    });

    ngOnInit(): void {
        // Bridge FormControl value to a signal so selectedLabels/isInvalid/maxReached recompute reactively.
        const c = this.control();
        if (c) {
            this.controlValue.set(c.value);
            c.valueChanges
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(v => this.controlValue.set(v));
            c.statusChanges
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(() => this.controlValue.update(v => v));
        }

        // select-tree widget fetches its own data inside SelectTreeComponent
        if (this.widgetType() === 'select-tree') return;

        const ds = this.item().relation?.dataSource;
        if (!ds) return;

        if (ds.type === 'static' || ds.type === 'enum') {
            this.allOptions.set([...(ds.options ?? [])]);
            return;
        }

        if (ds.type === 'api' && ds.url) {
            // -- Lazy loading --------------------------------------------------
            if (ds.loading === 'lazy') {
                this.setupLazySearch(
                    ds,
                    opts => this.allOptions.set(opts),
                    loading => this.loadingOptions.set(loading),
                );
                return;
            }

            // -- Eager loading -------------------------------------------------
            this.loadingOptions.set(true);
            this.http.get<Record<string, unknown>>(ds.url, {
                headers: { Accept: 'application/ld+json' },
            }).subscribe({
                next: r => {
                    const members = (r['member'] ?? r['hydra:member'] ?? []) as Record<string, unknown>[];
                    this.allOptions.set(members.map((item: Record<string, unknown>) => ({
                        value: item[ds.bindValue],
                        label: String(item[ds.bindLabel] ?? item[ds.bindValue]),
                    })));
                    this.loadingOptions.set(false);
                },
                error: () => this.loadingOptions.set(false),
            });
        }
    }

    private setupLazySearch(
        ds:        DataSourceDefinition,
        onResults: (opts: DataSourceOption[]) => void,
        onLoading: (v: boolean) => void,
    ): void {
        // Initial load — empty filter
        this.loadLazy('', ds, onResults, onLoading);

        // Debounced search on input changes
        this.searchControl.valueChanges.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(query => this.loadLazy(query ?? '', ds, onResults, onLoading));
    }

    private loadLazy(
        search:    string,
        ds:        DataSourceDefinition,
        onResults: (opts: DataSourceOption[]) => void,
        onLoading: (v: boolean) => void,
    ): void {
        if (!ds.url) return;

        const rql = search.trim()
            ? `?filter=${encodeURIComponent(ds.bindLabel)} cn "${encodeURIComponent(search)}"&limit=20`
            : `?limit=20`;

        onLoading(true);
        this.http.get<Record<string, unknown>>(`${ds.url}${rql}`, {
            headers: { Accept: 'application/ld+json' },
        }).subscribe({
            next: r => {
                const members = (r['member'] ?? r['hydra:member'] ?? []) as Record<string, unknown>[];
                onResults(members.map(item => ({
                    value:    item[ds.bindValue],
                    label:    String(item[ds.bindLabel] ?? item[ds.bindValue]),
                    parentId: (item['parentId'] as string | null) ?? null,
                })));
                onLoading(false);
            },
            error: () => onLoading(false),
        });
    }

    onSelectChange(event: Event): void {
        const select = event.target as HTMLSelectElement;
        const iri    = select.value;
        if (!iri) return;

        const c = this.control();
        if (this.isMany()) {
            const current: string[] = Array.isArray(c?.value) ? [...c.value] : [];
            if (!current.includes(iri)) {
                c.setValue([...current, iri]);
                c.markAsDirty();
            }
            // cardinality:many — reset the visible select so the
            // operator can pick another value; the chosen one is now
            // a tag above the select.
            select.value = '';
        } else {
            c.setValue(iri);
            c.markAsDirty();
            // cardinality:one — DO NOT reset. The picked option must
            // remain visible inside the <select>; resetting it would
            // make the field look empty even though the control holds
            // the value, which is the bug operators have been hitting
            // in every single-select relation form.
        }
    }

    removeSelection(iri: string): void {
        const c = this.control();
        if (!c) return;
        const current: string[] = Array.isArray(c.value) ? [...c.value] : [];
        c.setValue(current.filter(v => v !== iri));
        c.markAsDirty();
    }

    isSelected(iri: unknown): boolean {
        const c     = this.control();
        const value = c?.value;
        if (!value) return false;
        return Array.isArray(value) ? value.includes(iri) : value === iri;
    }

    /**
     * The modal is loaded on click rather than imported at the top of this
     * file, and that is load-bearing rather than a bundle-size tweak. The
     * static import closed a cycle —
     *
     *   relation-field -> inline-create-modal -> dynamic-form
     *                  -> dynamic-layout -> dynamic-field -> relation-field
     *
     * — and in a cycle, whichever module the bundler happens to evaluate FIRST
     * is the one still mid-initialisation when the last edge points back at
     * it, so some `imports:` array captures `undefined` for a real component.
     * Which array loses depends on the entry point, i.e. on nothing anyone
     * writing a component controls: entered at dynamic-form (the app, and any
     * spec that renders a form) the loser is inline-create-modal's own
     * `DynamicFormComponent`; entered at relation-field (a spec that mounts
     * just this field) it is dynamic-field's `RelationFieldComponent`, which
     * takes down every TestBed that configures a dynamic form —
     * "Cannot read properties of undefined (reading 'ɵcmp')".
     *
     * `dialog.open()` needs the class as a runtime value, never as a template
     * dependency, so this edge is the one the graph can lose. The others are
     * genuine parent-renders-child edges. Do not restore the static import.
     */
    async openInlineCreate(): Promise<void> {
        const targetFormId = this.item().relation?.targetFormId;
        if (!targetFormId) return;

        const { InlineCreateModalComponent } = await import('../inline-create-modal.component');

        const ref = this.dialog.open(InlineCreateModalComponent, {
            data:          { formId: targetFormId },
            backdropClass: 'cdk-overlay-dark-backdrop',
        });

        ref.closed.subscribe(result => {
            if (!result) return;
            const res   = result as Record<string, unknown>;
            const iri   = res['@id'] as string;
            const label = String(
                res[this.item().relation?.dataSource?.bindLabel ?? 'label'] ?? iri,
            );

            // Add to local options so tag label resolves immediately without refetch
            this.allOptions.update(opts => [...opts, { value: iri, label }]);

            const c = this.control();
            if (this.isMany()) {
                const current = Array.isArray(c?.value) ? [...c.value] : [];
                c?.setValue([...current, iri]);
            } else {
                c?.setValue(iri);
            }
            c?.markAsDirty();
        });
    }
}
