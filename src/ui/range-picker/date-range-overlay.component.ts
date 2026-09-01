import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    input,
    output,
    signal,
} from '@angular/core';

import { UserCalendarPreferencesService } from '../../util/user-calendar-preferences.service';
import { MonthGridComponent } from './month-grid.component';
import { formatLocalDate } from './prefs-format';

/**
 * — Shared date-range overlay panel.
 *
 * Renders two consecutive months side-by-side, the click-start/click-end
 * state machine, hover preview, optional preset chips, and the
 * Cancel / Reset / Apply footer. Used by both date-range and
 * datetime-range pickers (the datetime variant decorates the footer
 * with time-of-day pickers; that lives in a sibling component that
 * composes this overlay).
 *
 * Selection flow:
 *   - Initial state: both pending values null (or seeded from `value`).
 *   - User clicks day A -> pendingStart = A, pendingEnd = null.
 *   - User hovers day B -> hoverEnd = B (drives in-range preview).
 *   - User clicks day B -> pendingEnd = B; if B < A, swap so we
 *     always store [lo, hi] in chronological order.
 *   - User clicks Apply -> emits `apply({start, end})`.
 *   - User clicks Cancel / clicks outside -> emits `cancel()`.
 *
 * Inputs preserve the host picker's existing public contract — `min`,
 * `max`, `firstDay`, `value` — so the host just forwards them.
 */
export interface DateRangeOverlayResult {
    readonly start: string;  // YYYY-MM-DD
    readonly end:   string;  // YYYY-MM-DD
}

@Component({
    selector: 'cms-date-range-overlay',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MonthGridComponent],
    template: `
        <div class="overlay" (mouseleave)="onMouseLeave()">
            <header class="overlay__head">
                <button type="button" class="overlay__nav" (click)="prev()" aria-label="Previous month">
                    <i class="bi bi-chevron-left"></i>
                </button>
                <div class="overlay__summary">
                    @if (pendingStart()) {
                        <span class="overlay__chip">{{ pendingStartDisplay() }}</span>
                    } @else {
                        <span class="overlay__placeholder">Start date</span>
                    }
                    <span class="overlay__arrow" aria-hidden="true">→</span>
                    @if (pendingEnd()) {
                        <span class="overlay__chip">{{ pendingEndDisplay() }}</span>
                    } @else {
                        <span class="overlay__placeholder">End date</span>
                    }
                </div>
                <button type="button" class="overlay__nav" (click)="next()" aria-label="Next month">
                    <i class="bi bi-chevron-right"></i>
                </button>
            </header>

            <div class="overlay__months">
                <div class="overlay__month">
                    <div class="overlay__month-title">{{ leftTitle() }}</div>
                    <cms-month-grid
                        [year]="leftYear()"
                        [month]="leftMonth()"
                        [firstDay]="firstDay()"
                        [rangeStart]="pendingStart()"
                        [rangeEnd]="pendingEnd()"
                        [hoverEnd]="hoverEnd()"
                        [min]="min()"
                        [max]="max()"
                        (dayClick)="onDayClick($event)"
                        (dayHover)="onDayHover($event)" />
                </div>
                <div class="overlay__month">
                    <div class="overlay__month-title">{{ rightTitle() }}</div>
                    <cms-month-grid
                        [year]="rightYear()"
                        [month]="rightMonth()"
                        [firstDay]="firstDay()"
                        [rangeStart]="pendingStart()"
                        [rangeEnd]="pendingEnd()"
                        [hoverEnd]="hoverEnd()"
                        [min]="min()"
                        [max]="max()"
                        (dayClick)="onDayClick($event)"
                        (dayHover)="onDayHover($event)" />
                </div>
            </div>

            @if (showPresets()) {
                <div class="overlay__presets">
                    <button type="button" class="overlay__preset" (click)="applyPreset('today')">Today</button>
                    <button type="button" class="overlay__preset" (click)="applyPreset('last7')">Last 7 days</button>
                    <button type="button" class="overlay__preset" (click)="applyPreset('last30')">Last 30 days</button>
                    <button type="button" class="overlay__preset" (click)="applyPreset('thisMonth')">This month</button>
                    <button type="button" class="overlay__preset" (click)="applyPreset('lastMonth')">Last month</button>
                </div>
            }

            <footer class="overlay__foot">
                <button type="button" class="cms-btn cms-btn-link" (click)="reset()">Reset</button>
                <div class="overlay__foot-actions">
                    <button type="button" class="cms-btn cms-btn-link" (click)="cancelled.emit()">Cancel</button>
                    <button type="button" class="cms-btn cms-btn-primary"
                            [disabled]="!canApply()"
                            (click)="onApply()">Apply</button>
                </div>
            </footer>
        </div>
    `,
    styles: [`
        :host { display: block; }
        .overlay {
            background: var(--cms-surface, #fff);
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius-md, 8px);
            box-shadow: var(--cms-shadow-lg, 0 8px 24px rgba(0,0,0,.12));
            padding: 12px 16px;
            min-width: 540px;
        }
        .overlay__head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 8px;
        }
        .overlay__nav {
            background: transparent;
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius-sm, 4px);
            padding: 4px 8px;
            cursor: pointer;
            color: var(--cms-text, #111827);
        }
        .overlay__nav:hover { background: var(--cms-bg-hover, #f3f4f6); }
        .overlay__summary {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: .85rem;
            color: var(--cms-text, #111827);
        }
        .overlay__chip {
            padding: 2px 8px;
            border-radius: var(--cms-radius-sm, 4px);
            background: var(--cms-accent-light, #FEF7E6);
            color: var(--cms-accent-text, #7C4D00);
            font-weight: 500;
        }
        .overlay__placeholder { color: var(--cms-text-muted, #848b96); }
        .overlay__arrow { color: var(--cms-text-muted, #848b96); }
        .overlay__months {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 8px;
        }
        .overlay__month-title {
            text-align: center;
            font-size: .85rem;
            font-weight: 600;
            color: var(--cms-text, #111827);
            margin-bottom: 4px;
        }
        .overlay__presets {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            padding-top: 8px;
            border-top: 1px solid var(--cms-border, #e5e7eb);
            margin-top: 8px;
        }
        .overlay__preset {
            background: transparent;
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: 12px;
            padding: 2px 10px;
            font-size: .75rem;
            cursor: pointer;
            color: var(--cms-text, #111827);
        }
        .overlay__preset:hover {
            background: var(--cms-bg-hover, #f3f4f6);
            border-color: var(--cms-accent, #F5A623);
        }
        .overlay__foot {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-top: 8px;
            margin-top: 8px;
            border-top: 1px solid var(--cms-border, #e5e7eb);
        }
        .overlay__foot-actions { display: flex; gap: 8px; }

        .bi { line-height: 1; }
    `],
})
export class DateRangeOverlayComponent {
    private readonly userPrefs = inject(UserCalendarPreferencesService);

