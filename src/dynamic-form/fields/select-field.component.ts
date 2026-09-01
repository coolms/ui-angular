import {
    ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef,
    HostListener, inject, input, OnInit, signal, ViewChild,
} from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FieldItem, DataSourceDefinition, DataSourceOption } from '@coolms/core-angular';
import { MultiOptionRow, MultiOptionSelectComponent } from '../../ui/multi-option-select/multi-option-select.component';

@Component({
    selector: 'app-select-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, MultiOptionSelectComponent],
    template: `
        <div class="form-group">
            <label [for]="item().alias" class="form-label">
                {{ item().label }}
                @if (item().required) { <span class="text-danger">*</span> }
            </label>

            @if (loadingOptions()) {
                <div class="form-control-plaintext text-muted" style="font-size:.85rem">
                    Loading options…
                </div>
            } @else {

                @if (useMultiSearch()) {
                    <!-- Searchable, chip-rendered multi-select. Opt-in: a
                         dataSource must set multiple AND widget select-search.
                         A plain multiple keeps the native list box, so nothing
                         that already used one changes shape.
                         Rows are handed over rather than re-fetched: the options
                         were already loaded eagerly above, and letting the picker
                         fetch them again would double every request. -->
                    <app-multi-option-select
                        [values]="selectedValues()"
                        [options]="multiRows()"
                        [placeholder]="item().placeholder ?? '— Any —'"
                        [entityLabel]="item().label"
                        (valuesChange)="onMultiValues($event)" />

                } @else if (useCustomDropdown()) {
                    <!-- Custom searchable dropdown for >8 options or lazy mode -->
                    <div class="position-relative" #wrapper>

                        <!-- Trigger button — styled like form-select -->
                        <button type="button"
                                class="form-select text-start"
                                [class.is-invalid]="isInvalid()"
                                [style.color]="selectedLabel() ? '' : '#6c757d'"
                                (click)="toggleDropdown()">
                            {{ selectedLabel() || (item().placeholder ?? '— Select —') }}
                        </button>

                        <!-- Dropdown panel -->
                        @if (dropdownOpen()) {
                            <div class="position-absolute w-100 bg-white border rounded shadow-sm"
                                 style="z-index: 1050; top: calc(100% + 2px); max-height: 280px;
                                        display: flex; flex-direction: column">

                                <!-- Search header -->
                                <div class="p-2 border-bottom">
                                    <input #searchInput
                                           type="text"
                                           class="form-control form-control-sm"
                                           [placeholder]="item().dataSource?.loading === 'lazy' ? 'Type to search…' : 'Search…'"
                                           [formControl]="searchControl"
                                           (keydown.escape)="dropdownOpen.set(false)"
                                           (keydown.arrowDown)="focusFirstOption()" />
                                </div>

                                <!-- Options list -->
                                <div class="overflow-y-auto flex-grow-1">
                                    @if (!item().required) {
                                        <button type="button"
                                                class="dropdown-item py-2 px-3 text-muted small"
                                                (click)="selectOption(null)">
                                            — Select —
                                        </button>
                                    }
                                    @if (filteredOptions().length === 0) {
                                        <div class="px-3 py-2 text-muted small">No results</div>
                                    }
                                    @for (opt of filteredOptions(); track opt.value; let i = $index) {
                                        <button type="button"
                                                class="dropdown-item py-2 px-3"
                                                [class.active]="isSelected(opt)"
                                                [class.fw-semibold]="isSelected(opt)"
                                                [attr.data-opt-index]="i"
                                                (click)="selectOption(opt)">
                                            {{ opt.label }}
                                        </button>
                                    }
                                </div>
                            </div>
                        }
                    </div>

                } @else if (item().dataSource?.multiple) {
                    <!-- A SEPARATE element carrying a STATIC multiple attribute.
                         Angular picks a control-value accessor by matching the
                         template at COMPILE time, and the multi-value one is
                         selected by select[multiple] - a static attribute. This
                         used to be one element with [attr.multiple], a runtime
                         binding, so the accessor never matched and the
                         single-value one handled the control instead: it cannot
                         write an ARRAY into a selection, so every saved value
                         rendered as nothing selected. The box looked empty, and
                         saving it would have cleared the list. Same trap as the
                         number field, whose accessor wants a static
                         type=number. Two elements is the price of static
                         attributes; a binding cannot buy this. -->
                    <select [id]="item().alias"
                            class="form-select"
                            multiple
                            [class.is-invalid]="isInvalid()"
                            [formControl]="control()"
                            [size]="Math.min(5, filteredOptions().length + 1)">
                        @for (opt of filteredOptions(); track opt.value) {
                            <option [value]="opt.value">{{ opt.label }}</option>
                        }
                    </select>

                } @else {
                    <!-- Native single select for ≤8 options -->
                    <select [id]="item().alias"
                            class="form-select"
                            [class.is-invalid]="isInvalid()"
                            [formControl]="control()"
                            [size]="1">
                        <!-- ngValue, not value="". A form control starts as
                             null, and Angular resolves an unmatched value to the
                             literal string "null", which matches no option:
                             selectedIndex goes to -1 and the browser paints an
                             EMPTY BOX — no placeholder, no chevron, nothing to
                             say it is a dropdown at all. Binding the placeholder
                             to null gives that value somewhere to land. Choosing
                             it sets the control back to null (not ""), which is
                             the honest answer for "not set".

                             Unconditional here: this branch IS the single-value
                             one, so the guard it used to carry could only ever
                             be true. A multi-select has no placeholder row --
                             selecting nothing is how you say "none" there. -->
                        <option [ngValue]="null">{{ item().placeholder ?? '— Select —' }}</option>
                        @for (opt of filteredOptions(); track opt.value) {
                            <option [value]="opt.value">{{ opt.label }}</option>
                        }
                    </select>
                }
            }

            @if (item().hint) {
                <div class="form-text text-muted">{{ item().hint }}</div>
            }
            @if (isInvalid()) {
                <div class="invalid-feedback">{{ errorMessage() }}</div>
            }
        </div>
    `,
})
export class SelectFieldComponent implements OnInit {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();

