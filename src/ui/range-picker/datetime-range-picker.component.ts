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
import { MonthGridComponent } from './month-grid.component';
import { TimeOfDayPickerComponent } from './time-of-day-picker.component';
import { formatLocalDate, formatLocalTime } from './prefs-format';

/**
 * — Proper datetime range picker.
 *
 * Single-trigger field showing the datetime span as one string (e.g.
 * `2026-05-01 09:00 -> 2026-05-31 17:30`). Click opens a fixed-position
 * overlay with:
 *  - Optional all-day toggle (input `showAllDayToggle`)
 *  - Two consecutive months side-by-side (click-start / click-end)
 *  - Time-of-day pickers per side (shown when !allDay)
 *  - TZ hint line (when tz differs from UTC)
 *  - Cancel / Reset / Apply footer
 *
 * Public API preserved from the legacy component. Wire format
 * unchanged: ISO-8601 (or `YYYY-MM-DD` when all-day) per side.
 */
export interface DateTimeRangeValue {
    readonly start:  string;  // ISO-8601 (or YYYY-MM-DD when allDay)
    readonly end:    string;
    readonly allDay: boolean;
}

@Component({
    selector: 'app-datetime-range-picker',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MonthGridComponent, TimeOfDayPickerComponent],
    template: `
        <div class="picker" [class.picker--disabled]="disabled()">
            @if (label()) {
                <span class="picker__field-label">{{ label() }}</span>
            }
            <button type="button"
                    class="picker__trigger"
                    [class.picker__trigger--sm]="size() === 'sm'"
                    [disabled]="disabled()"
                    [attr.aria-expanded]="open()"
                    [attr.aria-label]="label() || null"
                    (click)="toggle()">
                <span class="picker__value" [class.picker__value--placeholder]="!hasValue()">
                    {{ displayValue() }}
                </span>
                @if (allowClear() && hasValue() && !disabled()) {
                    <span class="picker__clear"
                          role="button"
                          tabindex="0"
                          aria-label="Clear datetime range"
                          (click)="$event.stopPropagation(); onClear()"
                          (keydown.enter)="$event.stopPropagation(); onClear()">×</span>
                }
                <i class="bi bi-calendar3 picker__icon" aria-hidden="true"></i>
            </button>
            @if (open()) {
                <div class="overlay"
                     [style.top.px]="overlayTop()"
                     [style.left.px]="overlayLeft()">
                    <header class="overlay__head">
                        <button type="button" class="overlay__nav" (click)="prev()">
                            <i class="bi bi-chevron-left"></i>
                        </button>
                        <div class="overlay__summary">
                            @if (pendingStartDate()) {
                                <span class="overlay__chip">
                                    {{ pendingStartDisplay() }}
                                </span>
                            } @else {
                                <span class="overlay__placeholder">Start</span>
                            }
                            <span class="overlay__arrow" aria-hidden="true">→</span>
                            @if (pendingEndDate()) {
                                <span class="overlay__chip">
                                    {{ pendingEndDisplay() }}
                                </span>
                            } @else {
                                <span class="overlay__placeholder">End</span>
                            }
                        </div>
                        <button type="button" class="overlay__nav" (click)="next()">
                            <i class="bi bi-chevron-right"></i>
                        </button>
                    </header>

                    <div class="overlay__months" (mouseleave)="hoverEnd.set(null)">
                        <div>
                            <div class="overlay__month-title">{{ leftTitle() }}</div>
                            <cms-month-grid
                                [year]="leftYear()"
                                [month]="leftMonth()"
                                [firstDay]="firstDay()"
                                [rangeStart]="pendingStartDate()"
                                [rangeEnd]="pendingEndDate()"
                                [hoverEnd]="hoverEnd()"
                                (dayClick)="onDayClick($event)"
                                (dayHover)="onDayHover($event)" />
                        </div>
                        <div>
                            <div class="overlay__month-title">{{ rightTitle() }}</div>
                            <cms-month-grid
                                [year]="rightYear()"
                                [month]="rightMonth()"
                                [firstDay]="firstDay()"
                                [rangeStart]="pendingStartDate()"
                                [rangeEnd]="pendingEndDate()"
                                [hoverEnd]="hoverEnd()"
                                (dayClick)="onDayClick($event)"
                                (dayHover)="onDayHover($event)" />
                        </div>
                    </div>

                    @if (showAllDayToggle() || !pendingAllDay()) {
                        <div class="overlay__times">
                            <div class="overlay__time-row">
                                @if (showAllDayToggle()) {
                                    <label class="overlay__toggle">
                                        <input type="checkbox"
                                               class="overlay__toggle-input"
                                               [checked]="pendingAllDay()"
                                               (change)="onAllDayChange($any($event.target).checked)" />
                                        <span class="overlay__toggle-slider" aria-hidden="true"></span>
                                        <span class="overlay__toggle-label">All-day</span>
                                    </label>
                                }
                                @if (!pendingAllDay()) {
                                    <div class="overlay__time-cell">
                                        <span class="overlay__time-label">Start time</span>
                                        <cms-time-of-day-picker
                                            [value]="pendingStartTime()"
                                            (valueChange)="pendingStartTime.set($event)" />
                                    </div>
                                    <span class="overlay__time-sep" aria-hidden="true">→</span>
                                    <div class="overlay__time-cell">
                                        <span class="overlay__time-label">End time</span>
                                        <cms-time-of-day-picker
                                            [value]="pendingEndTime()"
                                            (valueChange)="pendingEndTime.set($event)" />
                                    </div>
                                }
                            </div>
                            <p class="overlay__tz" [class.overlay__tz--hidden]="!tzHint() || pendingAllDay()">
                                {{ tzHint() || ' ' }}
                            </p>
                        </div>
                    }

                    @if (error()) {
                        <p class="overlay__error" role="alert">{{ error() }}</p>
                    }

                    <footer class="overlay__foot">
                        <button type="button" class="cms-btn cms-btn-link" (click)="reset()">Reset</button>
                        <div class="overlay__foot-actions">
                            <button type="button" class="cms-btn cms-btn-link" (click)="close()">Cancel</button>
                            <button type="button" class="cms-btn cms-btn-primary"
                                    [disabled]="!canApply()"
                                    (click)="onApply()">Apply</button>
                        </div>
                    </footer>
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
        .overlay {
            position: fixed;
            z-index: 1000;
            background: var(--cms-surface, #fff);
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius-md, 8px);
            box-shadow: var(--cms-shadow-lg, 0 8px 24px rgba(0,0,0,.12));
            padding: 12px 16px;
            min-width: 560px;
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
            margin-bottom: 4px;
        }
        .overlay__times {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 8px 0;
            border-top: 1px solid var(--cms-border, #e5e7eb);
        }
        .overlay__time-row {
            display: flex;
            align-items: center;
            gap: 16px;
            flex-wrap: wrap;
            min-height: 36px;          /* reserve space so the row doesn't jump
                                          when the time-cells disappear under All-day */
        }
        .overlay__toggle {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: .85rem;
            cursor: pointer;
            margin-right: auto;
            user-select: none;
        }
        .overlay__toggle-input {
            position: absolute;
            opacity: 0;
            pointer-events: none;
            width: 0;
            height: 0;
        }
        .overlay__toggle-slider {
            position: relative;
            display: inline-block;
            width: 32px;
            height: 18px;
            background: var(--cms-border, #e5e7eb);
            border-radius: 999px;
            transition: background .15s ease;
            flex-shrink: 0;
        }
        .overlay__toggle-slider::before {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 14px;
            height: 14px;
            background: var(--cms-surface);
            border-radius: 50%;
            box-shadow: var(--cms-shadow-sm, 0 1px 3px rgba(0,0,0,.08));
            transition: transform .15s ease;
        }
        .overlay__toggle-input:checked + .overlay__toggle-slider {
            background: var(--cms-accent, #F5A623);
        }
        .overlay__toggle-input:checked + .overlay__toggle-slider::before {
            transform: translateX(14px);
        }
        .overlay__toggle-input:focus-visible + .overlay__toggle-slider {
            outline: 2px solid var(--cms-accent, #F5A623);
            outline-offset: 2px;
        }
        .overlay__toggle-label {
            color: var(--cms-text, #111827);
        }
        .overlay__time-cell {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .overlay__time-label {
            font-size: .85rem;
            color: var(--cms-text-muted, #848b96);
            white-space: nowrap;
        }
        .overlay__time-sep {
            color: var(--cms-text-muted, #848b96);
            font-size: .85rem;
        }
        .overlay__tz {
            margin: 4px 0 0;
            font-size: .7rem;
            color: var(--cms-text-muted, #848b96);
            font-style: italic;
            min-height: 1em;            /* keep its own line height even when empty */
        }
        .overlay__tz--hidden {
            visibility: hidden;         /* preserves space → no row-jitter */
        }
        .overlay__error {
            margin: 4px 0 0;
            color: var(--cms-danger, #dc2626);
            font-size: .75rem;
        }
        .overlay__foot {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-top: 8px;
            margin-top: 4px;
            border-top: 1px solid var(--cms-border, #e5e7eb);
        }
        .overlay__foot-actions { display: flex; gap: 4px; }
        .bi { line-height: 1; }
    `],
})
export class DateTimeRangePickerComponent implements OnDestroy {
    private readonly userPrefs = inject(UserCalendarPreferencesService);
    private readonly host      = inject(ElementRef<HTMLElement>);

