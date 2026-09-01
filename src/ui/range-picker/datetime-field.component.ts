import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    computed,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MonthGridComponent } from './month-grid.component';
import { TimeOfDayPickerComponent } from './time-of-day-picker.component';
import { formatLocalDate, formatLocalTime } from './prefs-format';
import { UserCalendarPreferencesService } from '../../util/user-calendar-preferences.service';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * Single-value, preference-aware date+time field.
 *
 * The range pickers (`app-datetime-range-picker` etc.) cover start→end
 * windows, but a lot of fields are a *single* optional instant — e.g. a
 * content variant's "publish at" / "unpublish at" (each independently
 * blankable). The native `<input type="datetime-local">` can't honour the
 * user's `dateFormat` / `timeFormat` prefs (its display is locked to the
 * browser locale), so this composes the same pref-aware primitives the
 * range pickers use — `cms-month-grid` + `cms-time-of-day-picker` +
 * `formatLocalDate` / `formatLocalTime` — into one inline-expanding field.
 *
 * Value contract: `YYYY-MM-DDTHH:mm` (local, the same shape a
 * `datetime-local` input emits) or `''` when unset — so it's a drop-in for
 * existing local-datetime-string bindings; callers keep their ISO ↔ local
 * boundary conversion unchanged.
 *
 * Inline (not a floating popover) on purpose: it lives inside scrollable
 * panels (the page editor's side-rail) where an absolutely-positioned
 * overlay would clip; expanding in flow lets the host's own scroll handle it.
 */
@Component({
    selector: 'app-datetime-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MonthGridComponent, TimeOfDayPickerComponent],
    template: `
        <div class="dtf" [class.dtf--disabled]="disabled()">
            <div class="dtf__control">
                <button type="button" class="dtf__trigger"
                        [disabled]="disabled()"
                        [attr.aria-expanded]="open()"
                        (click)="toggle()">
                    <i class="bi bi-calendar-event"></i>
                    <span class="dtf__display" [class.dtf__display--empty]="!displayValue()">
                        {{ displayValue() || placeholder() }}
                    </span>
                    <i class="bi dtf__caret" [class.bi-chevron-down]="!open()" [class.bi-chevron-up]="open()"></i>
                </button>
                @if (value() && !disabled()) {
                    <button type="button" class="dtf__clear" title="Clear" (click)="clear()">
                        <i class="bi bi-x-lg"></i>
                    </button>
                }
            </div>

            @if (open()) {
                <div class="dtf__panel">
                    <div class="dtf__nav">
                        <button type="button" class="dtf__nav-btn" title="Previous month" (click)="shiftMonth(-1)">
                            <i class="bi bi-chevron-left"></i>
                        </button>
                        <span class="dtf__nav-label">{{ monthLabel() }}</span>
                        <button type="button" class="dtf__nav-btn" title="Next month" (click)="shiftMonth(1)">
                            <i class="bi bi-chevron-right"></i>
                        </button>
                    </div>

                    <cms-month-grid
                        [year]="viewYear()"
                        [month]="viewMonth()"
                        [firstDay]="firstDay()"
                        [rangeStart]="datePart()"
                        (dayClick)="onDayClick($event)" />

                    @if (withTime()) {
                        <div class="dtf__time">
                            <span class="dtf__time-label">Time</span>
                            <cms-time-of-day-picker [value]="timePart()" [step]="step()"
                                                    (valueChange)="onTimeChange($event)" />
                        </div>
                    }

                    <div class="dtf__actions">
                        <button type="button" class="cms-btn cms-btn-sm" (click)="setNow()">{{ withTime() ? 'Now' : 'Today' }}</button>
                        <button type="button" class="cms-btn cms-btn-sm cms-btn-primary" (click)="open.set(false)">Done</button>
                    </div>
                </div>
            }
        </div>
    `,
    styles: [`
        :host { display: block; }
        .dtf__control { display: flex; align-items: center; gap: 4px; }
        .dtf__trigger {
            flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px;
            padding: 5px 8px; border: 1px solid var(--cms-border); border-radius: var(--cms-radius-sm, 4px);
            background: var(--cms-surface); color: var(--cms-text);
            font: inherit; font-size: .85rem; cursor: pointer; text-align: left;
        }
        .dtf__trigger:hover:not(:disabled) { border-color: var(--cms-accent); }
        .dtf__trigger:disabled { opacity: .6; cursor: not-allowed; }
        .dtf__trigger > i:first-child { color: var(--cms-text-muted); flex-shrink: 0; }
        .dtf__display { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dtf__display--empty { color: var(--cms-text-muted); }
        .dtf__caret { color: var(--cms-text-muted); font-size: .75rem; flex-shrink: 0; }
        .dtf__clear {
            flex-shrink: 0; width: 30px; height: 30px;
            display: inline-flex; align-items: center; justify-content: center;
            border: 1px solid var(--cms-border); border-radius: var(--cms-radius-sm, 4px);
            background: var(--cms-surface); color: var(--cms-text-muted); cursor: pointer;
        }
        .dtf__clear:hover { color: var(--cms-danger); border-color: var(--cms-danger); }
        .dtf__panel {
            margin-top: 6px; padding: 10px;
            border: 1px solid var(--cms-border); border-radius: var(--cms-radius, 6px);
            background: var(--cms-surface); box-shadow: var(--cms-shadow-md, 0 4px 12px rgba(0,0,0,.10));
        }
        .dtf__nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .dtf__nav-btn {
            width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center;
            border: 1px solid transparent; border-radius: var(--cms-radius-sm, 4px); background: transparent;
            color: var(--cms-text); cursor: pointer;
        }
        .dtf__nav-btn:hover { background: var(--cms-border-light); }
        .dtf__nav-label { font-size: .8125rem; font-weight: 600; }
        .dtf__time { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
        .dtf__time-label { font-size: .75rem; font-weight: 600; color: var(--cms-text-muted); }
        .dtf__actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px; }
    `],
})
export class DateTimeFieldComponent {
    private readonly userPrefs = inject(UserCalendarPreferencesService);

    /** Canonical local datetime `YYYY-MM-DDTHH:mm`, or `''` when unset. */
    readonly value       = input<string>('');
    readonly placeholder = input<string>('Set date & time…');
    readonly disabled    = input<boolean>(false);
    /** Minute granularity for the time picker (default 5). */
    readonly step        = input<number>(5);
    /** When false the field is date-only: no time picker, value is `YYYY-MM-DD`. */
    readonly withTime    = input<boolean>(true);

    readonly valueChange = output<string>();

    readonly open = signal(false);

    /** Month being viewed; null → derive from the value (or today). */
    private readonly viewOverride = signal<{ y: number; m: number } | null>(null);

    constructor() {
        // Ensure the user's date/time prefs are loaded; the format signals
        // update reactively once they arrive. Cheap no-op if already cached.
        this.userPrefs.ensureLoaded().pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe();
    }

    readonly datePart = computed<string | null>(() => {
        const v = this.value();
        return v.length >= 10 ? v.slice(0, 10) : null;
    });

    readonly timePart = computed<string>(() => {
        const v = this.value();
        return v.length >= 16 ? v.slice(11, 16) : '09:00';
    });

    readonly displayValue = computed<string>(() => {
        const d = this.datePart();
        if (!d) return '';
        const ds = formatLocalDate(d, this.userPrefs.dateFormat());
        if (!this.withTime()) return ds;
        const ts = formatLocalTime(this.timePart(), this.userPrefs.timeFormat());
        return `${ds} ${ts}`;
    });

    readonly firstDay  = computed(() => this.userPrefs.firstDay());
    readonly viewYear  = computed(() => (this.viewOverride() ?? this.baseView()).y);
    readonly viewMonth = computed(() => (this.viewOverride() ?? this.baseView()).m);
    readonly monthLabel = computed(() => `${MONTH_NAMES[this.viewMonth()]} ${this.viewYear()}`);

    toggle(): void {
        if (this.disabled()) return;
        if (!this.open()) {
            this.viewOverride.set(this.baseView());
        }
        this.open.update(o => !o);
    }

    shiftMonth(delta: number): void {
        const cur = this.viewOverride() ?? this.baseView();
        const probe = new Date(cur.y, cur.m + delta, 1);
        this.viewOverride.set({ y: probe.getFullYear(), m: probe.getMonth() });
    }

    onDayClick(iso: string): void {
        if (!this.withTime()) {
            // Date-only: picking a day completes the selection.
            this.valueChange.emit(iso);
            this.open.set(false);
            return;
        }
        // Keep the current time of day; swap the date.
        this.valueChange.emit(`${iso}T${this.timePart()}`);
    }

    onTimeChange(hhmm: string): void {
        // Keep the current date (or default to today if none picked yet).
        this.valueChange.emit(`${this.datePart() ?? this.todayIso()}T${hhmm}`);
    }

    setNow(): void {
        const now = new Date();
        this.viewOverride.set({ y: now.getFullYear(), m: now.getMonth() });
        if (!this.withTime()) {
            this.valueChange.emit(this.isoOf(now));
            this.open.set(false);
            return;
        }
        const t = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
        this.valueChange.emit(`${this.isoOf(now)}T${t}`);
    }

    clear(): void {
        this.valueChange.emit('');
        this.open.set(false);
    }

    /** First-of-the-view derivation: the value's month, else the current month. */
    private baseView(): { y: number; m: number } {
        const d = this.datePart();
        if (d) {
            const [y, m] = d.split('-');
            return { y: parseInt(y, 10), m: parseInt(m, 10) - 1 };
        }
        const now = new Date();
        return { y: now.getFullYear(), m: now.getMonth() };
    }

    private todayIso(): string {
        return this.isoOf(new Date());
    }

    private isoOf(d: Date): string {
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
}

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}
