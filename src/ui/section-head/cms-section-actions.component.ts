import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    Injector,
    computed,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import { ContextMenuService, type ContextMenuItem } from '../../context-menu/context-menu.service';
import { iconForName } from '../icons/bootstrap-icons';
import { SectionRowFit } from './section-fit';

/** One of a section's declared actions, as the section header draws it. */
export interface SectionHeadAction {
    id: string;
    label: string;
    /** A Bootstrap Icons name without its prefix. */
    icon?: string;
    danger?: boolean;
    disabled?: boolean;
    /** The server's sentence for a disabled action, as given. */
    reason?: string;
    /** Running: drawn disabled, its busy words in place of its label. */
    busy?: boolean;
    busyLabel?: string;
    /** Allowed once the session is elevated: drawn with a lock; the choice is emitted as usual. */
    locked?: boolean;
}

/** The section's primary action; with entries, a split button whose menu lists them. */
export interface SectionHeadPrimary extends SectionHeadAction {
    menu?: SectionHeadAction[];
    /** The split menu button's accessible name. */
    menuLabel?: string;
}

let nextId = 0;

/**
 * A header's actions: the one primary (filled; a split button when it has entries), then More holding the other
 * actions, a disabled one kept with its reason. Drawn inline in the host's actions row. Where the header's line has no
 * room (section-fit), the primary is its icon alone, its label its tooltip and accessible name; and where the icon does
 * not fit either, it is More's first entry, with its own entries after it.
 */