    // -- Inputs ---------------------------------------------------------------

    readonly value            = input<DateTimeRangeValue | null>(null);
    readonly startLabel       = input<string>('Start');
    readonly endLabel         = input<string>('End');
    readonly required         = input<boolean>(true);
    readonly disabled         = input<boolean>(false);
    readonly showAllDayToggle = input<boolean>(true);
    /** Trigger sizing — 'sm' matches DataGrid filter-row inputs. */
    readonly size             = input<'sm' | 'md'>('md');
    /**
     * Show an inline ×-clear button on the trigger when a value is set.
     * Set to `false` for required fields so the user can't drop the value
     * to null with a single click.
     */
    readonly allowClear       = input<boolean>(true);
    /**
     * Optional field label rendered above the trigger. Set on standalone
     * form rows (event editor etc.) so the picker is self-labelling.
     * Leave empty when the surrounding layout already provides a label
     * (e.g. DataGrid filter row, where the column header is the label).
     */
    readonly label            = input<string>('');

    readonly valueChange = output<DateTimeRangeValue | null>();

    // -- Internal state -------------------------------------------------------

    private readonly _value = signal<DateTimeRangeValue | null>(null);

    readonly open = signal(false);
    readonly overlayTop  = signal(0);
    readonly overlayLeft = signal(0);

