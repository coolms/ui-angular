import {
    ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef,
    HostListener, inject, input, OnInit, signal, ViewChild,
} from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FieldItem, DataSourceDefinition, DataSourceOption } from '@coolms/core-angular';
interface TreeOption {
    value:    unknown;
    label:    string;
    parentId: string | null;
    depth:    number;
    children: TreeOption[];
}

/**
 * Hierarchical select dropdown for relation/select fields with widget: select-tree.
 *
 * Fetches a flat list from the API, builds a client-side tree using parentId,
 * and renders it as an indented dropdown panel with an inline search header.
 *
 * When searching: reverts to a flat filtered list (depth=0) for clarity.
 * Lazy mode: server-side RQL search with debounce (loading: lazy).
 * Outside-click closes via HostListener; search auto-focuses on open via effect().
 */
@Component({
    selector: 'app-select-tree',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    template: `
        <div class="form-group">
            <label class="form-label">
                {{ item().label }}
                @if (item().required) { <span class="text-danger">*</span> }
            </label>

            @if (loadingOptions()) {
                <div class="form-control-plaintext text-muted small">Loading…</div>
            } @else {
                <div class="position-relative" #wrapper>

                    <!-- Trigger button — styled like form-select -->
                    <button type="button"
                            class="form-select text-start"
                            [class.is-invalid]="isInvalid()"
                            [class.text-muted]="!selectedLabel()"
                            (click)="toggleOpen()">
                        {{ selectedLabel() || (item().placeholder ?? '— Select —') }}
                    </button>

                    <!-- Dropdown panel -->
                    @if (isOpen()) {
                        <div class="position-absolute w-100 bg-white border rounded shadow-sm"
                             style="z-index:1050; top:calc(100% + 2px);
                                    max-height:300px; display:flex; flex-direction:column">

                            <!-- Search header -->
                            <div class="p-2 border-bottom flex-shrink-0">
                                <input #searchInput
                                       type="text"
                                       class="form-control form-control-sm"
                                       [placeholder]="isLazy() ? 'Type to search…' : 'Search…'"
                                       [formControl]="searchControl"
                                       (keydown.escape)="closeDropdown()" />
                            </div>

                            <!-- Tree options list -->
                            <div class="overflow-y-auto flex-grow-1 py-1">
                                @if (!item().required) {
                                    <button type="button"
                                            class="dropdown-item py-2 px-3 text-muted small"
                                            (click)="select(null)">
                                        — None —
                                    </button>
                                }
                                @for (node of visibleNodes(); track node.value) {
                                    <button type="button"
                                            class="dropdown-item py-1 px-3 d-flex align-items-center"
                                            [class.fw-semibold]="isSelected(node.value)"
                                            [class.text-primary]="isSelected(node.value)"
                                            [style.padding-left.px]="12 + node.depth * 16"
                                            (click)="select(node)">
                                        @if (node.depth > 0) {
                                            <span class="text-muted me-1"
                                                  style="font-size:.7rem; flex-shrink:0">└</span>
                                        }
                                        {{ node.label }}
                                    </button>
                                }
                                @if (visibleNodes().length === 0) {
                                    <div class="px-3 py-2 text-muted small">No results</div>
                                }
                            </div>
                        </div>
                    }
                </div>
            }

            @if (item().hint) {
                <div class="form-text text-muted">{{ item().hint }}</div>
            }
            @if (isInvalid()) {
                <div class="invalid-feedback d-block">{{ item().label }} is required</div>
            }
        </div>
    `,
})
export class SelectTreeComponent implements OnInit {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();

    allOptions     = signal<DataSourceOption[]>([]);
    loadingOptions = signal(false);
    isOpen         = signal(false);
    searchControl  = new FormControl('');

    @ViewChild('wrapper')     wrapperRef?:   ElementRef;
    @ViewChild('searchInput') searchInputEl?: ElementRef;

    private readonly http         = inject(HttpClient);
    private readonly destroyRef   = inject(DestroyRef);
    private readonly searchSignal = toSignal(this.searchControl.valueChanges, { initialValue: '' });

    constructor() {
        // Auto-focus search input whenever the dropdown opens
        effect(() => {
            if (this.isOpen()) {
                setTimeout(() => this.searchInputEl?.nativeElement.focus(), 0);
            }
        });
    }

