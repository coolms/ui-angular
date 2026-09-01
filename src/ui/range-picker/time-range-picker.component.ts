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
import { TimeOfDayPickerComponent } from './time-of-day-picker.component';
import { formatLocalTime } from './prefs-format';

/**
 * #473 — Proper time range picker.
 *
 * Single-trigger field showing the time span as one string (e.g.
 * `09:00 → 17:30` or `9:00 AM → 5:30 PM`). Click opens a small popover
 * with two `<cms-time-of-day-picker>` controls and Cancel / Apply
 * buttons.
 *
 * Public API preserved from #436. Wire format unchanged:
 * `{ start: 'HH:mm', end: 'HH:mm' }` — what the Working Hours editor
 * already uses for its per-weekday windows.
 */
export interface TimeRangeValue {
    readonly start: string;  // HH:mm
    readonly end:   string;  // HH:mm
}

@Component({
    selector: 'app-time-range-picker',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [TimeOfDayPickerComponent],
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
                          aria-label="Clear time range"
                          (click)="$event.stopPropagation(); onClear()"
                          (keydown.enter)="$event.stopPropagation(); onClear()">×</span>
                }
                <i class="bi bi-clock picker__icon" aria-hidden="true"></i>
            </button>
            @if (open()) {
                <div class="picker__overlay"
                     [style.top.px]="overlayTop()"
                     [style.left.px]="overlayLeft()">
                    <div class="picker__row">
                        <span class="picker__label">{{ startLabel() }}</span>
                        <cms-time-of-day-picker
                            [value]="pendingStart()"
                            [step]="step()"
                            (valueChange)="pendingStart.set($event)" />
                    </div>
                    <div class="picker__row">
                        <span class="picker__label">{{ endLabel() }}</span>
                        <cms-time-of-day-picker
                            [value]="pendingEnd()"
                            [step]="step()"
                            (valueChange)="pendingEnd.set($event)" />
                    </div>
                    @if (error()) {
                        <p class="picker__error" role="alert">{{ error() }}</p>
                    }
                    <footer class="picker__foot">
                        <button type="button" class="cms-btn cms-btn-link" (click)="reset()">Reset</button>
                        <div class="picker__foot-actions">
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
        .picker__overlay {
            position: fixed;
            z-index: 1000;
            background: var(--cms-surface, #fff);
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius-md, 8px);
            box-shadow: var(--cms-shadow-lg, 0 8px 24px rgba(0,0,0,.12));
            padding: 12px 16px;
            min-width: 260px;
        }
        .picker__row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 8px;
        }
        .picker__label {
            font-size: .85rem;
            color: var(--cms-text-muted, #848b96);
        }
        .picker__error {
            margin: 4px 0 8px;
            color: var(--cms-danger, #dc2626);
            font-size: .75rem;
        }
        .picker__foot {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-top: 8px;
            margin-top: 4px;
            border-top: 1px solid var(--cms-border, #e5e7eb);
        }
        .picker__foot-actions { display: flex; gap: 4px; }
        .bi { line-height: 1; }
    `],
})
export class TimeRangePickerComponent implements OnDestroy {
    private readonly userPrefs = inject(UserCalendarPreferencesService);
    private readonly host      = inject(ElementRef<HTMLElement>);

    // ── Inputs ───────────────────────────────────────────────────────────────

    readonly value      = input<TimeRangeValue | null>(null);
    readonly startLabel = input<string>('From');
    readonly endLabel   = input<string>('To');
    readonly required   = input<boolean>(true);
    readonly disabled   = input<boolean>(false);
    /** Minute granularity for the select dropdowns (default 15 → 00/15/30/45). */
    readonly step       = input<number>(15);
    /** Trigger sizing — 'sm' matches DataGrid filter-row inputs. */
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

    readonly valueChange = output<TimeRangeValue | null>();

    // ── Internal state ───────────────────────────────────────────────────────

    private readonly _value = signal<TimeRangeValue | null>(null);

    readonly open = signal(false);
    readonly overlayTop  = signal(0);
    readonly overlayLeft = signal(0);

    readonly pendingStart = signal<string>('09:00');
    readonly pendingEnd   = signal<string>('17:00');

    readonly hasValue = computed(() => this._value() !== null);
    readonly displayValue = computed(() => {
        const v = this._value();
        if (!v) return 'Select time range';
        const fmt = this.userPrefs.timeFormat();
        return `${formatLocalTime(v.start, fmt)} → ${formatLocalTime(v.end, fmt)}`;
    });

    readonly error = computed<string | null>(() => {
        const s = this.pendingStart();
        const e = this.pendingEnd();
        if (!s || !e) return null;
        return e <= s ? 'End must be after start.' : null;
    });

    readonly canApply = computed(() => this.error() === null);

    constructor() {
        effect(() => {
            const v = this.value();
            this._value.set(v ?? null);
            if (v) {
                this.pendingStart.set(v.start);
                this.pendingEnd.set(v.end);
            }
        });
    }

    toggle(): void {
        if (this.disabled()) return;
        if (this.open()) this.close();
        else this.openOverlay();
    }

    private openOverlay(): void {
        const v = this._value();
        if (v) {
            this.pendingStart.set(v.start);
            this.pendingEnd.set(v.end);
        }
        this.positionOverlay();
        this.open.set(true);
    }

    close(): void {
        this.open.set(false);
    }

    reset(): void {
        this.pendingStart.set('09:00');
        this.pendingEnd.set('17:00');
    }

    onApply(): void {
        const s = this.pendingStart();
        const e = this.pendingEnd();
        if (!s || !e || e <= s) return;
        const v: TimeRangeValue = { start: s, end: e };
        this._value.set(v);
        this.valueChange.emit(v);
        this.close();
    }

    onClear(): void {
        this._value.set(null);
        this.valueChange.emit(null);
    }

    private positionOverlay(): void {
        const rect = this.host.nativeElement.getBoundingClientRect();
        const margin = 4;
        const overlayHeight = 220;
        const overlayWidth  = 260;
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
        if (!this.host.nativeElement.contains(target)) {
            // The overlay is positioned outside the host (fixed). Check if
            // the click happened inside it by walking up from the click target.
            let cur: Node | null = target;
            while (cur) {
                if (cur instanceof HTMLElement && cur.classList?.contains('picker__overlay')) {
                    return; // click landed inside our overlay — keep it open
                }
                cur = cur.parentNode;
            }
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
