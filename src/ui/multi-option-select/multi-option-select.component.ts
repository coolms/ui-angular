import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    HostListener,
    OnInit,
    ViewChild,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    untracked,
} from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { CmsLoaderComponent } from '@coolms/core-angular';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngxs/store';
import { AuthState } from '@coolms/core-angular';
/**
 * One row in the multi-select dropdown.
 *
 * Mirrors the backend {@link App\Core\Domain\Option\Option} VO from the
 * OptionSource ship — `value` is the stable wire token used in RQL
 * filter expressions, `label` is the human-readable display name, and
 * `group` (optional) populates the dropdown's section headers (e.g.
 * timezone region: "Europe", "America", …).
 */
export interface MultiOptionRow {
    readonly value: string;
    readonly label: string;
    readonly group?: string | null;
    readonly description?: string | null;
}

/**
 * Group bucket consumed by the template — produced by
 * {@link MultiOptionSelectComponent.groupedOptions} from the flat
 * {@link MultiOptionRow} list. Ungrouped options accumulate under
 * `null` and render without a section header.
 */
interface OptionGroup {
    readonly name: string | null;
    readonly rows: readonly MultiOptionRow[];
}

/**
 * Multi-value select with grouped dropdown, chip-rendered trigger,
 * and debounced client-side search.
 *
 * Two operating modes (mutually exclusive, `apiUrl` wins when both
 * are set):
 *  1. **Static** — pass a frozen `options` array. Useful for small
 *     enum-style lists where the backend already shipped every row
 *     inline via the YAML's `options.enumOptions` block (e.g. the
 *     Calendar `currentUserAccess` access categories).
 *  2. **Lazy** — pass `apiUrl` pointing at an `/api/v1/options/{key}`
 *     endpoint exposed by the OptionSource platform. The component
 *     pulls every page on open (most catalogues are short — TZ list
 *     ~400 rows — so a single fetch is fine) and renders grouped.
 *
 * The component's contract is intentionally narrow: it owns its own
 * open/close state and renders a chip-styled trigger button that
 * shows "N selected" when collapsed and the chip-list inline when
 * the parent gives it enough horizontal space.
 *
 * Built for the DataGrid `in`-op filter row (OptionSource ship #492),
 * but standalone — any caller wanting a grouped multi-select can wire
 * it the same way.
 */