    allOptions     = signal<DataSourceOption[]>([]);
    loadingOptions = signal(false);
    searchControl  = new FormControl('');
    dropdownOpen   = signal(false);

    protected readonly Math = Math;

    @ViewChild('wrapper')     wrapperRef?: ElementRef;
    @ViewChild('searchInput') searchInput?: ElementRef;

    private readonly http         = inject(HttpClient);
    private readonly destroyRef   = inject(DestroyRef);
    private readonly searchSignal = toSignal(this.searchControl.valueChanges, { initialValue: '' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    control = computed(() => this.formGroup().get(this.item().alias) as any);

    isInvalid = computed(() => {
        const c = this.control();
        return c && c.invalid && c.touched;
    });

    errorMessage = computed(() => {
        const errors = this.control()?.errors;
        if (!errors) return '';
        if (errors['server'])   return errors['server'] as string;
        if (errors['required']) return `${this.item().label} is required`;
        return 'Invalid value';
    });

    /**
     * Searchable multi-select instead of a native `<select multiple>`.
     *
     * Opt-in, because a native multi-select is fine for a handful of options and
     * changing every existing one would be a silent UI migration. It stops being
     * fine at catalogue scale: an allow-list picked from ~250 countries by
     * ctrl-clicking a five-row box is not something anyone can use, and that is
     * exactly what a phone-country allow-list is.
     */
    useMultiSearch = computed(() => {
        const ds = this.item().dataSource;
        return true === ds?.multiple && 'select-search' === ds.widget;
    });

    useCustomDropdown = computed(() => {
        const ds = this.item().dataSource;
        // The multi-select picker above owns this case.
        if (this.useMultiSearch()) return false;
        // Lazy mode always uses custom dropdown (search is the primary interaction)
        if (ds?.loading === 'lazy') return true;
        // Eager mode: custom dropdown only when > 8 options
        return !ds?.multiple && this.allOptions().length > 8;
    });

    /** Loaded options in the shape the multi-select picker takes. */
    multiRows = computed((): MultiOptionRow[] =>
        this.allOptions().map(o => ({ value: String(o.value), label: o.label })),
    );

    /**
     * Current selection as the picker's string values.
     *
     * A signal fed from `valueChanges`, NOT a computed over `control().value`: a
     * FormControl's value is not reactive, so a computed reading it would be
     * calculated once and never again — the picker would take a selection, emit
     * it, and redraw itself empty. Subscribing is what makes the round trip
     * close, and it also picks up the form's initial patch.
     */
    selectedValues = signal<string[]>([]);

    selectedLabel = computed(() => {
        const val = this.control()?.value;
        if (val === null || val === undefined || val === '') return '';
        return this.allOptions().find(o => String(o.value) === String(val))?.label ?? String(val);
    });

    filteredOptions = computed(() => {
        const ds = this.item().dataSource;
        // Lazy mode: server already filtered — return all loaded options as-is
        if (ds?.loading === 'lazy') return this.allOptions();
        // Eager mode: client-side filter
        const query = (this.searchSignal() ?? '').toLowerCase().trim();
        if (!query) return this.allOptions();
        return this.allOptions().filter(o => o.label.toLowerCase().includes(query));
    });

    constructor() {
        // Auto-focus search input when dropdown opens
        effect(() => {
            if (this.dropdownOpen()) {
                setTimeout(() => this.searchInput?.nativeElement.focus(), 0);
            }
        });
    }

    @HostListener('document:click', ['$event.target'])
    onOutsideClick(target: EventTarget | null): void {
        // `$event.target` is an EventTarget; narrow it once so the DOM
        // containment check below stays a real check.
        const node = target instanceof Node ? target : null;
        if (this.dropdownOpen() && !this.wrapperRef?.nativeElement.contains(node)) {
            this.dropdownOpen.set(false);
        }
    }

    toggleDropdown(): void {
        this.dropdownOpen.update(v => !v);
    }

    isSelected(opt: DataSourceOption): boolean {
        return String(this.control()?.value) === String(opt.value);
    }

    selectOption(opt: DataSourceOption | null): void {
        this.control()?.setValue(opt?.value ?? null);
        this.control()?.markAsTouched();
        this.dropdownOpen.set(false);
        this.searchControl.reset();
    }

    /** Adopt the multi-select picker's selection. */
    onMultiValues(values: readonly string[]): void {
        // Copied, not stored as the readonly the picker emits: this lands in a
        // form control, gets read back by getRawValue() and JSON-serialised on
        // save, and a frozen array in a mutable slot is a trap for the next
        // person to touch it. selectedValues follows via valueChanges.
        this.control()?.setValue([...values]);
        this.control()?.markAsTouched();
        this.control()?.markAsDirty();
    }

    /** Keep {@link selectedValues} in step with the control, both ways. */
    private trackMultiSelection(): void {
        const control = this.control();
        if (!control) return;

        const read = (raw: unknown): string[] => Array.isArray(raw) ? raw.map(v => String(v)) : [];

        this.selectedValues.set(read(control.value));
        control.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((raw: unknown) => this.selectedValues.set(read(raw)));
    }

    focusFirstOption(): void {
        const first = this.wrapperRef?.nativeElement.querySelector('[data-opt-index="0"]');
        (first as HTMLElement | null)?.focus();
    }

    ngOnInit(): void {
        this.trackMultiSelection();

        const ds = this.item().dataSource;
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
                    this.allOptions.set(members.map(item => ({
                        value: item[ds.bindValue] as string | number,
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
}
