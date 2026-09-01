import {
    ChangeDetectionStrategy,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnInit,
    Output,
    SimpleChanges,
    computed,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
    type CronFormState,
    type CronPresetKey,
    buildDefaultState,
    buildPresetOptions,
    parseCron,
    serialiseCron,
    summariseCron,
} from './cron-form.types';
import { TimeOfDayPickerComponent } from '../ui/range-picker/time-of-day-picker.component';

/**
 * `<app-cron-form>` — structured cron expression builder.
 *
 * Mirrors `<app-recurrence-form>`'s preset-dropdown pattern. Six presets
 * cover the common cases (Every minute / Every hour / Daily / Weekly /
 * Monthly / Custom). "Custom expression…" reveals a raw text field plus
 * an inline explainer with field positions, syntax, and worked examples
 * — so users who don't read cron natively still have a fighting chance.
 *
 * The component emits the serialised 5-field expression on every change
 * via `(valueChange)`.
 */
@Component({
    selector: 'app-cron-form',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, TimeOfDayPickerComponent],
    template: `
        <div class="cron-form">

            <div class="cron-row">
                <label class="field">
                    <span class="field__label">Schedule</span>
                    <select [ngModel]="state().preset"
                            (ngModelChange)="setPreset($event)"
                            [disabled]="disabled">
                        @for (opt of presetOptions(); track opt.key) {
                            <option [value]="opt.key">{{ opt.label }}</option>
                        }
                    </select>
                </label>
            </div>

            <!-- Daily / Weekly / Monthly all use a time-of-day. -->
            @if (state().preset === 'daily'
                 || state().preset === 'weekly'
                 || state().preset === 'monthly') {
                <div class="cron-row">
                    <label class="field field--time">
                        <span class="field__label">Time of day</span>
                        <!-- Preference-aware time control (24h/12h per the user's
                             timeFormat setting), shared with the range pickers +
                             working-hours editor. Replaces the native
                             <input type=time>, whose AM/PM display followed the
                             BROWSER locale and ignored the CoolMS preference.
                             step=1 keeps cron's minute-level precision. -->
                        <cms-time-of-day-picker
                                [value]="state().time"
                                [step]="1"
                                [disabled]="disabled"
                                (valueChange)="setTime($event)" />
                    </label>

                    @if (state().preset === 'weekly') {
                        <label class="field">
                            <span class="field__label">Day of week</span>
                            <select [ngModel]="state().weekday"
                                    (ngModelChange)="setWeekday(+$event)"
                                    [disabled]="disabled">
                                <option [ngValue]="1">Monday</option>
                                <option [ngValue]="2">Tuesday</option>
                                <option [ngValue]="3">Wednesday</option>
                                <option [ngValue]="4">Thursday</option>
                                <option [ngValue]="5">Friday</option>
                                <option [ngValue]="6">Saturday</option>
                                <option [ngValue]="0">Sunday</option>
                            </select>
                        </label>
                    }

                    @if (state().preset === 'monthly') {
                        <label class="field field--narrow">
                            <span class="field__label">Day of month</span>
                            <input type="number" min="1" max="31"
                                   [ngModel]="state().dayOfMonth"
                                   (ngModelChange)="setDayOfMonth(+$event)"
                                   [disabled]="disabled" />
                        </label>
                    }
                </div>
            }

            <!-- Custom: raw expression + explainer. -->
            @if (state().preset === 'custom') {
                <label class="field">
                    <span class="field__label">Cron expression</span>
                    <input type="text" class="mono"
                           [ngModel]="state().expression"
                           (ngModelChange)="setExpression($event)"
                           [disabled]="disabled"
                           placeholder="0 9 * * 1-5" />
                </label>

                <details class="explainer">
                    <summary>Cron expression help</summary>
                    <div class="explainer__body">
                        <p>
                            A cron expression has <strong>five space-separated fields</strong>:
                        </p>
                        <pre class="mono explainer__diagram">
┌──── minute        (0-59)
│ ┌── hour          (0-23)
│ │ ┌── day-of-month (1-31)
│ │ │ ┌── month     (1-12)
│ │ │ │ ┌── day-of-week (0-6, 0 = Sunday)
│ │ │ │ │
* * * * *</pre>
                        <p>Each field accepts:</p>
                        <ul class="explainer__list">
                            <li><code>*</code> — any value</li>
                            <li><code>N,M</code> — list of values (e.g. <code>1,15,30</code>)</li>
                            <li><code>N-M</code> — range (e.g. <code>9-17</code>)</li>
                            <li><code>*/N</code> — step (e.g. <code>*/15</code> = every 15)</li>
                        </ul>
                        <p>Common examples:</p>
                        <table class="explainer__examples">
                            <tr><td><code>* * * * *</code></td><td>Every minute</td></tr>
                            <tr><td><code>0 * * * *</code></td><td>Every hour (top of the hour)</td></tr>
                            <tr><td><code>0 9 * * *</code></td><td>Daily at 9:00 AM</td></tr>
                            <tr><td><code>0 9 * * 1-5</code></td><td>Weekdays at 9:00 AM</td></tr>
                            <tr><td><code>0 0 1 * *</code></td><td>First of every month at midnight</td></tr>
                            <tr><td><code>*/15 * * * *</code></td><td>Every 15 minutes</td></tr>
                            <tr><td><code>0 0 * * 0</code></td><td>Every Sunday at midnight</td></tr>
                        </table>
                    </div>
                </details>
            }

            <!-- Always-on summary line so users see what the form will submit. -->
            <p class="summary">
                <span class="summary__label">Will run:</span>
                <span class="summary__text">{{ summary() }}</span>
                <span class="summary__expr mono">{{ currentExpression() }}</span>
            </p>
        </div>
    `,
    styles: [`
        :host { display: block; width: 100%; min-width: 0; }

        .cron-form {
            display: flex; flex-direction: column;
            gap: 10px; padding: 0;
            width: 100%; min-width: 0; box-sizing: border-box;
        }
        .cron-row {
            display: flex; flex-wrap: wrap;
            gap: 10px; align-items: end;
            width: 100%; min-width: 0;
        }
        .field {
            display: flex; flex-direction: column;
            gap: 4px; font-size: .8125rem;
            min-width: 0;
        }
        /* Horizontal flex sizing ONLY applies to fields inside a .cron-row.
           When .field is a direct child of .cron-form (column flex), the
           160px basis would be interpreted as HEIGHT and force the field
           to be 160px tall regardless of content — reads as empty padding
           below the visible input. */
        .cron-row > .field { flex: 1 1 160px; }
        .cron-row > .field--narrow { flex: 0 0 140px; }
        /* The time-of-day picker is a select-based control (2–3 selects),
           wider than the old native time input — give it room to size to
           content instead of a fixed narrow basis. */
        .cron-row > .field--time { flex: 0 0 auto; }
        /* Match the platform .cms-label style (see styles.scss). */
        .field__label {
            font-size: .8125rem;
            font-weight: 500;
            color: var(--cms-text-secondary, #6b7280);
        }
        input, select {
            border: 1px solid var(--cms-btn-border, #d1d5db);
            border-radius: var(--cms-radius, 4px);
            padding: 5px 10px;
            font-size: .8125rem;
            font-family: inherit;
            box-sizing: border-box;
            max-width: 100%;
            color: var(--cms-text, #111827);
            background: var(--cms-surface);
        }
        .field > input, .field > select { width: 100%; }
        .mono {
            font-family: var(--cms-font-mono, monospace);
        }

        /* Explainer disclosure */
        .explainer {
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius, 6px);
            padding: 6px 12px;
            background: var(--cms-surface-muted);
        }
        .explainer summary {
            cursor: pointer;
            font-size: .8rem;
            color: var(--cms-text, #111827);
            padding: 2px 0;
        }
        .explainer__body {
            margin-top: 8px;
            font-size: .8rem;
            color: var(--cms-text, #111827);
        }
        .explainer__body p { margin: 6px 0; }
        .explainer__body code {
            font-family: var(--cms-font-mono, monospace);
            background: var(--cms-surface-muted);
            padding: 1px 4px;
            border-radius: 3px;
        }
        .explainer__diagram {
            background: var(--cms-surface-muted);
            padding: 8px 12px;
            border-radius: var(--cms-radius-sm, 4px);
            line-height: 1.4;
            margin: 6px 0;
            overflow-x: auto;
        }
        .explainer__list {
            margin: 4px 0;
            padding-left: 20px;
        }
        .explainer__list li { margin: 2px 0; }
        .explainer__examples {
            margin: 6px 0;
            border-collapse: collapse;
        }
        .explainer__examples td {
            padding: 2px 12px 2px 0;
            vertical-align: top;
        }
        .explainer__examples td:first-child { white-space: nowrap; }

        /* Summary */
        .summary {
            display: flex; flex-wrap: wrap;
            align-items: baseline; gap: 8px;
            margin: 0;
            padding: 6px 10px;
            background: var(--cms-info-light);
            border: 1px solid var(--cms-info-subtle-border);
            border-radius: var(--cms-radius, 4px);
            font-size: .8125rem;
        }
        .summary__label {
            font-weight: 600;
            color: var(--cms-text, #111827);
        }
        .summary__text { color: var(--cms-text, #111827); }
        .summary__expr {
            color: var(--cms-text-muted, #848b96);
            font-size: .75rem;
            margin-left: auto;
        }
    `],
})
export class CronFormComponent implements OnInit, OnChanges {
    /** Initial 5-field cron expression. Empty / null opens at the default preset. */
    @Input() value: string | null | undefined = null;

