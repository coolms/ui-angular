import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    HostListener,
    OnDestroy,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
} from '@angular/core';

import { UserCalendarPreferencesService } from '../../util/user-calendar-preferences.service';
import {
    DateRangeOverlayComponent,
    DateRangeOverlayResult,
} from './date-range-overlay.component';
import { formatLocalDate } from './prefs-format';

/**
 * #473 — Proper date range picker.
 *
 * Renders a SINGLE trigger field showing the span as one string
 * (e.g. `2026-05-01 → 2026-05-31`) in the user's `dateFormat`. Clicking
 * the trigger opens a fixed-position overlay panel with two consecutive
 * months side-by-side, click-start / click-end selection, hover preview,
 * preset chips, and Cancel / Reset / Apply buttons.
 *
 * Public API unchanged from the legacy #436 component so consumers
 * (DataGrid filter row, CalendarEventEditor) don't need updates:
 *
 *   Inputs:
 *     value:      DateRangeValue | null  — seeded selection
 *     min, max:   string | null          — YYYY-MM-DD bounds
 *     startLabel, endLabel: string       — accessibility labels (unused by
 *                                          the single-trigger UI but kept
 *                                          for back-compat)
 *     required:   boolean                — kept for back-compat
 *     disabled:   boolean
 *
 *   Output:
 *     valueChange: DateRangeValue | null — `null` when Reset or
 *                                          when both endpoints are blank
 *
 * Wire format on the output (`{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }`)
 * is unchanged so the backend `App\Core\Domain\ValueObject\DateRange`
 * consumes it without changes.
 */
export interface DateRangeValue {
    readonly start: string;  // YYYY-MM-DD
    readonly end:   string;  // YYYY-MM-DD
}

@Component({
    selector: 'app-date-range-picker',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DateRangeOverlayComponent],
    template: `
        <div class="picker" [class.picker--disabled]="disabled()">
            @if (label()) {
                <span class="picker__field-label">{{ label() }}</span>
            }
            <button type="button"
                    class="picker__trigger"
                    [class.picker__trigger--sm]="size() === 'sm'"
                    [disabled]="disabled()"
                    [attr.aria-label]="ariaLabel()"
                    [attr.aria-expanded]="open()"
                    (click)="toggle()">
                <span class="picker__value" [class.picker__value--placeholder]="!hasValue()">
                    {{ displayValue() }}
                </span>
                @if (allowClear() && hasValue() && !disabled()) {
                    <span class="picker__clear"
                          role="button"
                          tabindex="0"
                          aria-label="Clear date range"
                          (click)="$event.stopPropagation(); onClear()"
                          (keydown.enter)="$event.stopPropagation(); onClear()">×</span>
                }
                <i class="bi bi-calendar3 picker__icon" aria-hidden="true"></i>
            </button>
            @if (open()) {
                <div class="picker__overlay-anchor"
                     [style.top.px]="overlayTop()"
                     [style.left.px]="overlayLeft()">
                    <cms-date-range-overlay
                        [value]="pendingValue()"
                        [min]="min()"
                        [max]="max()"
                        [firstDay]="firstDay()"
                        (apply)="onApply($event)"
                        (cancelled)="close()" />
                </div>
            }
        </div>
    `,
    styles: [`
        :host { display: block; }
        .picker { position: relative; display: flex; flex-direction: column; gap: 4px; }
        .picker__field-label {
            font-size: .85rem;
            color: var(--cms-text, #111827);
        }
        .picker__trigger {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            width: 100%;
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius-sm, 4px);
            background: var(--cms-surface, #fff);
            padding: 6px 8px;
            font-size: .9rem;
            font-family: inherit;
            cursor: pointer;
            color: var(--cms-text, #111827);
            min-width: 0;
        }
        .picker__trigger:hover:not(:disabled) {
            border-color: var(--cms-accent, #F5A623);
        }
        .picker__trigger:focus-visible {
            outline: 2px solid var(--cms-accent, #F5A623);
            outline-offset: 1px;
        }
        .picker__trigger:disabled { opacity: .6; cursor: not-allowed; }
        .picker__trigger--sm {
            padding: 3px 6px;
            font-size: .8rem;
        }
        .picker__value {
            flex: 1;
            min-width: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            text-align: left;
        }
        .picker__value--placeholder { color: var(--cms-text-muted, #848b96); }
        .picker__icon {
            color: var(--cms-text-muted, #848b96);
            line-height: 1;
            flex-shrink: 0;
        }
        .picker__clear {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            color: var(--cms-text-muted, #848b96);
            font-size: 1.05rem;
            line-height: 1;
            cursor: pointer;
            user-select: none;
            flex-shrink: 0;
        }
        .picker__clear:hover {
            background: var(--cms-bg-hover, #f3f4f6);
            color: var(--cms-text, #111827);
        }
        .picker__overlay-anchor {
            position: fixed;
            z-index: 1000;
        }
    `],
})
export class DateRangePickerComponent implements OnDestroy {
    private readonly userPrefs = inject(UserCalendarPreferencesService);
    private readonly host      = inject(ElementRef<HTMLElement>);

