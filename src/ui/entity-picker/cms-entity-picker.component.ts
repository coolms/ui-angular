
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    HostListener,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    untracked,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { EntitySearchResult, EntitySearchService } from '@coolms/core-angular';
/**
 * Phase 2 (ADR-094) generic entity picker — drop-in replacement for
 * a scalar text input when a template's contextSchema declares a
 * variable's `entityType`.
 *
 * Behaviour:
 *  - Single mode (`collection = false`): emits a chosen entity's id
 *    as a string via `valueChange`. Selecting closes the dropdown
 *    and shows the picked entity as a removable chip.
 *  - Collection mode (`collection = true`): emits a list of ids.
 *    Selection accumulates; each pick clears the search input but
 *    keeps the dropdown open. Removal of any chip emits the
 *    shortened list (or `null` when the list empties).
 *  - Search is debounced 250ms and case-insensitive at the backend.
 *    Picker doesn't auto-load on focus to keep the
 *    `/api/entity-search` hit count low.
 *  - The backend's `secondary` field, when present, renders as a
 *    second muted line per result.
 *
 * Known Phase 2b limitation: a pre-existing `value` (passed by the
 * form on edit / re-open) is acknowledged via the chip state, but
 * the *label* isn't fetched — we don't have a "fetch by id" round
 * trip yet. The chip shows `"id: <uuid>"` placeholder; clicking the
 * × clears the value. Future work: add a bulk-by-id endpoint to
 * EntitySearchService and pre-fetch labels on first load.
 */