    /** Read-only mode. */
    @Input() disabled = false;

    /** Emits the serialised 5-field expression on every form change. */
    @Output() valueChange = new EventEmitter<string>();

    readonly state = signal<CronFormState>(buildDefaultState());

    readonly presetOptions = computed(() => buildPresetOptions(this.state()));
    readonly currentExpression = computed(() => serialiseCron(this.state()));
    readonly summary = computed(() => summariseCron(this.currentExpression()));

    ngOnInit(): void {
        this.state.set(parseCron(this.value));
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['value'] && !changes['value'].firstChange) {
            // Only adopt external value changes when they differ from what we'd
            // emit — prevents the cycle: emit → parent stores → input updates →
            // parse → emit (which would also be lossy on custom expressions).
            const current = serialiseCron(this.state());
            const incoming = (this.value ?? '').trim();
            if (incoming !== current) {
                this.state.set(parseCron(this.value));
            }
        }
    }

    private emit(): void {
        this.valueChange.emit(serialiseCron(this.state()));
    }

    setPreset(p: CronPresetKey): void {
        this.state.update(s => ({ ...s, preset: p }));
        this.emit();
    }

    setTime(t: string): void {
        this.state.update(s => ({ ...s, time: t }));
        this.emit();
    }

    setWeekday(w: number): void {
        this.state.update(s => ({ ...s, weekday: w }));
        this.emit();
    }

    setDayOfMonth(d: number): void {
        const day = Math.max(1, Math.min(31, Math.trunc(d || 1)));
        this.state.update(s => ({ ...s, dayOfMonth: day }));
        this.emit();
    }

    setExpression(e: string): void {
        this.state.update(s => ({ ...s, expression: e }));
        this.emit();
    }
}