    // Pending parts inside the overlay — committed on Apply.
    readonly pendingStartDate = signal<string | null>(null);
    readonly pendingStartTime = signal<string>('09:00');
    readonly pendingEndDate   = signal<string | null>(null);
    readonly pendingEndTime   = signal<string>('17:00');
    readonly pendingAllDay    = signal<boolean>(false);
    readonly hoverEnd         = signal<string | null>(null);

    // Calendar cursor (left month displayed).
    private readonly cursor = signal<{ year: number; month: number }>(initialCursor());

    readonly firstDay = computed<0 | 1>(() => this.userPrefs.firstDay());

    readonly leftYear  = computed(() => this.cursor().year);
    readonly leftMonth = computed(() => this.cursor().month);
    readonly rightYear = computed(() => {
        const { year, month } = this.cursor();
        return month === 11 ? year + 1 : year;
    });
    readonly rightMonth = computed(() => (this.cursor().month + 1) % 12);

    readonly leftTitle  = computed(() => monthTitle(this.leftYear(),  this.leftMonth()));
    readonly rightTitle = computed(() => monthTitle(this.rightYear(), this.rightMonth()));

    readonly hasValue = computed(() => this._value() !== null);

    readonly displayValue = computed(() => {
        const v = this._value();
        if (!v) return 'Select datetime range';
        const dateFmt = this.userPrefs.dateFormat();
        const timeFmt = this.userPrefs.timeFormat();
        if (v.allDay) {
            // Parent may send ISO-with-T even when allDay=true (e.g.
            // `2026-05-20T00:00:00.000Z`). `formatLocalDate` requires
            // bare YYYY-MM-DD, so slice defensively here so the display
            // never falls back to raw ISO.
            const sDate = v.start.slice(0, 10);
            const eDate = v.end.slice(0, 10);
            return `${formatLocalDate(sDate, dateFmt)} → ${formatLocalDate(eDate, dateFmt)}`;
        }
        const sParts = isoToParts(v.start);
        const eParts = isoToParts(v.end);
        if (!sParts || !eParts) return `${v.start} → ${v.end}`;
        const sStr = `${formatLocalDate(sParts.date, dateFmt)} ${formatLocalTime(sParts.time, timeFmt)}`;
        const eStr = `${formatLocalDate(eParts.date, dateFmt)} ${formatLocalTime(eParts.time, timeFmt)}`;
        return `${sStr} → ${eStr}`;
    });