    // ── Inputs ───────────────────────────────────────────────────────────────

    readonly value      = input<DateRangeValue | null>(null);
    readonly min        = input<string | null>(null);
    readonly max        = input<string | null>(null);
    readonly startLabel = input<string>('Start');
    readonly endLabel   = input<string>('End');
    readonly required   = input<boolean>(true);
    readonly disabled   = input<boolean>(false);
    /**
     * Trigger sizing. 'md' (default) matches a standard form input;
     * 'sm' shrinks padding + font-size to match dense contexts like
     * the DataGrid filter row.
     */
    readonly size       = input<'sm' | 'md'>('md');
    /**
     * Show an inline ×-clear button on the trigger when a value is set.
     * Set to `false` for required fields so the user can't drop the value
     * to null with a single click.
     */
    readonly allowClear = input<boolean>(true);
    /**
     * Optional field label rendered above the trigger. Set on standalone
     * form rows so the picker is self-labelling. Leave empty when the
     * surrounding layout already provides a label (e.g. DataGrid filter
     * row, where the column header is the label).
     */
    readonly label      = input<string>('');

    // ── Outputs ──────────────────────────────────────────────────────────────

    readonly valueChange = output<DateRangeValue | null>();

    // ── Internal state ───────────────────────────────────────────────────────

    private readonly _value = signal<DateRangeValue | null>(null);
    /** Mirror of `_value` consumed by the overlay's `value` input. */
    readonly pendingValue = computed<DateRangeOverlayResult | null>(() => this._value());

    readonly open = signal(false);
    readonly overlayTop  = signal(0);
    readonly overlayLeft = signal(0);

    /** Pulls firstDay from the user's prefs (0 = Sunday, 1 = Monday). */
    readonly firstDay = computed<0 | 1>(() => this.userPrefs.firstDay());

    readonly hasValue = computed(() => this._value() !== null);

    readonly displayValue = computed(() => {
        const v = this._value();
        if (!v) return 'Select date range';
        const fmt = this.userPrefs.dateFormat();
        return `${formatLocalDate(v.start, fmt)} → ${formatLocalDate(v.end, fmt)}`;
    });

    readonly ariaLabel = computed(() => {
        const v = this._value();
        return v
            ? `${this.startLabel()} ${v.start}, ${this.endLabel()} ${v.end}`
            : 'Select date range';
    });

    constructor() {
        // Sync seed value into internal state. Effect over `input` so callers
        // can update the value reactively (e.g. parent form patch).
        effect(() => {
            const v = this.value();
            this._value.set(v ?? null);
        });
    }

    toggle(): void {
        if (this.disabled()) return;
        if (this.open()) {
            this.close();
        } else {
            this.openOverlay();
        }
    }

    private openOverlay(): void {
        this.positionOverlay();
        this.open.set(true);
    }

    close(): void {
        this.open.set(false);
    }

    onApply(result: DateRangeOverlayResult): void {
        this._value.set(result);
        this.valueChange.emit(result);
        this.close();
    }

    onClear(): void {
        this._value.set(null);
        this.valueChange.emit(null);
    }

    /**
     * Compute fixed-position coordinates so the overlay shows under the
     * trigger but flips up if there isn't enough space below. Recomputed
     * on every open + on viewport resize / scroll while open.
     */
    private positionOverlay(): void {
        const rect = this.host.nativeElement.getBoundingClientRect();
        const margin = 4;
        const overlayHeight = 380;   // approx, matches our overlay min-height
        const overlayWidth  = 540;   // matches the overlay min-width

        let top  = rect.bottom + margin;
        if (top + overlayHeight > window.innerHeight) {
            top = Math.max(margin, rect.top - margin - overlayHeight);
        }
        let left = rect.left;
        if (left + overlayWidth > window.innerWidth) {
            left = Math.max(margin, window.innerWidth - overlayWidth - margin);
        }
        this.overlayTop.set(top);
        this.overlayLeft.set(left);
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        if (!this.open()) return;
        const target = event.target as Node;
        if (!this.host.nativeElement.contains(target) && !isInsideOverlay(target)) {
            this.close();
        }
    }

    @HostListener('document:keydown.escape')
    onEscape(): void {
        if (this.open()) this.close();
    }

    @HostListener('window:resize')
    @HostListener('window:scroll')
    onViewportChange(): void {
        if (this.open()) this.positionOverlay();
    }

    ngOnDestroy(): void {
        this.open.set(false);
    }
}

/**
 * Walks up the DOM tree to determine whether a click landed inside the
 * fixed-positioned overlay anchor. The anchor sits OUTSIDE the host
 * element's bounding box (it's `position: fixed`), so the standard
 * `contains` check on the host doesn't catch it.
 */
function isInsideOverlay(node: Node | null): boolean {
    let cur: Node | null = node;
    while (cur) {
        if (cur instanceof HTMLElement && cur.tagName === 'CMS-DATE-RANGE-OVERLAY') {
            return true;
        }
        cur = cur.parentNode;
    }
    return false;
}
