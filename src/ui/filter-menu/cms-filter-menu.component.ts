import {
    ChangeDetectionStrategy,
    Component,
    Injector,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    untracked,
} from '@angular/core';

import { ContextMenuService, type ContextMenuFocus } from '../../context-menu/context-menu.service';

/** One choice of a list's filter: its value and its words. */
export interface FilterMenuOption {
    id: string;
    label: string;
}

/**
 * A list's one filter as a menu button, at the end of the row that names the list. On the default choice (the one that
 * shows every row) it is the funnel icon alone; on any other it says that choice, with the accent (a long name is cut
 * with an ellipsis, whole in the button's name and title), so a filtered list never looks like one with rows missing. The menu is a single choice and opens with the current one focused. With
 * fewer than two choices nothing is drawn. A value that names no choice reads as the default one, and the host is told
 * once. Where the list's title itself says the choice (a phone's top bar), `iconOnly` keeps the button an icon.
 */
@Component({
    selector: 'cms-filter-menu',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (options().length > 1) {
            <button #button type="button" class="cms-filter-menu" aria-haspopup="menu"
                    [class.cms-filter-menu--active]="active()"
                    [class.cms-filter-menu--named]="named()"
                    [attr.aria-expanded]="open()"
                    [attr.aria-label]="name()" [attr.title]="name()"
                    (click)="toggle(button, 'checked')"
                    (keydown.arrowdown)="$event.preventDefault(); toggle(button, 'checked')"
                    (keydown.arrowup)="$event.preventDefault(); toggle(button, 'last')">
                @if (named()) {
                    <span class="cms-filter-menu__label">{{ current()?.label }}</span>
                    <i class="bi bi-chevron-down cms-filter-menu__caret" aria-hidden="true"></i>
                } @else {
                    <i class="bi bi-funnel cms-filter-menu__icon" aria-hidden="true"></i>
                }
            </button>
        }
    `,
    styles: [`
        :host { display: inline-flex; flex: none; }
        .cms-filter-menu {
            display: inline-flex; align-items: center; justify-content: center; gap: var(--cms-space-1, 4px); box-sizing: border-box;
            width: var(--cms-control-height-md, 40px); height: var(--cms-control-height-md, 40px); padding: 0;
            border: 0; border-radius: var(--cms-radius-control, 10px);
            background: transparent; color: var(--cms-text-muted);
            font: inherit; font-size: var(--cms-font-size-meta, .8125rem); white-space: nowrap; cursor: pointer;
        }
        .cms-filter-menu--active { background: var(--cms-accent-light); color: var(--cms-accent-text); }
        .cms-filter-menu--named {
            width: auto; max-width: 176px; padding: 0 var(--cms-space-3, 12px); font-weight: var(--cms-font-weight-semibold, 600);
        }
        .cms-filter-menu__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
        .cms-filter-menu__icon { font-size: 1rem; }
        .cms-filter-menu__caret { flex: none; font-size: .625rem; }
        @media (hover: hover) and (pointer: fine) {
            .cms-filter-menu:not(.cms-filter-menu--active):hover { background: var(--cms-btn-hover-bg); }
        }
        .cms-filter-menu:focus-visible { outline: 2px solid var(--cms-focus-ring); outline-offset: 1px; }
    `],
})
export class CmsFilterMenuComponent {
    /** What it filters, in the accessible name before the current choice ("Show: All"). */
    readonly label = input<string>('Show');
    /** The choices shown, in order. */
    readonly options = input.required<readonly FilterMenuOption[]>();
    /** The current choice's id. */
    readonly value = input.required<string>();
    /** The id of the choice that shows every row; the first choice's when it is not given or names none. */
    readonly defaultValue = input<string | null>(null);
    /** The button stays an icon whatever the choice: the host says an active one in the list's title. */
    readonly iconOnly = input<boolean>(false);
    /** The chosen choice's id, when it differs from the current one. */
    readonly valueChange = output<string>();

    private readonly injector = inject(Injector);
    private readonly menuService = signal<ContextMenuService | null>(null);

    private readonly fallback = computed(() =>
        this.options().find(o => o.id === this.defaultValue()) ?? this.options().at(0) ?? null);
    /** The choice in force: the one the value names, else the default. */
    protected readonly current = computed(() => this.options().find(o => o.id === this.value()) ?? this.fallback());
    protected readonly active = computed(() => this.current() !== this.fallback());
    protected readonly named = computed(() => this.active() && !this.iconOnly());
    protected readonly name = computed(() => `${this.label()}: ${this.current()?.label ?? ''}`);
    /** This button's own menu is the open one. */
    protected readonly open = computed(() => this.menuService()?.menu()?.owner === this);

    /** The last value found to name no choice: the host is told once of each. */
    private told: string | null = null;

    constructor() {
        effect(() => {
            const value = this.value();
            const fallback = this.fallback();
            if (fallback === null || this.options().some(o => o.id === value)) {
                this.told = null;
                return;
            }
            if (this.told === value) return;
            this.told = value;
            untracked(() => this.valueChange.emit(fallback.id));
        });
    }

    /** A press opens the menu under the button, or closes it when it is open. */
    protected toggle(button: HTMLElement, focus: ContextMenuFocus): void {
        const menu = this.menuService() ?? this.injector.get(ContextMenuService);
        this.menuService.set(menu);
        if (this.open()) {
            menu.close();
            return;
        }
        const current = this.current()?.id;
        const items = this.options().map(o => ({ id: o.id, label: o.label, checked: o.id === current }));
        menu.openFrom(button, items, (id) => {
            if (id !== this.current()?.id) this.valueChange.emit(id);
        }, { focus, owner: this, label: this.label() });
    }
}