    readonly pendingStartDisplay = computed(() => {
        const d = this.pendingStartDate();
        if (!d) return '';
        const t = this.pendingAllDay() ? '' : ' ' + formatLocalTime(this.pendingStartTime(), this.userPrefs.timeFormat());
        return formatLocalDate(d, this.userPrefs.dateFormat()) + t;
    });
    readonly pendingEndDisplay = computed(() => {
        const d = this.pendingEndDate();
        if (!d) return '';
        const t = this.pendingAllDay() ? '' : ' ' + formatLocalTime(this.pendingEndTime(), this.userPrefs.timeFormat());
        return formatLocalDate(d, this.userPrefs.dateFormat()) + t;
    });

    readonly tzHint = computed<string | null>(() => {
        const tz = this.userPrefs.tz();
        return tz && tz !== 'UTC' ? `Times shown in ${tz}` : null;
    });

    readonly error = computed<string | null>(() => {
        const sKey = this.partsKey('start');
        const eKey = this.partsKey('end');
        if (!sKey || !eKey) return null;
        const allDay = this.pendingAllDay();
        if (allDay  && eKey < sKey)  return 'End date must be on or after start.';
        if (!allDay && eKey <= sKey) return 'End must be after start.';
        return null;
    });

    readonly canApply = computed(() =>
        this.pendingStartDate() !== null
        && this.pendingEndDate() !== null
        && this.error() === null,
    );

    constructor() {
        effect(() => {
            const v = this.value();
            this._value.set(v ?? null);
            if (v) this.seedPending(v);
        });
    }

    // -- Open / close ---------------------------------------------------------

    toggle(): void {
        if (this.disabled()) return;
        if (this.open()) this.close();
        else this.openOverlay();
    }

    private openOverlay(): void {
        const v = this._value();
        if (v) this.seedPending(v);
        this.positionOverlay();
        this.open.set(true);
    }

    close(): void {
        this.open.set(false);
    }

    private seedPending(v: DateTimeRangeValue): void {
        this.pendingAllDay.set(v.allDay);
        if (v.allDay) {
            this.pendingStartDate.set(v.start.slice(0, 10) || null);
            this.pendingEndDate.set(v.end.slice(0, 10) || null);
        } else {
            const sParts = isoToParts(v.start);
            const eParts = isoToParts(v.end);
            this.pendingStartDate.set(sParts?.date ?? null);
            this.pendingStartTime.set(sParts?.time ?? '09:00');
            this.pendingEndDate.set(eParts?.date ?? null);
            this.pendingEndTime.set(eParts?.time ?? '17:00');
        }
        const startDate = this.pendingStartDate();
        if (startDate) {
            const d = parseIso(startDate);
            if (d) this.cursor.set({ year: d.getFullYear(), month: d.getMonth() });
        }
    }