@Component({
    selector: 'app-multi-option-select',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CmsLoaderComponent, ReactiveFormsModule],
    template: `
        <div class="mos-trigger" #wrapper (click)="toggleOpen()">
            @if (selectedRows().length === 0) {
                <span class="mos-placeholder">{{ placeholder() }}</span>
            } @else {
                <span class="mos-chips">
                    @for (row of selectedRows(); track row.value) {
                        <span class="mos-chip" title="{{ row.label }}">
                            {{ row.label }}
                            <button type="button"
                                    class="mos-chip__x"
                                    (click)="removeValue(row.value, $event)"
                                    title="Remove">×</button>
                        </span>
                    }
                </span>
            }
            <i class="bi bi-chevron-down mos-chevron"
               [class.mos-chevron--open]="isOpen()"></i>
        </div>

        @if (isOpen()) {
            <div class="mos-dropdown"
                 #dropPanel
                 [style.top.px]="dropTop()"
                 [style.left.px]="dropLeft()"
                 [style.width.px]="dropWidth()">

                <div class="mos-search-wrap">
                    <input #searchInput
                           type="text"
                           class="mos-search"
                           [placeholder]="'Search ' + entityLabel() + '…'"
                           [formControl]="searchControl"
                           (keydown.escape)="close()" />
                </div>

                @if (loading()) {
                    <div class="mos-message">
                        <cms-loader [inline]="true" />
                        Loading…
                    </div>
                }

                @if (!loading()) {
                    <div class="mos-list">
                        @if (visibleCount() === 0) {
                            <div class="mos-message">No results</div>
                        }
                        @for (group of groupedOptions(); track group.name) {
                            @if (group.name !== null) {
                                <div class="mos-group-header">{{ group.name }}</div>
                            }
                            @for (row of group.rows; track row.value) {
                                <label class="mos-option"
                                       [class.mos-option--checked]="isChecked(row.value)">
                                    <input type="checkbox"
                                           [checked]="isChecked(row.value)"
                                           (change)="toggleValue(row.value)" />
                                    <span>{{ row.label }}</span>
                                </label>
                            }
                        }
                    </div>
                }

                @if (values().length > 0) {
                    <div class="mos-footer">
                        <button type="button" class="mos-clear-all"
                                (click)="clearAll($event)">
                            Clear all ({{ values().length }})
                        </button>
                    </div>
                }
            </div>
        }
    `,
    styles: [`
        :host { display: block; }

        .mos-trigger {
            display: flex; align-items: center; gap: 6px;
            padding: 3px 8px;
            border: 1px solid var(--cms-btn-border, #d1d5db);
            border-radius: var(--cms-radius, 4px);
            background: var(--cms-surface);
            cursor: pointer;
            font-size: .8125rem;
            color: var(--cms-text, #111827);
            min-height: 28px;
            transition: border-color .1s;
            user-select: none;
            overflow: hidden;
            &:hover { border-color: var(--cms-btn-hover-border, #9ca3af); }
        }
        .mos-placeholder { flex: 1; color: var(--cms-text-muted, #6b7280); }
        .mos-chips {
            flex: 1; min-width: 0;
            display: flex; flex-wrap: wrap; gap: 3px;
            overflow: hidden;
        }
        .mos-chip {
            display: inline-flex; align-items: center; gap: 3px;
            padding: 1px 5px;
            background: var(--cms-accent-light, #eff6ff);
            color: var(--cms-accent, #1d4ed8);
            border-radius: 2px;
            font-size: .7rem;
            line-height: 1.2;
            white-space: nowrap;
            max-width: 140px;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .mos-chip__x {
            display: inline-flex; align-items: center; justify-content: center;
            width: 13px; height: 13px;
            border: 0; padding: 0;
            background: transparent;
            color: inherit;
            cursor: pointer;
            font-size: .9rem;
            line-height: 1;
            border-radius: 2px;
            &:hover { background: rgba(0,0,0,.08); }
        }
        .mos-chevron {
            font-size: .625rem;
            color: var(--cms-text-secondary, #9ca3af);
            flex-shrink: 0;
            transition: transform .15s;
        }
        .mos-chevron--open { transform: rotate(180deg); }

        .mos-dropdown {
            position: fixed;
            z-index: 1200;
            background: var(--cms-surface);
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius, 4px);
            box-shadow: var(--cms-shadow-md, 0 4px 12px rgba(0,0,0,.12));
            display: flex;
            flex-direction: column;
            max-height: 360px;
            overflow: hidden;
        }
        .mos-search-wrap {
            padding: 6px 8px;
            border-bottom: 1px solid var(--cms-border, #e5e7eb);
            flex-shrink: 0;
        }
        .mos-search {
            width: 100%;
            border: 1px solid var(--cms-btn-border, #d1d5db);
            border-radius: var(--cms-radius-sm, 3px);
            padding: 4px 8px;
            font-size: .8125rem;
            outline: none;
            &:focus {
                border-color: var(--cms-accent, #2563eb);
                box-shadow: 0 0 0 2px rgba(37,99,235,.15);
            }
        }
        .mos-list { flex: 1; overflow-y: auto; padding: 4px 0; }
        .mos-group-header {
            padding: 4px 12px 2px;
            font-size: .65rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: .04em;
            color: var(--cms-text-muted, #6b7280);
            background: var(--cms-border-light, #f9fafb);
            border-top: 1px solid var(--cms-border, #e5e7eb);
            border-bottom: 1px solid var(--cms-border, #e5e7eb);
            position: sticky;
            top: 0;
            z-index: 1;
        }
        .mos-group-header:first-child { border-top: 0; }
        .mos-option {
            display: flex; align-items: center; gap: 8px;
            padding: 5px 12px;
            cursor: pointer;
            font-size: .8125rem;
            color: var(--cms-text, #111827);
            &:hover { background: var(--cms-border-light, #f3f4f6); }
            input { margin: 0; cursor: pointer; }
            span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        }
        .mos-option--checked { background: var(--cms-accent-light, #eff6ff); }
        .mos-option--checked span { font-weight: 500; }
        .mos-message {
            padding: 12px;
            text-align: center;
            font-size: .8125rem;
            color: var(--cms-text-muted, #6b7280);
            display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .mos-footer {
            border-top: 1px solid var(--cms-border, #e5e7eb);
            padding: 4px 8px;
            flex-shrink: 0;
        }
        .mos-clear-all {
            border: 0; background: transparent;
            color: var(--cms-text-muted, #6b7280);
            font-size: .75rem;
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 2px;
            &:hover { background: var(--cms-border-light, #f3f4f6); color: var(--cms-text, #111827); }
        }
    `],
})
export class MultiOptionSelectComponent implements OnInit {
    // ─── Inputs ──────────────────────────────────────────────────────

    /** Currently-selected option values. */
    readonly values = input<readonly string[]>([]);

    /** Trigger placeholder when nothing is selected. */
    readonly placeholder = input<string>('— Any —');

    /** Search-box placeholder ("Search timezone…"). */
    readonly entityLabel = input<string>('option');

