import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';

/** One chip: the value it chooses and its words. */
export interface FilterChipOption {
    id: string;
    label: string;
}

/**
 * A list's filter as chips: one chosen at a time (a radio group), the chosen one filled with a check. The chips wrap
 * whole onto the next line when the row is too narrow; none is cut off and the row never scrolls. The arrow keys move
 * the choice, the chosen chip is the one tab stop.
 */
@Component({
    selector: 'cms-filter-chips',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="cms-chips" role="radiogroup" [attr.aria-label]="label()">
            @for (o of options(); track o.id; let i = $index) {
                <button type="button" class="cms-chip" role="radio" [attr.data-chip]="o.id"
                        [class.is-on]="o.id === value()"
                        [attr.aria-checked]="o.id === value()"
                        [attr.tabindex]="o.id === value() ? 0 : -1"
                        (click)="choose(o.id)"
                        (keydown)="onKey($event, i)">
                    @if (o.id === value()) {
                        <i class="bi bi-check-lg" aria-hidden="true"></i>
                    }
                    {{ o.label }}
                </button>
            }
        </div>
    `,
    styles: [`
        :host { display: block; min-width: 0; }
        .cms-chips { display: flex; flex-wrap: wrap; gap: var(--cms-space-2, 8px); }
        .cms-chip {
            display: inline-flex; align-items: center; gap: var(--cms-space-1, 4px); flex: none;
            height: 32px; padding: 0 var(--cms-space-4, 16px); white-space: nowrap;
            border: 1px solid var(--cms-border); border-radius: var(--cms-radius-pill, 999px);
            background: var(--cms-surface); color: var(--cms-text-body, var(--cms-text));
            font: inherit; font-size: var(--cms-font-size-meta, .8125rem); cursor: pointer;
        }
        .cms-chip:hover { background: var(--cms-surface-muted); }
        .cms-chip:focus-visible { outline: 2px solid var(--cms-focus-ring); outline-offset: 1px; }
        .cms-chip.is-on {
            border-color: var(--cms-button-chrome-bg); background: var(--cms-button-chrome-bg);
            color: var(--cms-on-chrome); font-weight: var(--cms-font-weight-semibold, 600);
        }
    `],
})
export class CmsFilterChipsComponent {
    readonly options = input.required<readonly FilterChipOption[]>();
    /** The chosen chip's id. */
    readonly value = input.required<string>();
    /** The group's accessible name. */
    readonly label = input<string>('Filter');
    readonly valueChange = output<string>();

    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

    protected choose(id: string): void {
        if (id !== this.value()) this.valueChange.emit(id);
    }

    protected onKey(ev: KeyboardEvent, i: number): void {
        const last = this.options().length - 1;
        const to = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? (i === last ? 0 : i + 1)
            : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? (i === 0 ? last : i - 1)
            : null;
        if (to === null) return;
        ev.preventDefault();
        const option = this.options()[to];
        if (option === undefined) return;
        this.choose(option.id);
        this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.cms-chip')[to]?.focus();
    }
}