    // -- Inputs ---------------------------------------------------------------

    /** Seed value (`YYYY-MM-DD` pair) — overlay opens with these selected. */
    readonly value       = input<DateRangeOverlayResult | null>(null);
    readonly min         = input<string | null>(null);
    readonly max         = input<string | null>(null);
    /** 0 = Sunday-first, 1 = Monday-first. Pulled from user prefs on default. */
    readonly firstDay    = input<0 | 1>(1);
    /** Hides preset chips (Today / Last 7 / etc) when false. Defaults true. */
    readonly showPresets = input<boolean>(true);

    // -- Outputs --------------------------------------------------------------

    readonly apply = output<DateRangeOverlayResult>();
    // `cancelled`, not `cancel`: an output named after a native DOM event is
    // ambiguous in a template -- `(cancel)` could bind either, and which one
    // wins is not something the reader of the template can see.
    readonly cancelled = output<void>();

    // -- Internal state -------------------------------------------------------

    /** First day of the LEFT month displayed (year + month index). */
    private readonly cursor = signal<{ year: number; month: number }>(initialCursor());

    /** Pending start, committed once user clicks anywhere. */
    readonly pendingStart = signal<string | null>(null);
    /** Pending end, committed once user clicks a second time. */
    readonly pendingEnd   = signal<string | null>(null);
    /** Hover preview end (only meaningful when start picked + end not). */
    readonly hoverEnd     = signal<string | null>(null);

    readonly leftYear  = computed(() => this.cursor().year);
    readonly leftMonth = computed(() => this.cursor().month);
    readonly rightYear = computed(() => {
        const { year, month } = this.cursor();
        return month === 11 ? year + 1 : year;
    });
    readonly rightMonth = computed(() => (this.cursor().month + 1) % 12);

