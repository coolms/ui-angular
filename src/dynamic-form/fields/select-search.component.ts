import {
    ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef,
    inject, input, OnInit, signal, ViewChild,
} from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FieldItem, DataSourceDefinition, DataSourceOption } from '@coolms/core-angular';
/**
 * Combobox-style picker for relation/select fields with widget: select-search.
 * Trigger button opens a dropdown panel rendered via CDK Overlay, so the panel
 * escapes any scrollable container (e.g., a dialog body with overflow: auto).
 * The search input lives inside the panel above the filtered option list.
 * Supports single and many cardinality; for many, chips remain in relation-field.
 */
@Component({
    selector: 'app-select-search',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, OverlayModule],
    template: `
        <button cdkOverlayOrigin
                #triggerOrigin="cdkOverlayOrigin"
                #triggerEl
                type="button"
                class="form-select text-start w-100"
                [class.is-invalid]="isInvalid()"
                [class.text-muted]="!triggerLabel()"
                (click)="toggleOpen()">
            {{ triggerLabel() || (item().placeholder ?? '— Select —') }}
        </button>

        <ng-template cdkConnectedOverlay
                     [cdkConnectedOverlayOrigin]="triggerOrigin"
                     [cdkConnectedOverlayOpen]="isOpen()"
                     [cdkConnectedOverlayPositions]="overlayPositions"
                     [cdkConnectedOverlayWidth]="triggerWidth()"
                     [cdkConnectedOverlayHasBackdrop]="false"
                     (overlayOutsideClick)="closeDropdown()"
                     (detach)="closeDropdown()">
            <div class="bg-white border rounded shadow w-100"
                 style="max-height:300px; display:flex; flex-direction:column">

                <div class="p-2 border-bottom flex-shrink-0">
                    <input #searchInput
                           type="text"
                           class="form-control form-control-sm"
                           [placeholder]="isLazy() ? 'Type to search…' : 'Search…'"
                           [formControl]="searchControl"
                           (keydown.escape)="closeDropdown()" />
                </div>

                <div class="overflow-y-auto flex-grow-1 py-1">
                    @if (loadingOptions()) {
                        <div class="px-3 py-2 text-muted small">Loading…</div>
                    } @else {
                        @if (!isMany() && !item().required) {
                            <button type="button"
                                    class="dropdown-item py-2 px-3 text-muted small"
                                    (click)="select(null)">
                                — None —
                            </button>
                        }
                        @for (opt of filteredOptions(); track opt.value) {
                            <button type="button"
                                    class="dropdown-item py-1 px-3 d-flex align-items-center"
                                    [class.fw-semibold]="isSelected(opt.value)"
                                    [class.text-primary]="isSelected(opt.value)"
                                    [disabled]="isMany() && isSelected(opt.value)"
                                    (click)="select(opt)">
                                @if (isMany() && isSelected(opt.value)) {
                                    <i class="bi bi-check2 me-1"></i>
                                }
                                {{ opt.label }}
                            </button>
                        }
                        @if (filteredOptions().length === 0) {
                            <div class="px-3 py-2 text-muted small">No results</div>
                        }
                    }
                </div>
            </div>
        </ng-template>
    `,
})
export class SelectSearchComponent implements OnInit {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();

    allOptions     = signal<DataSourceOption[]>([]);
    loadingOptions = signal(false);
    isOpen         = signal(false);
    searchControl  = new FormControl('');

    /** Tracks FormControl.value for reactive computed reads. */
    private readonly controlValue = signal<unknown>(undefined);

    @ViewChild('triggerEl', { static: true }) triggerRef!:    ElementRef<HTMLButtonElement>;
    @ViewChild('searchInput')                 searchInputEl?: ElementRef;

    readonly overlayPositions: ConnectedPosition[] = [
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top',    offsetY: 2 },
        { originX: 'start', originY: 'top',    overlayX: 'start', overlayY: 'bottom', offsetY: -2 },
    ];

    private readonly http         = inject(HttpClient);
    private readonly destroyRef   = inject(DestroyRef);
    private readonly searchSignal = toSignal(this.searchControl.valueChanges, { initialValue: '' });