@Component({
    selector: 'cms-section-actions',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (primary(); as p) {
            <span class="cms-section-head__primary" [class.cms-section-head__primary--split]="hasMenu()">
                <button type="button" class="cms-btn cms-btn-primary cms-section-head__primary-btn"
                        [class.cms-section-head__primary-btn--icon]="!!p.icon"
                        data-action="primary"
                        [attr.aria-disabled]="isOff(p) ? 'true' : null"
                        [attr.aria-describedby]="p.disabled && p.reason ? uid + '-primary-reason' : null"
                        [attr.title]="tooltip()"
                        (click)="choose(p)">
                    @if (p.icon) {
                        <i class="bi" [class]="'bi bi-' + p.icon" data-part="icon" aria-hidden="true"></i>
                    }
                    <span class="cms-section-head__label">{{ labelOf(p) }}</span>
                    @if (p.locked) {
                        <i class="bi bi-lock-fill cms-section-head__lock" aria-hidden="true"></i>
                    }
                </button>
                @if (hasMenu()) {
                    <button #split type="button" class="cms-btn cms-btn-primary cms-section-head__split"
                            data-action="primary-menu" aria-haspopup="menu"
                            [attr.aria-expanded]="menuOwner() === 'primary'"
                            [attr.aria-label]="p.menuLabel ?? p.label"
                            (click)="openMenu(split, 'primary')">
                        <i class="bi bi-chevron-down" aria-hidden="true"></i>
                    </button>
                }
                @if (p.disabled && p.reason) {
                    <span class="cms-section-head__reason" [id]="uid + '-primary-reason'">{{ p.reason }}</span>
                }
            </span>
        }
        @if (drawMore()) {
            <button #moreBtn type="button" class="cms-section-head__more" data-action="more"
                    aria-haspopup="menu"
                    [attr.aria-expanded]="menuOwner() === 'more'"
                    [attr.aria-label]="moreLabel()" [attr.title]="moreLabel()"
                    (click)="openMenu(moreBtn, 'more')"
                    (keydown.arrowdown)="$event.preventDefault(); openMenu(moreBtn, 'more')"
                    (keydown.arrowup)="$event.preventDefault(); openMenu(moreBtn, 'more', 'last')">
                <i class="bi" [class]="'bi bi-' + moreIcon" aria-hidden="true"></i>
            </button>
        }
    `,
    styles: [`
        :host { display: contents; }
        .cms-section-head__primary { display: inline-flex; align-items: center; position: relative; }
        .cms-section-head__primary-btn { display: inline-flex; align-items: center; gap: var(--cms-space-2, 8px); }
        .cms-section-head__primary--split .cms-section-head__primary-btn { border-start-end-radius: 0; border-end-end-radius: 0; }
        .cms-section-head__split { border-start-start-radius: 0; border-end-start-radius: 0; margin-inline-start: 1px; padding-inline: var(--cms-space-2, 8px); }
        .cms-section-head__primary-btn[aria-disabled='true'] { opacity: .55; cursor: not-allowed; }
        .cms-section-head__lock { font-size: .75em; }
        /* Its icon alone: the label is kept for assistive technology. */
        :host-context([data-fit='3']) .cms-section-head__primary-btn--icon { padding-inline: var(--cms-space-2, 8px); }
        :host-context([data-fit='3']) .cms-section-head__primary-btn--icon .cms-section-head__label {
            position: absolute;
            clip: rect(0 0 0 0);
            width: 1px;
            height: 1px;
            overflow: hidden;
        }
        :host-context([data-fit='4']) .cms-section-head__primary, :host-context([data-fit='5']) .cms-section-head__primary { display: none; }
        .cms-section-head__reason {
            position: absolute;
            clip: rect(0 0 0 0);
            width: 1px;
            height: 1px;
            overflow: hidden;
        }
        .cms-section-head__more {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: var(--cms-control-height-md);
            height: var(--cms-control-height-md);
            border: 0;
            border-radius: var(--cms-radius-md, 6px);
            background: transparent;
            color: var(--cms-text-muted);
            cursor: pointer;
        }
        @media (hover: hover) and (pointer: fine) {
            .cms-section-head__more:hover { background: var(--cms-btn-hover-bg); }
        }
        .cms-section-head__more:focus-visible { outline: 2px solid var(--cms-focus-ring); outline-offset: 1px; }
    `],
})
export class CmsSectionActionsComponent {
    readonly primary = input<SectionHeadPrimary | null>(null);
    /** The other declared actions, in the tree's order. */
    readonly more = input<SectionHeadAction[]>([]);
    /** More's accessible name and tooltip, from the host's catalogue. */
    readonly moreLabel = input<string>('More actions');
    /** The id of the action chosen: the primary, one of its entries, or one of More's. A disabled or busy one emits nothing. */
    readonly action = output<string>();

    private readonly injector = inject(Injector);
    /** The header's line; none where the actions are drawn outside a header. */
    private readonly fit = inject(SectionRowFit, { optional: true });
    private readonly level = computed(() => this.fit?.level() ?? 0);
    private readonly menuService = signal<ContextMenuService | null>(null);
    protected readonly uid = `cms-section-head-${++nextId}`;
    protected readonly moreIcon = iconForName('three-dots') ?? 'three-dots';
    protected readonly hasMenu = computed(() => (this.primary()?.menu ?? []).length > 0);
    private readonly opened = signal<'primary' | 'more' | null>(null);
    /** Which of these menus is open, if one is. */
    protected readonly menuOwner = computed(() => (this.menuService()?.menu()?.owner === this ? this.opened() : null));

    /** More holds the primary while the line has no room for even its icon. */
    private readonly holdsPrimary = computed(() => this.level() >= 4 && this.primary() !== null);
    protected readonly drawMore = computed(() => this.more().length > 0 || this.holdsPrimary());
    /** The primary's reason while it is disabled; for its icon alone, its label first. */
    protected readonly tooltip = computed(() => {
        const p = this.primary();
        if (p === null) return null;
        const reason = p.disabled && p.reason ? p.reason : null;
        if (this.level() !== 3 || !p.icon) return reason;
        const label = this.labelOf(p);

        return reason === null ? label : `${label}: ${reason}`;
    });

    constructor() {
        const view = inject(ChangeDetectorRef);
        this.fit?.onChange(() => view.detectChanges());
    }

    protected labelOf(a: SectionHeadAction): string {
        return a.busy && a.busyLabel ? a.busyLabel : a.label;
    }

    protected isOff(a: SectionHeadAction): boolean {
        return a.disabled === true || a.busy === true;
    }

    protected choose(a: SectionHeadAction): void {
        if (this.isOff(a)) return;
        this.action.emit(a.id);
    }

    protected openMenu(button: HTMLElement, which: 'primary' | 'more', focus: 'first' | 'last' = 'first'): void {
        const menu = this.menuService() ?? this.injector.get(ContextMenuService);
        this.menuService.set(menu);
        if (this.menuOwner() === which) {
            menu.close();
            return;
        }
        const primary = this.primary();
        const entries = primary?.menu ?? [];
        const held = this.holdsPrimary() && primary !== null ? [primary, ...entries] : [];
        const actions = which === 'more' ? [...held, ...this.more()] : entries;
        const items: ContextMenuItem[] = actions.map((a) => ({
            id: a.id,
            label: this.labelOf(a),
            icon: a.icon ? (iconForName(a.icon) ?? a.icon) : undefined,
            danger: a.danger ?? false,
            disabled: this.isOff(a),
            locked: a.locked ?? false,
            ...(a.disabled === true && a.reason ? { refusal: a.reason } : {}),
        }));
        this.opened.set(which);
        menu.openFrom(button, items, (id) => {
            queueMicrotask(() => this.action.emit(id));
        }, { focus, owner: this });
    }
}
