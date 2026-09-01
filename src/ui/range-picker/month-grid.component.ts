import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    output,
} from '@angular/core';

/**
 * — Shared month-grid primitive used by the range-picker overlay.
 *
 * Renders one month as a 7-column grid with a weekday header row and 6
 * week rows (always 6 to keep the overlay height stable across months).
 * Days from neighbouring months are rendered greyed-out so the grid
 * always starts on the user's preferred `firstDay` and stays rectangular.
 *
 * Pure presentational — owns no selection state. The parent overlay
 * passes `rangeStart`, `rangeEnd`, and `hoverEnd` as `YYYY-MM-DD` strings
 * (or null) and this component decorates day cells accordingly. Day
 * clicks bubble up via `dayClick`; hover updates bubble via `dayHover`
 * so the parent can render the in-range preview before the user commits
 * the end date.
 */
@Component({
    selector: 'cms-month-grid',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="month">
            <div class="month__head">
                @for (h of weekdayHeaders(); track h) {
                    <div class="month__head-cell">{{ h }}</div>
                }
            </div>
            <div class="month__body">
                @for (cell of cells(); track cell.iso) {
                    <button type="button"
                            class="month__cell"
                            [class.month__cell--other]="cell.otherMonth"
                            [class.month__cell--today]="cell.isToday"
                            [class.month__cell--start]="cell.isStart"
                            [class.month__cell--end]="cell.isEnd"
                            [class.month__cell--in-range]="cell.inRange"
                            [class.month__cell--disabled]="cell.disabled"
                            [disabled]="cell.disabled"
                            (click)="cell.disabled ? null : dayClick.emit(cell.iso)"
                            (mouseenter)="dayHover.emit(cell.iso)">
                        {{ cell.day }}
                    </button>
                }
            </div>
        </div>
    `,
    styles: [`
        :host { display: block; }
        .month__head, .month__body {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 2px;
        }
        .month__head { margin-bottom: 4px; }
        .month__head-cell {
            text-align: center;
            font-size: .7rem;
            font-weight: 600;
            color: var(--cms-text-muted, #848b96);
            text-transform: uppercase;
            padding: 4px 0;
        }
        .month__cell {
            border: none;
            background: transparent;
            border-radius: var(--cms-radius-sm, 4px);
            padding: 6px 0;
            font-size: .85rem;
            cursor: pointer;
            color: var(--cms-text, #111827);
            transition: background-color 80ms ease;
            text-align: center;
            font-family: inherit;
        }
        .month__cell:hover:not(:disabled) {
            background: var(--cms-bg-hover, #f3f4f6);
        }
        .month__cell--other { color: var(--cms-text-muted, #848b96); }
        .month__cell--today {
            font-weight: 700;
            box-shadow: inset 0 0 0 1px var(--cms-accent, #F5A623);
        }
        .month__cell--in-range {
            background: var(--cms-accent-light, #FEF7E6);
            color: var(--cms-accent-text, #7C4D00);
            border-radius: 0;
        }
        .month__cell--start, .month__cell--end {
            background: var(--cms-accent, #F5A623);
            color: var(--cms-accent-fg, #1a1a1a);
            font-weight: 600;
        }
        .month__cell--start { border-radius: 4px 0 0 4px; }
        .month__cell--end { border-radius: 0 4px 4px 0; }
        .month__cell--start.month__cell--end { border-radius: var(--cms-radius-sm, 4px); }
        .month__cell--disabled {
            opacity: .35;
            cursor: not-allowed;
        }
    `],
})
export class MonthGridComponent {
    /** Year shown by this grid (e.g. 2026). */
    readonly year     = input.required<number>();
    /** Month index 0-11 (e.g. 4 for May). */
    readonly month    = input.required<number>();
    /** First day of week: 0 = Sunday, 1 = Monday. */
    readonly firstDay = input<0 | 1>(1);
    /** Selected start as `YYYY-MM-DD`, null when nothing picked yet. */
    readonly rangeStart = input<string | null>(null);
    /** Selected end as `YYYY-MM-DD`, null when only start picked. */
    readonly rangeEnd   = input<string | null>(null);
    /**
     * Hover preview end — when the user has clicked start and is moving
     * the mouse over candidate end dates, the parent feeds this signal
     * so we can render the in-range preview. Null when no hover (overlay
     * closed, or no start clicked yet, or end already committed).
     */
    readonly hoverEnd = input<string | null>(null);
    /** Min selectable date as `YYYY-MM-DD`, null = no lower bound. */
    readonly min = input<string | null>(null);
    /** Max selectable date as `YYYY-MM-DD`, null = no upper bound. */
    readonly max = input<string | null>(null);

    readonly dayClick = output<string>();
    readonly dayHover = output<string>();

    private static readonly WEEKDAY_LABELS_SUNDAY_FIRST  = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    private static readonly WEEKDAY_LABELS_MONDAY_FIRST  = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

    readonly weekdayHeaders = computed(() =>
        this.firstDay() === 0
            ? MonthGridComponent.WEEKDAY_LABELS_SUNDAY_FIRST
            : MonthGridComponent.WEEKDAY_LABELS_MONDAY_FIRST,
    );

    /**
     * 42 cells (6 weeks × 7 days) for the grid. Each cell carries its
     * `YYYY-MM-DD` iso key, the day-of-month number for display, and the
     * decoration flags the template applies as CSS classes.
     */
    readonly cells = computed<ReadonlyArray<DayCell>>(() => {
        const y = this.year();
        const m = this.month();
        const first = this.firstDay();

        // What day of week does the 1st fall on (0=Sun..6=Sat)?
        const firstOfMonth = new Date(y, m, 1);
        const dayOfWeekOfFirst = firstOfMonth.getDay();
        // How many cells from the previous month do we need to fill the
        // first row so the grid starts on `firstDay`?
        const leading = (dayOfWeekOfFirst - first + 7) % 7;

        const start = new Date(y, m, 1 - leading);
        const today = new Date();
        const todayIso = isoOf(today);

        // Effective range bounds for decoration:
        //  - if rangeEnd is set, use start/end directly
        //  - else if hoverEnd is set and start is set, preview that
        const start_ = this.rangeStart();
        const end_ = this.rangeEnd();
        const hover = this.hoverEnd();
        const previewStart = start_;
        const previewEnd = end_ ?? (start_ && hover ? hover : null);
        // When previewing, the "end" cell label only applies if the user
        // has already committed end. Hovering shows in-range but not the
        // strong end cap, so visually it's clear nothing is committed yet.
        const showEndCap = end_ !== null;

        const min = this.min();
        const max = this.max();

        const out: DayCell[] = [];
        for (let i = 0; i < 42; i++) {
            const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
            const iso = isoOf(d);
            const otherMonth = d.getMonth() !== m;
            const isToday = iso === todayIso;
            const disabled =
                (min !== null && iso < min)
                || (max !== null && iso > max);
            // Range decoration math, all in iso string compare since
            // YYYY-MM-DD lexical compare === chronological compare.
            let isStart = false;
            let isEnd   = false;
            let inRange = false;
            if (previewStart) {
                if (previewEnd) {
                    const lo = previewStart <= previewEnd ? previewStart : previewEnd;
                    const hi = previewStart <= previewEnd ? previewEnd : previewStart;
                    isStart = iso === lo;
                    isEnd   = iso === hi && showEndCap;
                    inRange = iso > lo && iso < hi;
                } else {
                    isStart = iso === previewStart;
                }
            }
            out.push({
                iso,
                day: d.getDate(),
                otherMonth,
                isToday,
                isStart,
                isEnd,
                inRange,
                disabled,
            });
        }
        return out;
    });
}

interface DayCell {
    readonly iso:        string;
    readonly day:        number;
    readonly otherMonth: boolean;
    readonly isToday:    boolean;
    readonly isStart:    boolean;
    readonly isEnd:      boolean;
    readonly inRange:    boolean;
    readonly disabled:   boolean;
}

/** Format a local Date as `YYYY-MM-DD`. */
function isoOf(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}