    constructor() {
        effect(() => {
            if (this.isOpen()) {
                setTimeout(() => this.searchInputEl?.nativeElement.focus(), 0);
            }
        });
    }

    triggerWidth(): number {
        return this.triggerRef?.nativeElement.offsetWidth ?? 0;
    }

    control = computed(() => this.formGroup().get(this.item().alias) as FormControl);

    isMany = computed(() => this.item().relation?.cardinality === 'many');

    isLazy = computed(() => {
        const ds = this.item().relation?.dataSource ?? this.item().dataSource;
        return ds?.loading === 'lazy';
    });

    isInvalid = computed(() => {
        void this.controlValue();
        const c = this.control();
        return c?.invalid && c?.touched;
    });

    triggerLabel = computed(() => {
        const value = this.controlValue();
        if (this.isMany()) {
            const count = Array.isArray(value) ? value.length : 0;
            return count > 0 ? `${count} selected -- pick more…` : '';
        }
        if (value === null || value === undefined || value === '') return '';
        return this.allOptions().find(o => String(o.value) === String(value))?.label ?? String(value);
    });

    filteredOptions = computed(() => {
        if (this.isLazy()) return this.allOptions();

        const query = (this.searchSignal() ?? '').toLowerCase().trim();
        if (!query) return this.allOptions();
        return this.allOptions().filter(o => o.label.toLowerCase().includes(query));
    });

    isSelected(value: unknown): boolean {
        const v = this.controlValue();
        if (this.isMany()) {
            return Array.isArray(v) && v.some(x => String(x) === String(value));
        }
        return String(v) === String(value);
    }

    toggleOpen(): void {
        this.isOpen.update(v => !v);
    }

    closeDropdown(): void {
        this.isOpen.set(false);
        this.searchControl.reset();
    }

    select(opt: DataSourceOption | null): void {
        const c = this.control();
        if (!c) return;

        if (this.isMany()) {
            if (opt === null) return;
            const current: unknown[] = Array.isArray(c.value) ? [...c.value] : [];
            if (!current.some(x => String(x) === String(opt.value))) {
                c.setValue([...current, opt.value]);
                c.markAsDirty();
            }
            this.searchControl.reset();
        } else {
            c.setValue(opt?.value ?? null);
            c.markAsDirty();
            this.closeDropdown();
        }
    }

    ngOnInit(): void {
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

        const ds = this.item().relation?.dataSource ?? this.item().dataSource;
        if (!ds?.url) return;

        if (ds.loading === 'lazy') {
            this.setupLazySearch(ds);
            return;
        }

        this.loadingOptions.set(true);
        this.http.get<Record<string, unknown>>(ds.url, {
            headers: { Accept: 'application/ld+json' },
        }).subscribe({
            next: r => {
                const members = (r['member'] ?? r['hydra:member'] ?? []) as Record<string, unknown>[];
                this.allOptions.set(members.map(item => ({
                    value: item[ds.bindValue],
                    label: String(item[ds.bindLabel] ?? item[ds.bindValue]),
                })));
                this.loadingOptions.set(false);
            },
            error: () => this.loadingOptions.set(false),
        });
    }

    private setupLazySearch(ds: DataSourceDefinition): void {
        this.loadLazy('', ds);
        this.searchControl.valueChanges.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(query => this.loadLazy(query ?? '', ds));
    }

    private loadLazy(search: string, ds: DataSourceDefinition): void {
        if (!ds.url) return;

        const rql = search.trim()
            ? `?filter=${encodeURIComponent(ds.bindLabel)} cn "${encodeURIComponent(search)}"&limit=20`
            : `?limit=20`;

        this.loadingOptions.set(true);
        this.http.get<Record<string, unknown>>(`${ds.url}${rql}`, {
            headers: { Accept: 'application/ld+json' },
        }).subscribe({
            next: r => {
                const members = (r['member'] ?? r['hydra:member'] ?? []) as Record<string, unknown>[];
                this.allOptions.set(members.map(item => ({
                    value: item[ds.bindValue],
                    label: String(item[ds.bindLabel] ?? item[ds.bindValue]),
                })));
                this.loadingOptions.set(false);
            },
            error: () => this.loadingOptions.set(false),
        });
    }
}