@Component({
    selector: 'cms-entity-picker',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <div class="cms-entity-picker"
             [class.cms-entity-picker--open]="isOpen()">

            @if (collection() && hasSelection()) {
                <div class="cms-entity-picker__chips">
                    @for (item of selectedItems(); track item.id) {
                        <span class="cms-entity-picker__chip">
                            {{ item.label }}
                            <button type="button"
                                    class="cms-entity-picker__chip-remove"
                                    (click)="onRemoveChip(item)"
                                    aria-label="Remove">×</button>
                        </span>
                    }
                </div>
            }

            <div class="cms-entity-picker__input-wrap">
                @if (!collection() && hasSelection()) {
                    <div class="cms-entity-picker__single">
                        <span class="cms-entity-picker__single-label">{{ displayLabel() }}</span>
                        <button type="button"
                                class="cms-entity-picker__single-remove"
                                (click)="onRemoveSingle()"
                                aria-label="Clear">×</button>
                    </div>
                } @else {
                    <input type="text"
                           class="cms-entity-picker__input"
                           [id]="inputId()"
                           [placeholder]="placeholder()"
                           [ngModel]="searchQuery()"
                           (ngModelChange)="onSearchInput($event)"
                           (focus)="onFocusInput()"
                           (blur)="onBlurInput()"
                           autocomplete="off"
                           spellcheck="false" />
                }
            </div>

            @if (isOpen() && results().length > 0) {
                <ul class="cms-entity-picker__results">
                    @for (result of results(); track result.id) {
                        <li class="cms-entity-picker__result"
                            (mousedown)="onSelectResult(result)">
                            <div class="cms-entity-picker__result-label">{{ result.label }}</div>
                            @if (result.secondary) {
                                <div class="cms-entity-picker__result-secondary">
                                    {{ result.secondary }}
                                </div>
                            }
                        </li>
                    }
                </ul>
            }

            @if (isOpen() && results().length === 0 && searchQuery().length >= 2) {
                <div class="cms-entity-picker__empty">No results.</div>
            }
        </div>
    `,
    styles: [`
        :host { display: block; }
        .cms-entity-picker {
            position: relative;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .cms-entity-picker__chips {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }
        .cms-entity-picker__chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            background: var(--cms-bg-muted, #f3f4f6);
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius-sm, 4px);
            font-size: 0.8125rem;
            color: var(--cms-text, #111827);
        }
        .cms-entity-picker__chip-remove,
        .cms-entity-picker__single-remove {
            border: none;
            background: transparent;
            cursor: pointer;
            color: var(--cms-text-muted, #848b96);
            font-size: 1rem;
            line-height: 1;
            padding: 0 2px;
        }
        .cms-entity-picker__chip-remove:hover,
        .cms-entity-picker__single-remove:hover {
            color: var(--cms-text, #111827);
        }
        .cms-entity-picker__input-wrap {
            position: relative;
        }
        .cms-entity-picker__input {
            width: 100%;
            padding: 6px 10px;
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius, 6px);
            font: inherit;
            font-size: 0.875rem;
            background: var(--cms-bg, #f8f9fa);
            color: var(--cms-text, #111827);
        }
        .cms-entity-picker__input:focus {
            outline: none;
            border-color: var(--cms-accent, #F5A623);
            box-shadow: 0 0 0 2px var(--cms-accent-light, #FEF7E6);
        }
        .cms-entity-picker__single {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 6px 10px;
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius, 6px);
            background: var(--cms-bg, #f8f9fa);
            font-size: 0.875rem;
            color: var(--cms-text, #111827);
        }
        .cms-entity-picker__single-label {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .cms-entity-picker__results {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            margin: 2px 0 0 0;
            padding: 0;
            list-style: none;
            background: var(--cms-bg, #f8f9fa);
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius, 6px);
            box-shadow: var(--cms-shadow-md, 0 4px 12px rgba(0,0,0,.10));
            max-height: 300px;
            overflow-y: auto;
            z-index: 1000;
        }
        .cms-entity-picker__result {
            padding: 8px 10px;
            cursor: pointer;
            border-bottom: 1px solid var(--cms-border-light, #f0f2f5);
        }
        .cms-entity-picker__result:last-child {
            border-bottom: none;
        }
        .cms-entity-picker__result:hover {
            background: var(--cms-bg-muted, #f3f4f6);
        }
        .cms-entity-picker__result-label {
            font-size: 0.875rem;
            color: var(--cms-text, #111827);
        }
        .cms-entity-picker__result-secondary {
            font-size: 0.75rem;
            color: var(--cms-text-muted, #848b96);
            margin-top: 2px;
        }
        .cms-entity-picker__empty {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            margin-top: 2px;
            padding: 8px 10px;
            background: var(--cms-bg, #f8f9fa);
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius, 6px);
            color: var(--cms-text-muted, #848b96);
            font-size: 0.8125rem;
            text-align: center;
            z-index: 1000;
        }
    `],
})
export class CmsEntityPickerComponent {
    /** Fully-qualified PHP class name of the entity being searched. */
    readonly entityType = input.required<string>();
    /** When true, multi-select with chips; when false, single replacement. */
    readonly collection = input<boolean>(false);
    /** Externally controlled selection. */
    readonly value = input<string | string[] | null>(null);
    /** Placeholder for the search input. */
    readonly placeholder = input<string>('Search…');
    /** Backend search limit (clamped to [1, 100] server-side). */
    readonly limit = input<number>(20);
    /** Optional DOM id for label `for=` binding. */
    readonly inputId = input<string | null>(null);

    /** Emits the current selection in id-form (string, list, or null). */
    readonly valueChange = output<string | string[] | null>();

    private readonly searchService = inject(EntitySearchService);
    private readonly destroyRef = inject(DestroyRef);

    protected readonly searchQuery = signal<string>('');
    protected readonly isOpen = signal<boolean>(false);
    protected readonly selectedItems = signal<EntitySearchResult[]>([]);
    protected readonly results = signal<EntitySearchResult[]>([]);

    protected readonly displayLabel = computed<string | null>(() => {
        const items = this.selectedItems();
        if (items.length === 0) return null;
        if (this.collection()) return `${items.length} selected`;
        return items[0]?.label ?? null;
    });

    protected readonly hasSelection = computed<boolean>(() => this.selectedItems().length > 0);

    constructor() {
        // Reflect external `value` resets (e.g. parent clears the
        // form). On the *first* assignment we synthesize a stub
        // chip per id so the user sees the prior selection is
        // present — the label fetch isn't implemented in Phase 2b
        // (documented limitation), so the stub shows the id itself.
        // Subsequent valueChange emissions originate here and the
        // selectedItems we hold are authoritative.
        // `selectedItems` is BOTH written and read inside this effect:
        // direct signal reads would create a feedback loop that re-
        // fires the effect on every `set()`. `untracked()` reads the
        // current value without registering a dependency, so the
        // effect only re-runs when the *external* `value()` input
        // changes — which is the intended trigger.
        effect(() => {
            const val = this.value();
            if (val === null || (Array.isArray(val) && val.length === 0)) {
                this.selectedItems.set([]);
                return;
            }
            const ids = Array.isArray(val) ? val : [val];
            const known = untracked(() => this.selectedItems());
            const knownById = new Map(known.map((r) => [String(r.id), r]));
            const reconciled = ids.map<EntitySearchResult>((id) => {
                const k = knownById.get(String(id));
                if (k !== undefined) return k;
                return { id, label: `id: ${id}` };
            });
            this.selectedItems.set(reconciled);
        });

        // Debounced backend search piped through the destroy ref so
        // the subscription cleans up with the component.
        toObservable(this.searchQuery)
            .pipe(
                debounceTime(250),
                distinctUntilChanged(),
                switchMap((query) => {
                    if (query.trim().length < 2) {
                        return of([] as EntitySearchResult[]);
                    }
                    return this.searchService.search(this.entityType(), query, this.limit()).pipe(
                        catchError(() => of([] as EntitySearchResult[])),
                    );
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((rows) => this.results.set(rows));
    }

    /**
     * Close the dropdown when a click lands outside the picker. The
     * blur handler can't catch this reliably because of the
     * mousedown-on-result race; this host-level listener is the
     * stable close path.
     */
    @HostListener('document:mousedown', ['$event'])
    protected onDocumentMouseDown(event: MouseEvent): void {
        if (!this.isOpen()) return;
        const target = event.target as Node | null;
        const host = (event.currentTarget as Document).activeElement?.closest('cms-entity-picker');
        // If the event happened inside our host, the input/result
        // handlers will manage state — leave them be.
        if (host !== null && host?.contains(target)) {
            return;
        }
        this.isOpen.set(false);
    }

    protected onSearchInput(value: string): void {
        this.searchQuery.set(value);
        if (!this.isOpen()) this.isOpen.set(true);
    }

    protected onFocusInput(): void {
        this.isOpen.set(true);
    }

    protected onBlurInput(): void {
        // Delay so a mousedown-on-result fires before the dropdown
        // collapses. Without the delay, the click misses.
        setTimeout(() => this.isOpen.set(false), 200);
    }

    protected onSelectResult(result: EntitySearchResult): void {
        if (this.collection()) {
            const current = this.selectedItems();
            if (current.some((r) => String(r.id) === String(result.id))) {
                return;
            }
            const next = [...current, result];
            this.selectedItems.set(next);
            this.valueChange.emit(next.map((r) => String(r.id)));
            // Clear input but keep dropdown for further picks.
            this.searchQuery.set('');
        } else {
            this.selectedItems.set([result]);
            this.valueChange.emit(String(result.id));
            this.searchQuery.set('');
            this.isOpen.set(false);
        }
    }

    protected onRemoveChip(item: EntitySearchResult): void {
        const next = this.selectedItems().filter((r) => String(r.id) !== String(item.id));
        this.selectedItems.set(next);
        this.valueChange.emit(next.length === 0 ? null : next.map((r) => String(r.id)));
    }

    protected onRemoveSingle(): void {
        this.selectedItems.set([]);
        this.valueChange.emit(null);
    }
}
