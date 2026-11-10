import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    type ElementRef,
    inject,
    Injector,
    input,
    output,
    signal,
    untracked,
    viewChild,
} from '@angular/core';
import { ContextMenuService } from '../../context-menu/context-menu.service';
import {
    type PaneToolbarAction,
    type PaneToolbarWidths,
} from './cms-pane-toolbar.types';
import { iconForName } from '../icons/bootstrap-icons';
import { groupsOf, overflowSteps, paneToolbarLayout } from './pane-toolbar-layout';

let nextId = 0;

/**
 * The row of actions at the top of a pane (contract component `pane-toolbar`): one height in every pane, so the rows
 * line up across a screen. Actions in ordered groups with separators, a trailing status, and More actions.
 *
 * Measured on its own width (a ResizeObserver on the row), never the window's: as it narrows labels hide one by one,
 * by overflow number, the lowest first and those sharing a number together, then those of the actions with no number
 * from the end of the row back; each action keeps its name and shows its label as a tooltip. Only once every label is
 * hidden do actions go behind More actions by their overflow number, never one alone; one with no number never goes.
 * Widening undoes it in the reverse order. An action with overflow 0 is menu only: never in the row, always behind
 * More actions, which is drawn for it even alone. One Tab stop: Left, Right, Home and End move inside.
 *
 * The actions are the server's NaviGraph nodes, those the host has a handler for; the row knows nothing of what they do.
 */
