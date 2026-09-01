import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    input,
    output,
} from '@angular/core';

import { UserCalendarPreferencesService } from '../../util/user-calendar-preferences.service';

/**
 * — Small time-of-day picker primitive used inside the time-range
 * and datetime-range overlays.
 *
 * Renders an hour `<select>` (00-23 or 1-12 + AM/PM) + a minute
 * `<select>` (00, 15, 30, 45 by default; step input lets callers
 * customise). Stays in 24h canonical `HH:mm` internally; the AM/PM
 * select drives the hour conversion when the user's `timeFormat`
 * pref is `12h`.
 */
@Component({
    selector: 'cms-time-of-day-picker',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (is12h()) {
            <div class="todp">
                <select class="todp__select"
                        [disabled]="disabled()"
                        (change)="onHour12Change($any($event.target).value)">
                    @for (h of hour12Range; track h) {
                        <option [value]="h" [selected]="h === hour12()">{{ h }}</option>
                    }
                </select>
                <span class="todp__sep">:</span>
                <select class="todp__select"
                        [disabled]="disabled()"
                        (change)="onMinuteChange($any($event.target).value)">
                    @for (m of minuteOptions(); track m) {
                        <option [value]="m" [selected]="m === minute()">{{ m }}</option>
                    }
                </select>
                <select class="todp__select todp__ampm"
                        [disabled]="disabled()"
                        (change)="onAmPmChange($any($event.target).value)">
                    <option value="AM" [selected]="ampm() === 'AM'">AM</option>
                    <option value="PM" [selected]="ampm() === 'PM'">PM</option>
                </select>
            </div>
        } @else {
            <div class="todp">
                <select class="todp__select"
                        [disabled]="disabled()"
                        (change)="onHour24Change($any($event.target).value)">
                    @for (h of hour24Range; track h) {
                        <option [value]="h" [selected]="h === hour24()">{{ h }}</option>
                    }
                </select>
                <span class="todp__sep">:</span>
                <select class="todp__select"
                        [disabled]="disabled()"
                        (change)="onMinuteChange($any($event.target).value)">
                    @for (m of minuteOptions(); track m) {
                        <option [value]="m" [selected]="m === minute()">{{ m }}</option>
                    }
                </select>
            </div>
        }
    `,
    styles: [`
        :host { display: inline-block; }
        .todp {
            display: inline-flex;
            align-items: center;
            gap: 2px;
        }
        .todp__select {
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius-sm, 4px);
            background: var(--cms-surface, #fff);
            padding: 4px 6px;
            font-size: .85rem;
            font-family: inherit;
        }
        .todp__sep { padding: 0 2px; font-weight: 600; }
        .todp__ampm { margin-left: 4px; }
    `],
})
export class TimeOfDayPickerComponent {
    private readonly userPrefs = inject(UserCalendarPreferencesService);

    /** Canonical `HH:mm` value (24h). */
    readonly value     = input<string>('00:00');
    readonly disabled  = input<boolean>(false);
    /**
     * Minute granularity. Default 15 gives `00, 15, 30, 45` — the
     * common case for event scheduling. Callers can pass 1 / 5 / 30
     * for finer or coarser steps, or 60 for whole-hour only.
     */
    readonly step      = input<number>(15);

    readonly valueChange = output<string>();

    readonly is12h = computed(() => this.userPrefs.timeFormat() === '12h');

    readonly hour24 = computed(() => this.value().slice(0, 2));
    readonly minute = computed(() => this.value().slice(3, 5));
    readonly hour12 = computed(() => {
        const h = parseInt(this.hour24(), 10);
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return String(h12).padStart(2, '0');
    });
    readonly ampm = computed(() => {
        const h = parseInt(this.hour24(), 10);
        return h < 12 ? 'AM' : 'PM';
    });

    readonly hour24Range = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    readonly hour12Range = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

    readonly minuteOptions = computed(() => {
        const step = Math.max(1, Math.min(60, this.step()));
        const out: string[] = [];
        for (let m = 0; m < 60; m += step) {
            out.push(String(m).padStart(2, '0'));
        }
        return out;
    });

    onHour24Change(v: string): void {
        this.emit(v, this.minute());
    }
    onHour12Change(v: string): void {
        const h = this.from12h(v, this.ampm());
        this.emit(h, this.minute());
    }
    onAmPmChange(v: string): void {
        const h = this.from12h(this.hour12(), v);
        this.emit(h, this.minute());
    }
    onMinuteChange(v: string): void {
        this.emit(this.hour24(), v);
    }

    private from12h(h12: string, ampm: string): string {
        let n = parseInt(h12, 10);
        if (ampm === 'AM' && n === 12) n = 0;
        else if (ampm === 'PM' && n !== 12) n += 12;
        return String(n).padStart(2, '0');
    }

    private emit(hh: string, mm: string): void {
        this.valueChange.emit(`${hh}:${mm}`);
    }
}
