import {
    ChangeDetectionStrategy,
    Component,
    input,
    output,
} from '@angular/core';
import {
    EXPLORER_VIEW_MODE_META,
    ExplorerViewMode,
} from './explorer-view-mode';

/**
 * The view-mode buttons every explorer shows (#1709).
 *
 * One control, one set of icons, one order — driven by the modes the layout
 * YAML declares. It replaces three per-module implementations that had drifted
 * apart in vocabulary, iconography and even in which end of the toolbar they
 * sat.
 *
 * Renders NOTHING when fewer than two modes are offered: a switcher with one
 * option is a button that does not do anything, and an explorer with a single
 * rendering should simply not show one.
 */
@Component({
    selector: 'app-explorer-view-switcher',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (modes().length > 1) {
            <div class="view-switch" role="group" aria-label="View mode">
                @for (mode of modes(); track mode) {
                    <button type="button"
                            class="view-switch__btn"
                            [class.view-switch__btn--active]="mode === active()"
                            [attr.aria-pressed]="mode === active()"
                            [title]="meta[mode].label"
                            (click)="modeChange.emit(mode)">
                        <i class="bi" [class]="'bi-' + meta[mode].icon"></i>
                    </button>
                }
            </div>
        }
    `,
    styles: [`
        .view-switch { display: inline-flex; align-items: center; gap: 2px; }
        .view-switch__btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 30px;
            height: 28px;
            padding: 0;
            border: 1px solid var(--cms-btn-border);
            border-radius: var(--cms-radius);
            background: var(--cms-btn-bg);
            color: var(--cms-btn-text);
            cursor: pointer;
            transition: background .1s, border-color .1s, color .1s;
        }
        .view-switch__btn:hover { background: var(--cms-btn-hover-bg); border-color: var(--cms-btn-hover-border); }
        .view-switch__btn:focus-visible { outline: 2px solid var(--cms-accent); outline-offset: 2px; }
        .view-switch__btn--active {
            background: var(--cms-accent-light);
            border-color: var(--cms-accent);
            color: var(--cms-accent-text);
        }
        .view-switch__btn .bi { font-size: .875rem; line-height: 1; }
    `],
})
export class ExplorerViewSwitcherComponent {
    /** Offered modes, in the order the layout declared them. */
    readonly modes = input<readonly ExplorerViewMode[]>([]);

    readonly active = input<ExplorerViewMode | null>(null);

    readonly modeChange = output<ExplorerViewMode>();

    protected readonly meta = EXPLORER_VIEW_MODE_META;
}