@Component({
    selector: 'cms-pane-toolbar',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '(keydown)': 'onKeydown($event)', '(focusin)': 'onFocusin($event)' },
    template: `
        <div #row class="cms-pane-toolbar" role="toolbar"
             [class.cms-pane-toolbar--labels-hidden]="layout().labelsHidden"
             [class.cms-pane-toolbar--labels-partly-hidden]="!layout().labelsHidden && layout().bare.length > 0"
             [attr.aria-label]="label()">
            <div class="cms-pane-toolbar__actions">
                @for (group of rowGroups(); track $index) {
                    @if (group.separator) {
                        <div class="cms-pane-toolbar__separator" role="separator" aria-orientation="vertical"></div>
                    }
                    <div class="cms-pane-toolbar__group">
                        @for (action of group.actions; track action.id) {
                            <button type="button"
                                    class="cms-pane-toolbar__action"
                                    [class.cms-pane-toolbar__action--danger]="action.danger"
                                    [class.cms-pane-toolbar__action--text]="iconOf(action) === null"
                                    [class.cms-pane-toolbar__action--bare]="iconOf(action) !== null && isBare(action.id)"
                                    [attr.data-action]="action.id"
                                    [attr.data-pinned]="action.overflow === undefined ? '' : null"
                                    [attr.data-overflowed]="isBehind(action.id) ? '' : null"
                                    [hidden]="isBehind(action.id)"
                                    [attr.tabindex]="tabStop() === action.id ? 0 : -1"
                                    [attr.aria-label]="action.label"
                                    [attr.aria-disabled]="action.disabled ? 'true' : null"
                                    [attr.aria-busy]="action.busy ? 'true' : null"
                                    [attr.aria-describedby]="action.disabled && action.reason ? reasonId(action.id) : null"
                                    [attr.data-tip-dismissed]="tipDismissed() === action.id ? '' : null"
                                    (click)="choose(action)"
                                    (mouseleave)="tipDismissed.set(null)">
                                @if (iconOf(action); as icon) {
                                    <span class="cms-pane-toolbar__mark" aria-hidden="true">
                                        <i class="bi" [class]="'bi bi-' + icon"></i>
                                        @if (action.busy) {
                                            <span class="cms-pane-toolbar__spinner"></span>
                                        }
                                    </span>
                                } @else if (action.busy) {
                                    <span class="cms-pane-toolbar__mark" aria-hidden="true"><span class="cms-pane-toolbar__spinner"></span></span>
                                }
                                <span class="cms-pane-toolbar__label" aria-hidden="true">{{ action.label }}</span>
                                <span class="cms-pane-toolbar__tip" aria-hidden="true">{{ tipOf(action) }}</span>
                                @if (action.disabled && action.reason) {
                                    <span class="cms-pane-toolbar__sr" [id]="reasonId(action.id)">{{ action.reason }}</span>
                                }
                            </button>
                        }
                    </div>
                }
                @if (layout().overflowed.length > 0) {
                    <button #more type="button"
                            class="cms-pane-toolbar__more"
                            data-action="more"
                            aria-haspopup="menu"
                            [attr.aria-expanded]="menuOpen()"
                            [attr.aria-label]="moreLabel()"
                            [attr.tabindex]="tabStop() === 'more' ? 0 : -1"
                            [attr.data-tip-dismissed]="tipDismissed() === 'more' ? '' : null"
                            (click)="openMore(more, 'first')"
                            (mouseleave)="tipDismissed.set(null)">
                        <i class="bi" [class]="'bi bi-' + moreIcon" aria-hidden="true"></i>
                        <span class="cms-pane-toolbar__tip" aria-hidden="true">{{ moreLabel() }}</span>
                    </button>
                }
            </div>
            @if (status()) {
                <div class="cms-pane-toolbar__status" [attr.title]="status()">{{ status() }}</div>
            }
        </div>

        <!-- What each part is wide, labelled and not: read, never seen or reached. -->
        <div #measure class="cms-pane-toolbar__measure" aria-hidden="true" inert>
            <span class="cms-pane-toolbar__actions">
                @for (action of actions(); track action.id) {
                    <span class="cms-pane-toolbar__action" [attr.data-measure-action]="action.id" data-measure-mode="labelled">
                        @if (iconOf(action); as icon) {
                            <i class="bi" [class]="'bi bi-' + icon"></i>
                        }
                        <span class="cms-pane-toolbar__label">{{ action.label }}</span>
                    </span>
                    @if (iconOf(action); as icon) {
                        <span class="cms-pane-toolbar__action cms-pane-toolbar__action--icon" [attr.data-measure-action]="action.id" data-measure-mode="icon">
                            <i class="bi" [class]="'bi bi-' + icon"></i>
                        </span>
                    } @else {
                        <span class="cms-pane-toolbar__action" [attr.data-measure-action]="action.id" data-measure-mode="icon">
                            <span class="cms-pane-toolbar__label">{{ action.label }}</span>
                        </span>
                    }
                }
                <span class="cms-pane-toolbar__more" data-measure-more><i class="bi" [class]="'bi bi-' + moreIcon"></i></span>
                <span class="cms-pane-toolbar__separator" data-measure-separator></span>
            </span>
        </div>
    `,
    styles: [`
        :host { display: block; min-width: 0; position: relative; }
        .cms-pane-toolbar {
            box-sizing: border-box;
            display: flex;
            align-items: center;
            gap: var(--cms-space-3, 12px);
            width: 100%;
            min-width: 0;
            /* The pane-toolbar row height: row-height with space-2 above and below. */
            height: calc(var(--cms-row-height) + 2 * var(--cms-space-2));
            padding-block: var(--cms-space-2, 8px);
            overflow: visible;
            white-space: nowrap;
        }
        .cms-pane-toolbar__actions {
            display: flex;
            align-items: center;
            gap: var(--cms-space-1, 4px);
            flex: 0 0 auto;
        }
        .cms-pane-toolbar__group { display: contents; }
        .cms-pane-toolbar__separator {
            box-sizing: border-box;
            align-self: center;
            width: 1px;
            height: var(--cms-space-6, 24px);
            margin-inline: var(--cms-space-1, 4px);
            background: var(--cms-border);
        }
        .cms-pane-toolbar__action,
        .cms-pane-toolbar__more {
            position: relative;
            box-sizing: border-box;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            min-width: var(--cms-row-height, 36px);
            height: var(--cms-row-height, 36px);
            padding: 0 var(--cms-space-3, 12px);
            border: 1px solid transparent;
            border-radius: var(--cms-radius-control, 10px);
            background: transparent;
            color: var(--cms-text);
            font: inherit;
            font-size: var(--cms-font-size-body, 14px);
            font-weight: var(--cms-font-weight-medium, 500);
            line-height: 1;
            white-space: nowrap;
            cursor: pointer;
        }
        .cms-pane-toolbar__more,
        .cms-pane-toolbar__action--icon,
        .cms-pane-toolbar__action--bare { padding: 0; width: var(--cms-row-height, 36px); }
        .cms-pane-toolbar__action[hidden] { display: none; }
        .cms-pane-toolbar__action:hover:not([aria-disabled='true']),
        .cms-pane-toolbar__more:hover { background: var(--cms-btn-hover-bg); }
        .cms-pane-toolbar__action:focus-visible,
        .cms-pane-toolbar__more:focus-visible { outline: 2px solid var(--cms-focus-ring); outline-offset: 1px; }
        .cms-pane-toolbar__action[aria-disabled='true'] { opacity: .45; cursor: default; }
        .cms-pane-toolbar__action--danger { color: var(--cms-danger); }
        .cms-pane-toolbar__action--danger:hover:not([aria-disabled='true']) { background: var(--cms-danger-light); }
        .cms-pane-toolbar .bi { font-size: 1rem; line-height: 1; }
        /* An action whose icon the kit does not have is never bare: it keeps its label and needs no tooltip. */
        .cms-pane-toolbar__action--bare .cms-pane-toolbar__label { display: none; }
        .cms-pane-toolbar__tip { display: none; }
        .cms-pane-toolbar__action--bare:is(:hover, :focus-visible):not([data-tip-dismissed]) .cms-pane-toolbar__tip,
        .cms-pane-toolbar__more:is(:hover, :focus-visible):not([data-tip-dismissed]) .cms-pane-toolbar__tip {
            display: block;
            position: absolute;
            top: calc(100% + var(--cms-space-1, 4px));
            left: 50%;
            transform: translateX(-50%);
            z-index: 10;
            padding: var(--cms-space-1, 4px) var(--cms-space-2, 8px);
            border-radius: var(--cms-radius-sm, 4px);
            background: var(--cms-sidebar-bg);
            color: var(--cms-on-chrome, #fff);
            font-size: var(--cms-font-size-label, 12px);
            font-weight: var(--cms-font-weight-regular, 400);
            pointer-events: auto;
        }
        /* The icon and, while busy, the spinner share one place: the icon gives way only once the spinner shows. */
        .cms-pane-toolbar__mark { display: inline-grid; place-items: center; }
        .cms-pane-toolbar__mark > * { grid-area: 1 / 1; }
        .cms-pane-toolbar__mark:has(.cms-pane-toolbar__spinner) .bi {
            animation: cms-pane-toolbar-vanish 0s linear var(--cms-state-delay, 300ms) both;
        }
        @keyframes cms-pane-toolbar-vanish { from { opacity: 1; } to { opacity: 0; } }
        .cms-pane-toolbar__spinner {
            box-sizing: border-box;
            width: var(--cms-spinner-size-inline, 16px);
            height: var(--cms-spinner-size-inline, 16px);
            border: var(--cms-spinner-stroke, 2px) solid var(--cms-spinner-track, var(--cms-border));
            border-top-color: var(--cms-spinner-color, var(--cms-accent-text));
            border-radius: 50%;
            animation:
                cms-pane-toolbar-appear 0s linear var(--cms-state-delay, 300ms) both,
                cms-pane-toolbar-turn var(--cms-spinner-duration, 800ms) linear infinite;
        }
        @keyframes cms-pane-toolbar-turn { to { transform: rotate(360deg); } }
        @keyframes cms-pane-toolbar-appear { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cms-pane-toolbar-pulse { 50% { opacity: .35; } }
        @media (prefers-reduced-motion: reduce) {
            .cms-pane-toolbar__spinner {
                animation:
                    cms-pane-toolbar-appear 0s linear var(--cms-state-delay, 300ms) both,
                    cms-pane-toolbar-pulse 1.6s ease-in-out infinite;
            }
        }
        .cms-pane-toolbar__status {
            flex: 1 1 0;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            text-align: end;
            color: var(--cms-text-muted);
            font-size: var(--cms-font-size-meta, 13px);
        }
        .cms-pane-toolbar__sr {
            position: absolute;
            width: 1px;
            height: 1px;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
        }
        .cms-pane-toolbar__measure {
            position: absolute;
            top: 0;
            left: 0;
            height: 0;
            overflow: hidden;
            visibility: hidden;
            pointer-events: none;
            white-space: nowrap;
        }
        .cms-pane-toolbar__measure .cms-pane-toolbar__actions { display: inline-flex; width: max-content; }
        /* Below breakpoint-desktop each action is a touch target, in the same row height. */
        @media (max-width: 1199.98px) {
            .cms-pane-toolbar { padding-block: var(--cms-space-1, 4px); }
            .cms-pane-toolbar__action,
            .cms-pane-toolbar__more {
                min-width: var(--cms-touch-target-min, 44px);
                height: var(--cms-touch-target-min, 44px);
            }
            .cms-pane-toolbar__more,
            .cms-pane-toolbar__action--icon,
            .cms-pane-toolbar__action--bare { width: var(--cms-touch-target-min, 44px); }
        }
    `],
})
export class CmsPaneToolbarComponent {
    /** The server's action nodes the host has a handler for, in the tree's order. */
    readonly actions = input.required<readonly PaneToolbarAction[]>();
    /** The toolbar's accessible name, in the host's words. */
    readonly label = input.required<string>();
    /** The trailing status, such as "Synced at 14:32", formatted by the host. */
    readonly status = input<string | null>(null);
    /** More actions' accessible name and tooltip, from the host's catalogue. */
    readonly moreLabel = input<string>('More actions');
    /** The id of an action chosen, from the row or from More actions. A disabled or busy action emits nothing. */
    readonly action = output<string>();