    readonly leftTitle  = computed(() => monthTitle(this.leftYear(),  this.leftMonth()));
    readonly rightTitle = computed(() => monthTitle(this.rightYear(), this.rightMonth()));

    readonly pendingStartDisplay = computed(() => {
        const v = this.pendingStart();
        return v ? formatLocalDate(v, this.userPrefs.dateFormat()) : '';
    });
    readonly pendingEndDisplay = computed(() => {
        const v = this.pendingEnd();
        return v ? formatLocalDate(v, this.userPrefs.dateFormat()) : '';
    });

    readonly canApply = computed(() =>
        this.pendingStart() !== null && this.pendingEnd() !== null,
    );

    constructor() {
        // Seed from input on mount.
        const v = this.value();
        if (v) {
            this.pendingStart.set(v.start);
            this.pendingEnd.set(v.end);
            // Position the cursor so the seeded start is on the LEFT month.
            const startDate = parseIso(v.start);
            if (startDate) {
                this.cursor.set({ year: startDate.getFullYear(), month: startDate.getMonth() });
            }
        }
    }

    // -- Selection ------------------------------------------------------------

    onDayClick(iso: string): void {
        const s = this.pendingStart();
        const e = this.pendingEnd();
        if (s === null || (s !== null && e !== null)) {
            // Either nothing picked yet, or both picked -> start fresh.
            this.pendingStart.set(iso);
            this.pendingEnd.set(null);
            this.hoverEnd.set(null);
            return;
        }
        // We have a start, no end -> this click commits end.
        if (iso < s) {
            // Clicked before start -> swap so [lo, hi] stays chronological.
            this.pendingStart.set(iso);
            this.pendingEnd.set(s);
        } else {
            this.pendingEnd.set(iso);
        }
        this.hoverEnd.set(null);
    }

    onDayHover(iso: string): void {
        // Only relevant when we have a start but not yet an end.
        if (this.pendingStart() && !this.pendingEnd()) {
            this.hoverEnd.set(iso);
        }
    }

    onMouseLeave(): void {
        // Clear the hover preview when the cursor exits the panel.
        this.hoverEnd.set(null);
    }

    prev(): void {
        const { year, month } = this.cursor();
        this.cursor.set(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
    }

    next(): void {
        const { year, month } = this.cursor();
        this.cursor.set(month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });
    }

    reset(): void {
        this.pendingStart.set(null);
        this.pendingEnd.set(null);
        this.hoverEnd.set(null);
    }

    onApply(): void {
        const s = this.pendingStart();
        const e = this.pendingEnd();
        if (!s || !e) return;
        this.apply.emit({ start: s, end: e });
    }

    applyPreset(kind: 'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth'): void {
        const today = new Date();
        const todayIso = isoOf(today);
        let start = todayIso;
        let end   = todayIso;
        switch (kind) {
            case 'today':
                break;
            case 'last7': {
                const s = new Date(today);
                s.setDate(s.getDate() - 6);
                start = isoOf(s);
                break;
            }
            case 'last30': {
                const s = new Date(today);
                s.setDate(s.getDate() - 29);
                start = isoOf(s);
                break;
            }
            case 'thisMonth': {
                start = isoOf(new Date(today.getFullYear(), today.getMonth(), 1));
                end   = isoOf(new Date(today.getFullYear(), today.getMonth() + 1, 0));
                break;
            }
            case 'lastMonth': {
                start = isoOf(new Date(today.getFullYear(), today.getMonth() - 1, 1));
                end   = isoOf(new Date(today.getFullYear(), today.getMonth(), 0));
                break;
            }
        }
        this.pendingStart.set(start);
        this.pendingEnd.set(end);
        this.hoverEnd.set(null);
        // Move the cursor so the preset start lands on the left month.
        const startDate = parseIso(start);
        if (startDate) {
            this.cursor.set({ year: startDate.getFullYear(), month: startDate.getMonth() });
        }
    }
}

function initialCursor(): { year: number; month: number } {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
}

function monthTitle(year: number, month: number): string {
    const names = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return `${names[month]} ${year}`;
}

function parseIso(iso: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function isoOf(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}
