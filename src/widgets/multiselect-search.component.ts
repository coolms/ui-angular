import {
    ChangeDetectionStrategy, Component, computed, effect, ElementRef,
    input, output, signal, ViewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';

/**
 * Single option entry for MultiselectSearchComponent.
 */
export interface MultiselectOption {
    readonly value: string;
    readonly label: string;
}

/**
 * Generic multi-select dropdown with client-side search.
 *
 * Trigger button shows a summary of currently selected items; click opens a
 * CDK Overlay panel containing a search input and the filtered option list.
 * Clicking an option toggles selection and keeps the panel open for batch
 * picking. Selected items render as chips above the trigger and can be
 * removed via the chip's ✕ button.
 *
 * Stateless: receives `options` and `value` as inputs, emits new arrays via
 * `valueChange`. The parent owns the source of truth (typically a FormControl).
 */
@Component({
    selector: 'app-multiselect-search',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, OverlayModule],
    template: `
        <!-- Selected chips row above trigger -->
        @if (value().length > 0) {
            <div class="ms-tags mb-1">
                @for (chip of selectedOptions(); track chip.value) {
                    <span class="ms-tag">
                        {{ chip.label }}
                        <button type="button"
                                class="ms-tag-remove"
                                [disabled]="disabled()"
                                (click)="removeChip(chip.value)">✕</button>
                    </span>
                }
            </div>
        }

        <!-- Trigger button -->
        <button cdkOverlayOrigin
                #triggerOrigin="cdkOverlayOrigin"
                #triggerEl
                type="button"
                class="form-select text-start w-100"
                [class.text-muted]="value().length === 0"
                [disabled]="disabled()"
                (click)="toggleOpen()">
            {{ triggerLabel() }}
        </button>

        <ng-template cdkConnectedOverlay
                     [cdkConnectedOverlayOrigin]="triggerOrigin"
                     [cdkConnectedOverlayOpen]="isOpen()"
                     [cdkConnectedOverlayPositions]="overlayPositions"
                     [cdkConnectedOverlayWidth]="triggerWidth()"
                     [cdkConnectedOverlayHasBackdrop]="false"
                     (overlayOutsideClick)="closeDropdown()"
                     (detach)="closeDropdown()">
            <div class="ms-panel">
                <div class="ms-search">
                    <input #searchInput
                           type="text"
                           class="form-control form-control-sm"
                           placeholder="Search…"
                           [formControl]="searchControl"
                           (keydown.escape)="closeDropdown()" />
                </div>

                <div class="ms-list">
                    @for (opt of filteredOptions(); track opt.value) {
                        <button type="button"
                                class="ms-option"
                                [class.ms-option--selected]="isSelected(opt.value)"
                                (click)="toggle(opt)">
                            @if (isSelected(opt.value)) {
                                <i class="bi bi-check2"></i>
                            } @else {
                                <span class="ms-option__check-spacer"></span>
                            }
                            {{ opt.label }}
                        </button>
                    }
                    @if (filteredOptions().length === 0) {
                        <div class="ms-empty">No matches</div>
                    }
                </div>
            </div>
        </ng-template>
    `,
    styles: [`
        :host { display: block; }

        /* ── Tag chips ── */
        .ms-tags { display: flex; flex-wrap: wrap; gap: 4px; }
        .ms-tag {
            display: inline-flex; align-items: center; gap: 4px;
            background: var(--cms-accent-light); color: var(--cms-accent-text);
            padding: 2px 8px; border-radius: 12px; font-size: .8rem;
        }
        .ms-tag-remove {
            background: none; border: none; cursor: pointer;
            color: var(--cms-accent-text); padding: 0; font-size: .75rem; line-height: 1;
        }
        .ms-tag-remove[disabled] { cursor: not-allowed; opacity: .5; }

        /* ── Dropdown panel ── */
        .ms-panel {
            background: var(--cms-surface);
            border: 1px solid var(--cms-border);
            border-radius: var(--cms-radius);
            box-shadow: var(--cms-shadow-md);
            width: 100%;
            max-height: 300px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .ms-search {
            padding: 8px;
            border-bottom: 1px solid var(--cms-border);
            flex-shrink: 0;
        }
        .ms-list {
            overflow-y: auto;
            flex: 1;
            padding: 4px 0;
        }
        .ms-option {
            display: flex;
            align-items: center;
            gap: 6px;
            width: 100%;
            padding: 4px 12px;
            background: none;
            border: none;
            text-align: left;
            font-size: .8125rem;
            color: var(--cms-text);
            cursor: pointer;
            transition: background .1s;

            .bi { font-size: .75rem; color: var(--cms-accent); width: 1em; }

            &:hover { background: var(--cms-border-light); }
        }
        .ms-option--selected { font-weight: 500; color: var(--cms-accent-text); }
        .ms-option__check-spacer { display: inline-block; width: 1em; }
        .ms-empty {
            padding: 8px 12px;
            font-size: .75rem;
            color: var(--cms-text-muted);
        }
    `],
})
export class MultiselectSearchComponent {
    options     = input.required<ReadonlyArray<MultiselectOption>>();
    value       = input.required<ReadonlyArray<string>>();
    placeholder = input<string>('— Select —');
    disabled    = input<boolean>(false);