    /**
     * Lazy mode: tagged-source endpoint, e.g.
     * `/api/v1/options/calendar.timezones`. The component pulls the
     * full catalogue on first open (most catalogues are short — TZ
     * list ~400 rows). When unset, falls back to the static
     * {@link options} input.
     */
    readonly apiUrl = input<string | null>(null);

    /**
     * Static mode: pre-loaded option rows from a YAML
     * `options.enumOptions` block. Ignored when {@link apiUrl} is set.
     */
    readonly options = input<readonly MultiOptionRow[]>([]);

    // ─── Outputs ─────────────────────────────────────────────────────

    readonly valuesChange = output<readonly string[]>();

    // ─── Internals ───────────────────────────────────────────────────

    private readonly http       = inject(HttpClient);
    private readonly store      = inject(Store);
    private readonly destroyRef = inject(DestroyRef);

    @ViewChild('wrapper')   wrapperRef!: ElementRef<HTMLElement>;
    @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
    @ViewChild('dropPanel', { static: false }) set dropPanelRef(ref: ElementRef<HTMLElement> | undefined) {
        this.dropdownPanelEl = ref?.nativeElement ?? null;
    }

    private dropdownPanelEl: HTMLElement | null = null;

    readonly isOpen        = signal(false);
    readonly loading       = signal(false);
    readonly lazyRows      = signal<readonly MultiOptionRow[]>([]);
    readonly searchQuery   = signal('');
    readonly hasLoadedLazy = signal(false);

    // Fixed-position dropdown coords — recalculated on open
    readonly dropTop   = signal(0);
    readonly dropLeft  = signal(0);
    readonly dropWidth = signal(260);

    readonly searchControl = new FormControl('');

    /** True when the component pulls rows from an API endpoint. */
    private readonly lazyMode = computed(() => (this.apiUrl() ?? '') !== '');

    /** Pool of rows the dropdown can display (pre-search filter). */
    private readonly pool = computed<readonly MultiOptionRow[]>(() => {
        return this.lazyMode() ? this.lazyRows() : this.options();
    });

    /**
     * Search-filtered rows (case-insensitive substring on label OR
     * group name — typing "Europe" shows the whole Europe block).
     */
    private readonly filtered = computed<readonly MultiOptionRow[]>(() => {
        const q = this.searchQuery().trim().toLowerCase();
        if ('' === q) return this.pool();
        return this.pool().filter(r =>
            r.label.toLowerCase().includes(q)
            || (r.group ?? '').toLowerCase().includes(q),
        );
    });

    /**
     * Rows grouped by `group` for rendering. Preserves the upstream
     * row order (groups appear in their first-encountered order; rows
     * within a group keep their declared sequence). Ungrouped rows
     * accumulate under `null` and render without a header.
     */
    readonly groupedOptions = computed<readonly OptionGroup[]>(() => {
        const out: OptionGroup[] = [];
        const byName = new Map<string | null, MultiOptionRow[]>();
        for (const row of this.filtered()) {
            const key = row.group ?? null;
            let bucket = byName.get(key);
            if (!bucket) {
                bucket = [];
                byName.set(key, bucket);
                out.push({ name: key, rows: bucket });
            }
            bucket.push(row);
        }
        // Render the snapshot as a frozen-shape readonly list. The
        // mutable bucket arrays back the `rows` slots; that's fine
        // because nothing else holds references to them.
        return out;
    });

    readonly visibleCount = computed(() => this.filtered().length);

    /**
     * Project the bound value list back into rows. Falls back to a
     * minimal `{value, label: value}` synth when the pool hasn't
     * loaded yet or the value isn't in it — so the trigger always
     * renders something the user can recognise.
     */
    readonly selectedRows = computed<readonly MultiOptionRow[]>(() => {
        const sel = this.values();
        if (sel.length === 0) return [];
        const pool = this.pool();
        const byValue = new Map<string, MultiOptionRow>();
        for (const r of pool) byValue.set(r.value, r);
        return sel.map(v => byValue.get(v) ?? { value: v, label: v });
    });