    private readonly injector = inject(Injector);
    /** The kit's menu service, taken the first time More actions opens: a row that never overflows needs none. */
    private readonly menuService = signal<ContextMenuService | null>(null);
    private readonly row = viewChild.required<ElementRef<HTMLElement>>('row');
    private readonly measure = viewChild.required<ElementRef<HTMLElement>>('measure');
    private readonly uid = `cms-pane-toolbar-${++nextId}`;

    private readonly width = signal<number | null>(null);
    private readonly widths = signal<PaneToolbarWidths | null>(null);
    /** The action that holds the row's one Tab stop. */
    private readonly focused = signal<string | null>(null);
    protected readonly tipDismissed = signal<string | null>(null);

    readonly layout = computed(() => paneToolbarLayout(this.width(), this.actions(), this.widths()));
    private readonly behind = computed(() => new Set(this.layout().overflowed));
    private readonly bare = computed(() => new Set(this.layout().bare));
    /**
     * The groups as drawn: a separator only before a group that still shows an action, and only when one before it
     * does too -- never leading, trailing or doubled, however many groups went behind More actions.
     */
    protected readonly rowGroups = computed(() => {
        let before = false;

        return groupsOf(this.actions()).map((actions) => {
            const shows = actions.some((a) => !this.behind().has(a.id));
            const separator = shows && before;
            before ||= shows;

            return { actions, separator };
        });
    });
    protected readonly moreIcon = iconForName('three-dots') ?? 'three-dots';
    protected readonly menuOpen = computed(() => this.menuService()?.menu()?.owner === this);