    @HostListener('document:click', ['$event.target'])
    onOutsideClick(target: EventTarget | null): void {
        // `$event.target` is an EventTarget; narrow it once so the DOM
        // containment check below stays a real check.
        const node = target instanceof Node ? target : null;
        if (this.isOpen() && !this.wrapperRef?.nativeElement.contains(node)) {
            this.closeDropdown();
        }
    }

    // -------------------------------------------------------------------------
    // Computed signals
    // -------------------------------------------------------------------------

    control = computed(() => this.formGroup().get(this.item().alias) as FormControl);

    isInvalid = computed(() => {
        const c = this.control();
        return c?.invalid && c?.touched;
    });

    isLazy = computed(() => {
        const ds = this.item().relation?.dataSource ?? this.item().dataSource;
        return ds?.loading === 'lazy';
    });

    selectedLabel = computed(() => {
        const val = this.control()?.value;
        if (!val) return '';
        return this.allOptions().find(o => String(o.value) === String(val))?.label ?? String(val);
    });

    /**
     * Depth-annotated flat list in DFS pre-order (root -> children -> grandchildren…).
     * Used when there is no active search query.
     */
    treeNodes = computed<TreeOption[]>(() => this.buildFlatTree(this.allOptions()));

    /**
     * Lazy mode: server already filtered — show flat list always.
     * Eager mode when searching: flat filtered list at depth=0 (cleaner UX).
     * Eager mode when not searching: full tree with indentation.
     */
    visibleNodes = computed<TreeOption[]>(() => {
        const query = (this.searchSignal() ?? '').toLowerCase().trim();

        // Lazy: server filtered — display flat regardless of search
        if (this.isLazy()) {
            return this.allOptions().map(o => ({
                value:    o.value,
                label:    o.label,
                parentId: null,
                depth:    0,
                children: [],
            }));
        }

        // Eager + searching: flat filtered client-side
        if (query) {
            return this.allOptions()
                .filter(o => o.label.toLowerCase().includes(query))
                .map(o => ({ value: o.value, label: o.label, parentId: null, depth: 0, children: [] }));
        }

        // Eager + no search: tree structure
        return this.treeNodes();
    });

    isSelected(value: unknown): boolean {
        return String(this.control()?.value) === String(value);
    }

    // -------------------------------------------------------------------------
    // Interaction
    // -------------------------------------------------------------------------

    toggleOpen(): void {
        this.isOpen.update(v => !v);
    }

    closeDropdown(): void {
        this.isOpen.set(false);
        this.searchControl.reset();
    }

    select(node: TreeOption | null): void {
        this.control()?.setValue(node?.value ?? null);
        this.control()?.markAsDirty();
        this.closeDropdown();
    }

    // -------------------------------------------------------------------------
    // Data loading
    // -------------------------------------------------------------------------

    ngOnInit(): void {
        // dataSource lives in relation.dataSource for relation fields,
        // or directly in item.dataSource for plain select fields
        const ds = this.item().relation?.dataSource ?? this.item().dataSource;
        if (!ds?.url) return;

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
                    value:    item[ds.bindValue],
                    label:    String(item[ds.bindLabel] ?? item[ds.bindValue]),
                    parentId: (item['parentId'] as string | null) ?? null,
                })));
                this.loadingOptions.set(false);
            },
            error: () => this.loadingOptions.set(false),
        });
    }

    // -------------------------------------------------------------------------
    // Lazy search helpers
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Tree building
    // -------------------------------------------------------------------------

    /**
     * Converts a flat array (with optional parentId) into a DFS pre-order list
     * with depth annotation for indented rendering.
     *
     * Nodes whose parentId is missing or doesn't match any known value become roots.
     */
    private buildFlatTree(options: DataSourceOption[]): TreeOption[] {
        const map = new Map<string, TreeOption>();

        // 1. Build node map
        for (const opt of options) {
            map.set(String(opt.value), {
                value:    opt.value,
                label:    opt.label,
                parentId: opt.parentId ?? null,
                depth:    0,
                children: [],
            });
        }

        // 2. Link children to parents; collect true roots
        const roots: TreeOption[] = [];
        for (const node of map.values()) {
            if (node.parentId !== null && map.has(node.parentId)) {
                map.get(node.parentId)!.children.push(node);
            } else {
                roots.push(node);
            }
        }

        // 3. DFS pre-order traversal to produce flat ordered list with depth
        const result: TreeOption[] = [];
        const visit = (node: TreeOption, depth: number): void => {
            node.depth = depth;
            result.push(node);
            node.children.forEach(child => visit(child, depth + 1));
        };
        roots.forEach(r => visit(r, 0));

        return result;
    }
}