    valueChange = output<string[]>();

    isOpen        = signal(false);
    searchControl = new FormControl<string>('', { nonNullable: true });

    @ViewChild('triggerEl', { static: true }) triggerRef!:    ElementRef<HTMLButtonElement>;
    @ViewChild('searchInput')                 searchInputEl?: ElementRef<HTMLInputElement>;

    readonly overlayPositions: ConnectedPosition[] = [
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top',    offsetY: 2 },
        { originX: 'start', originY: 'top',    overlayX: 'start', overlayY: 'bottom', offsetY: -2 },
    ];

    private readonly searchSignal = toSignal(this.searchControl.valueChanges, { initialValue: '' });

    constructor() {
        effect(() => {
            if (this.isOpen()) {
                setTimeout(() => this.searchInputEl?.nativeElement.focus(), 0);
            }
        });
    }

    triggerWidth(): number {
        return this.triggerRef?.nativeElement.offsetWidth ?? 0;
    }

    selectedOptions = computed(() =>
        this.options().filter(o => this.value().includes(o.value)),
    );

    filteredOptions = computed(() => {
        const q = (this.searchSignal() ?? '').toLowerCase().trim();
        if (!q) return this.options();
        return this.options().filter(o => o.label.toLowerCase().includes(q));
    });

    triggerLabel = computed(() => {
        const v = this.value();
        if (v.length === 0) return this.placeholder();
        if (v.length === 1) {
            return this.selectedOptions()[0]?.label ?? v[0];
        }
        return `${v.length} selected`;
    });

    isSelected(value: string): boolean {
        return this.value().includes(value);
    }

    toggleOpen(): void {
        this.isOpen.update(v => !v);
    }

    closeDropdown(): void {
        // (overlayOutsideClick) and (detach) both fire here; bail on the second call.
        if (!this.isOpen()) return;
        // Reset the FormControl while the <input> is still mounted; closing the
        // overlay first would detach the input and leave reset() writing to a
        // descriptor that's no longer writable in some HMR contexts.
        this.searchControl.reset('');
        this.isOpen.set(false);
    }

    toggle(opt: MultiselectOption): void {
        const current = [...this.value()];
        const idx = current.indexOf(opt.value);
        if (idx === -1) {
            current.push(opt.value);
        } else {
            current.splice(idx, 1);
        }
        this.valueChange.emit(current);
    }

    removeChip(value: string): void {
        const next = this.value().filter(v => v !== value);
        this.valueChange.emit([...next]);
    }
}