    // -- Selection ------------------------------------------------------------

    onDayClick(iso: string): void {
        const s = this.pendingStartDate();
        const e = this.pendingEndDate();
        if (s === null || (s !== null && e !== null)) {
            this.pendingStartDate.set(iso);
            this.pendingEndDate.set(null);
            this.hoverEnd.set(null);
            return;
        }
        if (iso < s) {
            this.pendingStartDate.set(iso);
            this.pendingEndDate.set(s);
        } else {
            this.pendingEndDate.set(iso);
        }
        this.hoverEnd.set(null);
    }

    onDayHover(iso: string): void {
        if (this.pendingStartDate() && !this.pendingEndDate()) {
            this.hoverEnd.set(iso);
        }
    }

    onAllDayChange(checked: boolean): void {
        this.pendingAllDay.set(checked);
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
        this.pendingStartDate.set(null);
        this.pendingEndDate.set(null);
        this.pendingStartTime.set('09:00');
        this.pendingEndTime.set('17:00');
        this.pendingAllDay.set(false);
        this.hoverEnd.set(null);
    }

    onApply(): void {
        const sDate = this.pendingStartDate();
        const eDate = this.pendingEndDate();
        if (!sDate || !eDate) return;
        const allDay = this.pendingAllDay();
        const value: DateTimeRangeValue = {
            start:  allDay ? sDate : toIsoFromLocal(sDate, this.pendingStartTime()),
            end:    allDay ? eDate : toIsoFromLocal(eDate, this.pendingEndTime()),
            allDay,
        };
        this._value.set(value);
        this.valueChange.emit(value);
        this.close();
    }

    onClear(): void {
        this._value.set(null);
        this.valueChange.emit(null);
    }

    /** Build a lex-sortable key for ordering / validation. */
    private partsKey(side: 'start' | 'end'): string {
        const date = side === 'start' ? this.pendingStartDate() : this.pendingEndDate();
        if (!date) return '';
        if (this.pendingAllDay()) return date;
        const time = side === 'start' ? this.pendingStartTime() : this.pendingEndTime();
        return `${date}T${time}`;
    }

    // -- Positioning + lifecycle ----------------------------------------------

    private positionOverlay(): void {
        const rect = this.host.nativeElement.getBoundingClientRect();
        const margin = 4;
        const overlayHeight = 500;
        const overlayWidth  = 560;
        let top = rect.bottom + margin;
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
        if (this.host.nativeElement.contains(target)) return;
        let cur: Node | null = target;
        while (cur) {
            if (cur instanceof HTMLElement && cur.classList?.contains('overlay')) return;
            cur = cur.parentNode;
        }
        this.close();
    }

    @HostListener('document:keydown.escape')
    onEscape(): void { if (this.open()) this.close(); }

    @HostListener('window:resize')
    @HostListener('window:scroll')
    onViewportChange(): void { if (this.open()) this.positionOverlay(); }

    ngOnDestroy(): void { this.open.set(false); }
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

function isoToParts(iso: string): { date: string; time: string } | null {
    if (!iso) return null;
    // All-day case: just a date.
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (dateOnly) return { date: iso, time: '00:00' };
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
}

/**
 * Build an ISO-8601 with offset from local-clock date + time. Mirrors
 * the legacy implementation's `toIso` (treat as datetime-local-equivalent,
 * convert via Date so the host TZ offset gets baked in).
 */
function toIsoFromLocal(date: string, time: string): string {
    const local = `${date}T${time}`;
    const d = new Date(local);
    return isNaN(d.getTime()) ? local : d.toISOString();
}