    /** What Tab reaches, in order: the actions in the row, then More actions. */
    private readonly stops = computed(() => [
        ...groupsOf(this.actions()).flat().filter((a) => !this.behind().has(a.id)).map((a) => a.id),
        ...(this.layout().overflowed.length > 0 ? ['more'] : []),
    ]);
    protected readonly tabStop = computed(() => {
        const stops = this.stops();
        const at = this.focused();

        return at !== null && stops.includes(at) ? at : (stops[0] ?? null);
    });

    constructor() {
        const destroyRef = inject(DestroyRef);
        afterNextRender(() => {
            if (typeof ResizeObserver === 'undefined') return;
            const row = this.row().nativeElement;
            const measure = this.measure().nativeElement;
            const watch = new ResizeObserver(() => this.read());
            watch.observe(row);
            watch.observe(measure.firstElementChild ?? measure);
            destroyRef.onDestroy(() => watch.disconnect());
            this.read();
        });
        // More actions closes its menu when it leaves the row.
        effect(() => {
            if (this.layout().overflowed.length === 0 && untracked(() => this.menuOpen())) this.menuService()?.close();
        });
    }

    protected isBehind(id: string): boolean {
        return this.behind().has(id);
    }

    protected isBare(id: string): boolean {
        return this.bare().has(id);
    }

    /** The kit's icon for the node's Bootstrap Icons name; null shows the label alone. */
    protected iconOf(action: PaneToolbarAction): string | null {
        return iconForName(action.icon);
    }

    protected reasonId(id: string): string {
        return `${this.uid}-reason-${id}`;
    }

