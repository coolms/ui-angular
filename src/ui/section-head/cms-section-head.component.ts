import {
    ChangeDetectionStrategy,
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
 * The components contract's section-header, in this kit cms-section-head (cms-section-header is the group heading):
 * the head of a section from tablet width up. Row 1: the declared title, then the primary action and More (the
 * section's other actions) at the end. Row 2: the section's context, projected
 * through [section-context], drawn only when something is projected. No divider lines. fullWidth spans a one-column
 * page. Below tablet width the host draws the screen shell instead.
 */
@Component({
    selector: 'cms-section-head',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <header class="cms-section-head" [class.cms-section-head--full]="fullWidth()">
            <div class="cms-section-head__row" data-row="1">
                @if (icon()) {
                    <i [class]="'cms-section-head__icon bi bi-' + icon()" aria-hidden="true"></i>
                }
                <h1 class="cms-section-head__title" [attr.title]="title()">{{ title() }}</h1>
                <ng-content select="[section-meta]" />
                <div class="cms-section-head__actions">
                    <ng-content select="[section-actions]" />
                    @if (primary(); as p) {
                        <span class="cms-section-head__primary" [class.cms-section-head__primary--split]="hasMenu()">
                            <button type="button" class="cms-btn cms-btn-primary cms-section-head__primary-btn"
                                    data-action="primary"
                                    [attr.aria-disabled]="isOff(p) ? 'true' : null"
                                    [attr.aria-describedby]="p.disabled && p.reason ? uid + '-primary-reason' : null"
                                    [attr.title]="p.disabled && p.reason ? p.reason : null"
                                    (click)="choose(p)">
                                @if (p.icon) {
                                    <i class="bi" [class]="'bi bi-' + p.icon" aria-hidden="true"></i>
                                }
                                <span>{{ p.busy && p.busyLabel ? p.busyLabel : p.label }}</span>
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
                    @if (more().length > 0) {
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
                </div>
            </div>
            <div class="cms-section-head__context" data-row="2">
                <ng-content select="[section-context]" />
            </div>
        </header>
    `,
    styles: [`
        :host { display: block; }
        .cms-section-head { display: flex; flex-direction: column; background: var(--cms-surface); }
        .cms-section-head--full { padding-inline: var(--cms-space-5, 20px); }
        .cms-section-head__row {
            display: flex;
            align-items: center;
            gap: var(--cms-space-2, 8px);
            height: var(--cms-pane-toolbar-height);
            min-width: 0;
            white-space: nowrap;
        }
        .cms-section-head__icon { font-size: 1.25rem; color: var(--cms-text-secondary); flex: none; }
        .cms-section-head__title {
            margin: 0;
            flex: 1 1 auto;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: var(--cms-font-size-title-md, 1.125rem);
            font-weight: 600;
            color: var(--cms-text);
        }
        .cms-section-head__actions { display: flex; align-items: center; gap: var(--cms-space-1, 4px); flex: none; }
        .cms-section-head__primary { display: inline-flex; align-items: center; position: relative; }
        .cms-section-head__primary-btn { display: inline-flex; align-items: center; gap: var(--cms-space-2, 8px); }
        .cms-section-head__primary--split .cms-section-head__primary-btn { border-start-end-radius: 0; border-end-end-radius: 0; }
        .cms-section-head__split { border-start-start-radius: 0; border-end-start-radius: 0; margin-inline-start: 1px; padding-inline: var(--cms-space-2, 8px); }
        .cms-section-head__primary-btn[aria-disabled='true'] { opacity: .55; cursor: not-allowed; }
        .cms-section-head__lock { font-size: .75em; }
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
        .cms-section-head__more:hover { background: var(--cms-btn-hover-bg); }
        .cms-section-head__more:focus-visible { outline: 2px solid var(--cms-focus-ring); outline-offset: 1px; }
        .cms-section-head__context { display: flex; align-items: center; min-width: 0; height: var(--cms-pane-header-height); }
        .cms-section-head__context:empty { display: none; }
    `],
})
export class CmsSectionHeadComponent {
    readonly title = input.required<string>();
    /** A Bootstrap Icons name without its prefix, drawn before the title. */
    readonly icon = input<string>('');
    readonly primary = input<SectionHeadPrimary | null>(null);
    /** The section's other declared actions, in the tree's order. */
    readonly more = input<SectionHeadAction[]>([]);
    /** More's accessible name and tooltip, from the host's catalogue. */
    readonly moreLabel = input<string>('More actions');
    readonly fullWidth = input<boolean>(false);
    /** The id of the action chosen: the primary, one of its entries, or one of More's. A disabled or busy one emits nothing. */
    readonly action = output<string>();

    private readonly injector = inject(Injector);
    private readonly menuService = signal<ContextMenuService | null>(null);
    protected readonly uid = `cms-section-head-${++nextId}`;
    protected readonly moreIcon = iconForName('three-dots') ?? 'three-dots';
    protected readonly hasMenu = computed(() => (this.primary()?.menu ?? []).length > 0);
    private readonly opened = signal<'primary' | 'more' | null>(null);
    /** Which of this header's menus is open, if one is. */
    protected readonly menuOwner = computed(() => (this.menuService()?.menu()?.owner === this ? this.opened() : null));

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
        const actions = which === 'more' ? this.more() : (this.primary()?.menu ?? []);
        const items: ContextMenuItem[] = actions.map((a) => ({
            id: a.id,
            label: a.busy && a.busyLabel ? a.busyLabel : a.label,
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