    constructor() {
        // Reset lazy cache when the apiUrl changes (the catalogue
        // could be totally different now). Same-URL reopens reuse
        // the cache — important because the timezone list is ~400
        // rows and we don't want to refetch on every dropdown open.
        effect(() => {
            const url = this.apiUrl() ?? '';
            untracked(() => {
                this.hasLoadedLazy.set(false);
                this.lazyRows.set([]);
                if ('' !== url && this.isOpen()) {
                    this.fetchLazy();
                }
            });
        });

        // Load the catalogue when values arrive PRESELECTED, not only on open.
        //
        // `selectedRows` falls back to `{value, label: value}` for a value the
        // pool doesn't have, and in lazy mode the pool is empty until the user
        // opens the dropdown — so a form loading saved values showed raw wire
        // tokens ("rss", "webhook") where it had shown labels a moment earlier
        // when the same values were picked by hand. The fallback is still the
        // right behaviour for a value the catalogue genuinely lacks; what was
        // wrong is never asking.
        //
        // Cost is proportional to the problem: a picker that starts empty (a
        // grid filter row, the common case) still fetches nothing until opened.
        effect(() => {
            const hasValues = this.values().length > 0;
            const lazy = (this.apiUrl() ?? '') !== '';
            untracked(() => {
                if (hasValues && lazy && !this.hasLoadedLazy() && !this.loading()) {
                    this.fetchLazy();
                }
            });
        });
    }

    ngOnInit(): void {
        this.searchControl.valueChanges.pipe(
            debounceTime(150),
            distinctUntilChanged(),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(q => this.searchQuery.set(q ?? ''));
    }

    // ─── User interactions ───────────────────────────────────────────

    @HostListener('document:click', ['$event.target'])
    onOutsideClick(target: EventTarget | null): void {
        // `$event.target` is an EventTarget; narrow it once so the DOM
        // containment check below stays a real check.
        const node = target instanceof Node ? target : null;
        if (!this.isOpen()) return;
        const inTrigger  = this.wrapperRef?.nativeElement.contains(node);
        const inDropdown = this.dropdownPanelEl?.contains(node);
        if (!inTrigger && !inDropdown) this.close();
    }

    toggleOpen(): void {
        this.isOpen.update(v => !v);
        if (this.isOpen()) {
            const rect = this.wrapperRef.nativeElement.getBoundingClientRect();
            this.dropTop.set(rect.bottom + 2);
            this.dropLeft.set(rect.left);
            this.dropWidth.set(Math.max(rect.width, 260));
            // Focus search box on the next tick (template just rendered).
            setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
            // Fetch lazy rows on first open (one-shot per apiUrl).
            if (this.lazyMode() && !this.hasLoadedLazy()) {
                this.fetchLazy();
            }
        }
    }

    close(): void {
        this.isOpen.set(false);
        this.searchControl.reset('', { emitEvent: false });
        this.searchQuery.set('');
    }

    isChecked(value: string): boolean {
        return this.values().includes(value);
    }

    toggleValue(value: string): void {
        const current = [...this.values()];
        const idx = current.indexOf(value);
        if (idx >= 0) current.splice(idx, 1);
        else current.push(value);
        this.valuesChange.emit(current);
    }

    removeValue(value: string, event: Event): void {
        event.stopPropagation();
        const next = this.values().filter(v => v !== value);
        this.valuesChange.emit(next);
    }

    clearAll(event: Event): void {
        event.stopPropagation();
        this.valuesChange.emit([]);
    }

    // ─── Lazy fetch ──────────────────────────────────────────────────

    /**
     * One-shot full-catalogue fetch from the OptionSource endpoint.
     * Hydra envelope with `member` array; each member projects to a
     * {@link MultiOptionRow}. Pagination is intentionally NOT followed
     * — the OptionSource endpoint is designed for short catalogues
     * (timezones, currencies, languages, …) where one fetch is fine
     * and the in-dropdown search box covers the user's narrowing need.
     */
    private fetchLazy(): void {
        const url = this.apiUrl();
        if (!url) return;
        this.loading.set(true);
        const token = this.store.selectSnapshot(AuthState.accessToken);
        this.http.get<Record<string, unknown>>(`${url}?limit=2000`, {
            headers: {
                Accept:        'application/ld+json',
                Authorization: `Bearer ${token ?? ''}`,
            },
        }).pipe(
            catchError(() => of({} as Record<string, unknown>)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(r => {
            const members = (r['member'] ?? r['hydra:member'] ?? []) as
                ReadonlyArray<Record<string, unknown>>;
            const rows: MultiOptionRow[] = [];
            for (const m of members) {
                // An option source may legitimately offer an EMPTY value — the
                // newsletter's default list is stored as `''`, and dropping it
                // would make the one list every install has unfilterable. So the
                // guard tests for a missing/null field (a malformed row) rather
                // than for emptiness, which is a real value.
                const raw = m['value'];
                if (raw === undefined || raw === null) continue;
                const value = String(raw);
                rows.push({
                    value,
                    label:       String(m['label'] ?? value),
                    group:       (m['group'] as string | null | undefined) ?? null,
                    description: (m['description'] as string | null | undefined) ?? null,
                });
            }
            this.lazyRows.set(rows);
            this.hasLoadedLazy.set(true);
            this.loading.set(false);
        });
    }
}