    protected tipOf(action: PaneToolbarAction): string {
        return action.disabled === true && (action.reason ?? '') !== '' ? `${action.label} -- ${action.reason}` : action.label;
    }

    protected choose(action: PaneToolbarAction): void {
        this.focused.set(action.id);
        if (action.disabled === true || action.busy === true) return;
        this.action.emit(action.id);
    }

    /** More actions: the actions behind it, by their overflow number, each with its icon and label, through the kit's menu. */
    protected openMore(button: HTMLElement, focus: 'first' | 'last'): void {
        this.focused.set('more');
        const menu = this.menuService() ?? this.injector.get(ContextMenuService);
        this.menuService.set(menu);
        if (this.menuOpen()) {
            menu.close();
            return;
        }
        const byId = new Map(this.actions().map((a) => [a.id, a]));
        const items = overflowSteps(this.actions()).flat()
            .filter((id) => this.behind().has(id))
            .map((id) => byId.get(id)!)
            .map((a) => ({
                id: a.id,
                label: a.label,
                icon: iconForName(a.icon) ?? undefined,
                danger: a.danger ?? false,
                disabled: (a.disabled ?? false) || (a.busy ?? false),
                ...(a.disabled === true && a.reason !== undefined && a.reason !== '' ? { refusal: a.reason } : {}),
            }));
        menu.openFrom(button, items, (id) => {
            // After the menu has closed and focus is back on More actions, so a choice the action opens stays open.
            queueMicrotask(() => this.action.emit(id));
        }, { focus, owner: this });
    }

    protected onFocusin(event: FocusEvent): void {
        const id = (event.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action');
        if (id !== undefined && id !== null) this.focused.set(id);
    }

    protected onKeydown(event: KeyboardEvent): void {
        const target = event.target as HTMLElement;
        if (event.key === 'Escape') {
            const id = target.getAttribute('data-action');
            if (id !== null) this.tipDismissed.set(id);
            return;
        }
        if (target.matches('.cms-pane-toolbar__more') && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            this.openMore(target, event.key === 'ArrowDown' ? 'first' : 'last');
            return;
        }
        const stops = this.stops();
        const at = stops.indexOf(target.getAttribute('data-action') ?? '');
        if (at < 0) return;
        const next = event.key === 'ArrowRight' ? Math.min(at + 1, stops.length - 1)
            : event.key === 'ArrowLeft' ? Math.max(at - 1, 0)
            : event.key === 'Home' ? 0
            : event.key === 'End' ? stops.length - 1
            : null;
        if (next === null) return;
        event.preventDefault();
        this.focused.set(stops[next]);
        this.tipDismissed.set(null);
        this.row().nativeElement.querySelector<HTMLElement>(`[data-action="${CSS.escape(stops[next])}"]`)?.focus();
    }

    /** Reads the row's width and every part's, labelled and not. */
    private read(): void {
        const row = this.row().nativeElement;
        const measure = this.measure().nativeElement;
        const style = getComputedStyle(row);
        const status = row.querySelector('.cms-pane-toolbar__status');
        const width = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
            - (status ? parseFloat(style.columnGap) || 0 : 0);
        const wide = (el: Element | null): number => (el ? el.getBoundingClientRect().width : 0);
        const labelled = new Map<string, number>();
        const icon = new Map<string, number>();
        for (const el of Array.from(measure.querySelectorAll('[data-measure-action][data-measure-mode=labelled]'))) {
            labelled.set(el.getAttribute('data-measure-action')!, wide(el));
        }
        for (const el of Array.from(measure.querySelectorAll('[data-measure-action][data-measure-mode=icon]'))) {
            icon.set(el.getAttribute('data-measure-action')!, wide(el));
        }
        const separator = measure.querySelector('[data-measure-separator]');
        const sepStyle = separator ? getComputedStyle(separator) : null;
        const actions = measure.querySelector('.cms-pane-toolbar__actions');
        this.widths.set({
            labelled,
            icon,
            more: wide(measure.querySelector('[data-measure-more]')),
            separator: wide(separator) + (sepStyle ? parseFloat(sepStyle.marginLeft) + parseFloat(sepStyle.marginRight) : 0),
            gap: actions ? parseFloat(getComputedStyle(actions).columnGap) || 0 : 0,
        });
        this.width.set(width);
    }
}
