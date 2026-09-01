import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    inject,
    input,
    output,
    signal,
    untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngxs/store';
import { AppConfigState, NaviGraphService, NaviGraphNode } from '@coolms/core-angular';
export interface ToolbarAction {
    id:       string;
    icon:     string;      // Bootstrap Icons name WITHOUT 'bi-': 'upload', 'trash'
    label?:   string;      // shown next to icon
    title?:   string;      // tooltip
    danger?:  boolean;
    primary?: boolean;     // accent-yellow primary styling
    active?:  boolean;     // pressed/active state (view mode buttons)
    disabled?: boolean;
    hidden?:  boolean;     // remove entirely (vs disabled = grayed)
    divider?: boolean;     // render | separator — still needs unique id for @for track
}

@Component({
    selector: 'app-page-toolbar',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule],
    template: `
        @if (hasToolbar()) {
        <div class="page-toolbar" [class.page-toolbar--compact]="compact()">

            <!-- LEFT: action buttons — fixed width, never pushed by breadcrumb or filters -->
            <div class="toolbar-left">
                @for (action of resolvedLeft(); track action.id) {
                    @if (!action.hidden) {
                        @if (action.divider) {
                            <div class="toolbar-sep"></div>
                        } @else {
                            <button type="button"
                                    class="toolbar-btn"
                                    [class.toolbar-btn--danger]="action.danger"
                                    [class.toolbar-btn--primary]="action.primary"
                                    [class.toolbar-btn--active]="action.active"
                                    [disabled]="action.disabled ?? false"
                                    [title]="action.title ?? action.label ?? ''"
                                    (click)="actionClick.emit(action.id)">
                                <i class="bi" [ngClass]="'bi-' + action.icon"></i>
                                @if (action.label && !iconsOnly()) {
                                    <span>{{ action.label }}</span>
                                }
                            </button>
                        }
                    }
                }
            </div>

            <!-- BREADCRUMB: can shrink if path is long, text truncates -->
            <div class="toolbar-breadcrumb-wrap">
                <ng-content select="[toolbar-breadcrumb]" />
            </div>

            <!-- SPACER: eats all remaining space, pushes right group to edge -->
            <div class="toolbar-spacer"></div>

            <!-- RIGHT: filters + view controls — NEVER moves, always at right edge -->
            <div class="toolbar-right">
                <ng-content select="[toolbar-filters]" />

                @if (hasRightActions()) {
                    <div class="toolbar-sep"></div>
                }

                @for (action of resolvedRight(); track action.id) {
                    @if (!action.hidden) {
                        @if (action.divider) {
                            <div class="toolbar-sep"></div>
                        } @else {
                            <button type="button"
                                    class="toolbar-btn"
                                    [class.toolbar-btn--danger]="action.danger"
                                    [class.toolbar-btn--active]="action.active"
                                    [class.toolbar-btn--primary]="action.primary"
                                    [disabled]="action.disabled ?? false"
                                    [title]="action.title ?? action.label ?? ''"
                                    (click)="actionClick.emit(action.id)">
                                <i class="bi" [ngClass]="'bi-' + action.icon"></i>
                                @if (action.label && !iconsOnly()) {
                                    <span>{{ action.label }}</span>
                                }
                            </button>
                        }
                    }
                }

                <ng-content select="[toolbar-right-extra]" />
            </div>
        </div>
        } @else if (!compact()) {
        <div class="toolbar-spacer-only"></div>
        }
    `,
    styles: [`
        .page-toolbar {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 0;
            min-height: 36px;
            margin-bottom: 8px;
        }

        .toolbar-spacer-only {
            height: 0;
            margin-bottom: 8px;
        }

        /* Left actions: fixed, never shrinks */
        .toolbar-left {
            display: flex;
            align-items: center;
            gap: 2px;
            flex-shrink: 0;
        }

        /* Breadcrumb: shrinks when path is long so right side stays put */
        .toolbar-breadcrumb-wrap {
            flex-shrink: 1;
            min-width: 0;
            overflow: hidden;
        }

        /* Spacer: absorbs all remaining space between breadcrumb and right group */
        .toolbar-spacer {
            flex: 1;
            min-width: 8px;
        }

        /* Right group: fixed to right edge, never shifts */
        .toolbar-right {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-shrink: 0;
        }

        .toolbar-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 12px;
            border: 1px solid var(--cms-btn-border);
            border-radius: var(--cms-radius);
            background: var(--cms-btn-bg);
            color: var(--cms-btn-text);
            font-size: .8125rem;
            font-weight: 500;
            line-height: 1.5;
            cursor: pointer;
            white-space: nowrap;
            transition: background .1s, border-color .1s, color .1s;
            user-select: none;
        }
        .toolbar-btn:hover:not(:disabled) {
            background: var(--cms-btn-hover-bg);
            border-color: var(--cms-btn-hover-border);
        }
        .toolbar-btn:focus-visible {
            outline: 2px solid var(--cms-accent);
            outline-offset: 2px;
        }
        .toolbar-btn:disabled { opacity: .45; cursor: not-allowed; }

        .toolbar-btn--primary {
            background: var(--cms-accent);
            border-color: var(--cms-accent);
            color: var(--cms-accent-fg);
        }
        .toolbar-btn--primary:hover:not(:disabled) {
            background: var(--cms-accent-hover);
            border-color: var(--cms-accent-hover);
        }
        .toolbar-btn--active {
            background: var(--cms-accent-light);
            border-color: var(--cms-accent);
            color: var(--cms-accent-text);
        }
        .toolbar-btn--danger { color: var(--cms-danger); border-color: var(--cms-danger-border); }
        .toolbar-btn--danger:hover:not(:disabled) {
            background: var(--cms-danger-light);
            border-color: var(--cms-danger);
        }
        .toolbar-sep {
            width: 1px;
            height: 20px;
            background: var(--cms-border);
            margin: 0 2px;
        }
        .bi { font-size: .875rem; line-height: 1; }

        /* Compact mode (notification drawer): icons-only buttons, smaller
           padding and min-height, zero outer margin/padding so the row
           list below begins immediately under the action bar. */
        .page-toolbar--compact {
            min-height: 28px;
            margin: 0;
            padding: 0;
        }
        .page-toolbar--compact .toolbar-btn {
            padding: 3px 6px;
            gap: 0;
        }
        .page-toolbar--compact .toolbar-btn span {
            display: none;
        }
        .page-toolbar--compact .bi { font-size: 1rem; }
    `],
})
export class PageToolbarComponent {
    // -- Direct action lists (used when treeSlug is NOT set) ------------------
    leftActions  = input<ToolbarAction[]>([]);
    rightActions = input<ToolbarAction[]>([]);
    /**
     * Compact rendering for narrow hosts (e.g. the 320px notification
     * drawer): hides button labels, shrinks padding and min-height,
     * drops the trailing margin so the toolbar can sit in a tight row.
     * Defaults to false so every existing consumer keeps its current
     * layout.
     */
    compact      = input<boolean>(false);

    /**
     * Render the bar even when it carries no ACTIONS.
     *
     * The visibility test only ever counted actions, so a toolbar whose whole
     * job is to host projected controls — a search box, a filter, the view
     * switcher — disappeared along with the last action. Media hid its search
     * and its view switcher the moment its four `view-*` NaviGraph nodes were
     * retired, because those nodes were the only thing keeping the bar alive.
     *
     * Angular gives no way to ask "did anything get projected into this
     * slot?", so the host declares it. Defaults to false: every existing
     * consumer keeps the collapse-when-empty behaviour.
     */
    alwaysShow   = input<boolean>(false);
    /**
     * Render buttons as icons with the label only as a tooltip.
     *
     * The label is a DECLARATION and stays on the node -- the same node shows
     * its text in a context menu. Whether this particular bar has room to draw
     * it is a property of the surface, so the host says it here rather than
     * fourteen nodes each claiming to be icon-only. Dense explorer bars (VFS)
     * use it; a page header with three actions does not.
     */
    iconsOnly    = input<boolean>(false);
    actionClick          = output<string>();
    /**
     * Emitted whenever the set of header-positioned actions changes.
     * Consumers bridge these to PageActionsService so they appear in cms-page-header.
     * Only fired when operating in NaviGraph mode (treeSlug is set).
     */
    headerActionsChanged = output<ToolbarAction[]>();

    // -- NaviGraph self-loading ------------------------------------------------
    /** When set, loads actions from the NaviGraph tree with this slug. */
    readonly treeSlug = input<string | null>(null);
    /** Evaluation context for showWhen / activeWhen conditions. */
    readonly context  = input<Record<string, unknown>>({});

    private readonly store      = inject(Store);
    private readonly naviGraph  = inject(NaviGraphService);
    private readonly destroyRef = inject(DestroyRef);

    /** Nodes loaded from NaviGraph; empty while loading or when treeSlug is null. */
    private readonly toolbarNodes = signal<NaviGraphNode[]>([]);

    constructor() {
        // When treeSlug changes, resolve the graph URL from the manifest and load nodes.
        // store.selectSnapshot is synchronous; loadTree is cached by URL in NaviGraphService.
        effect(() => {
            const slug = this.treeSlug();
            if (!slug) {
                untracked(() => this.toolbarNodes.set([]));
                return;
            }
            const pattern = this.store.selectSnapshot(AppConfigState.manifest)?.navi?.graphBySlug;
            if (!pattern) return;
            const url = pattern.replace('{slug}', slug);
            untracked(() => {
                this.naviGraph.loadTree(url)
                    .pipe(takeUntilDestroyed(this.destroyRef))
                    .subscribe(nodes => this.toolbarNodes.set(nodes));
            });
        });

        // Notify consumers whenever the header-slot actions change so they can
        // push them to PageActionsService (or any other page-header bridge).
        effect(() => {
            const headerActions = this.resolvedHeader();
            untracked(() => this.headerActionsChanged.emit(headerActions));
        });
    }

    /** True when operating in NaviGraph mode (treeSlug is provided). */
    private readonly usesNaviGraph = computed(() => this.treeSlug() !== null);

    /**
     * Header-slot actions: nodes with meta.position === 'header'.
     * Emitted via headerActionsChanged so consumers can push them to PageActionsService.
     * Empty when not in NaviGraph mode.
     */
    readonly resolvedHeader = computed((): ToolbarAction[] => {
        if (!this.usesNaviGraph()) return [];
        const ctx = this.context();
        return this.toolbarNodes()
            .filter(n =>
                this.naviGraph.isVisible(n, ctx) &&
                (n.meta['position'] as string | undefined) === 'header',
            )
            .map(n => this.nodeToAction(n, ctx));
    });

    /** Left-side toolbar actions: excludes 'header', 'right', and 'context' positions. */
    readonly resolvedLeft = computed((): ToolbarAction[] => {
        if (!this.usesNaviGraph()) return this.leftActions();
        const ctx = this.context();

        return this.trimDividers(this.toolbarNodes()
            .filter(n => {
                const pos = n.meta['position'] as string | undefined;
                return this.naviGraph.isVisible(n, ctx) &&
                    (n.meta['surface'] as string | undefined) !== 'context' &&
                    pos !== 'right' &&
                    pos !== 'header';
            })
            .map(n => this.nodeToAction(n, ctx)));
    });

    /**
     * Drop leading, trailing and doubled dividers.
     *
     * A separator groups the actions AROUND it, so once conditions have removed
     * the actions it was separating it is a stray line -- and every tree with
     * contextual actions produces them. The VFS bar had this logic inline; it
     * belongs to whoever renders the bar.
     */
    private trimDividers(actions: ToolbarAction[]): ToolbarAction[] {
        const kept: ToolbarAction[] = [];
        for (const action of actions) {
            if (true !== action.divider) {
                kept.push(action);
                continue;
            }
            if (0 === kept.length) continue;
            if (true === kept[kept.length - 1].divider) continue;
            kept.push(action);
        }
        while (kept.length > 0 && true === kept[kept.length - 1].divider) {
            kept.pop();
        }

        return kept;
    }

    /** Right-side actions: resolved from NaviGraph nodes or from the direct input. */
    readonly resolvedRight = computed((): ToolbarAction[] => {
        if (!this.usesNaviGraph()) return this.rightActions();
        const ctx = this.context();
        return this.toolbarNodes()
            .filter(n =>
                this.naviGraph.isVisible(n, ctx) &&
                (n.meta['surface'] as string | undefined) !== 'context' &&
                (n.meta['position'] as string | undefined) === 'right',
            )
            .map(n => this.nodeToAction(n, ctx));
    });

    /** True when at least one right action is visible — drives the separator between filters and view buttons. */
    readonly hasRightActions = computed(() => this.resolvedRight().some(a => !a.hidden && !a.divider));

    /**
     * True when at least one left or right action is present.
     * Used to hide the toolbar entirely (removing its min-height) when nothing
     * is visible — e.g. no row selected and no always-on actions.
     * Falls back to legacy inputs so non-NaviGraph callers are unaffected.
     */
    readonly hasAnyAction = computed(() =>
        this.resolvedLeft().length > 0 || this.resolvedRight().length > 0,
    );

    /**
     * True when the toolbar should render as a full bar (with min-height + border-bottom).
     * NaviGraph mode: treeSlug set AND at least one action lands IN the bar.
     * Legacy mode: direct leftActions or rightActions inputs are provided.
     * Or the host declared it always renders — see {@link alwaysShow}.
     *
     * Counting the bar's OWN actions rather than the tree's node count: a tree
     * whose nodes are all `position: header` contributes nothing here — they are
     * emitted to the page header instead — and counting nodes rendered an empty
     * bar with a min-height and a border for it. That is the difference between
     * a page that adopts a header-only tree and one that looks like it grew a
     * stray divider.
     */
    readonly hasToolbar = computed(() =>
        this.alwaysShow() ||
        (this.treeSlug() !== null && this.hasAnyAction()) ||
        this.leftActions().length > 0 ||
        this.rightActions().length > 0,
    );

    /** Converts a NaviGraphNode to a ToolbarAction for rendering. */
    private nodeToAction(node: NaviGraphNode, ctx: Record<string, unknown>): ToolbarAction {
        const meta     = node.meta;
        const actionId = String(meta['action'] ?? node.path);

        const active     = this.evalMetaCondition(meta['activeWhen'], ctx);
        const unavailable = this.evalMetaCondition(meta['disabledWhen'], ctx);
        const busy        = this.evalMetaCondition(meta['busyWhen'], ctx);
        // Busy implies disabled: an action already running must not be pressed
        // twice. Both undefined leaves `disabled` undefined -- see below.
        const disabled = undefined === unavailable && undefined === busy
            ? undefined
            : true === unavailable || true === busy;
        const label = true === busy && undefined !== meta['busyLabel']
            ? String(meta['busyLabel'])
            : (undefined !== meta['label'] ? String(meta['label']) : undefined);

        return {
            id:      actionId,
            icon:    String(meta['icon'] ?? ''),
            label,
            title:   node.title,
            danger:  Boolean(meta['danger']),
            primary: Boolean(meta['primary']),
            divider: (meta['type'] as string | undefined) === 'separator',
            active,
            disabled,
        };
    }

    /**
     * Evaluate one of the node's secondary conditions against the page context.
     *
     * showWhen decides whether an action EXISTS; these decide what state it is
     * in while it does. Same grammar and the same evaluator -- a page that can
     * say when an action applies should not need a second vocabulary to say
     * when it is pressed or busy.
     *
     * `disabledWhen` and `busyWhen` are separate because the reasons are:
     * unavailable is a state of the DRAFT (nothing to save yet), busy is a
     * state of the REQUEST (a save already running), and only the second has
     * something to say in the label. Folding them into one condition makes a
     * button that cannot be saved yet announce "Saving...".
     *
     * Returns undefined when the node declares no such condition, so an action
     * without one keeps ToolbarAction's own defaults rather than being pinned
     * to false.
     */
    private evalMetaCondition(cond: unknown, ctx: Record<string, unknown>): boolean | undefined {
        if (null === cond || typeof cond !== 'object') return undefined;

        return this.naviGraph.matchesShowWhen(cond as Record<string, unknown>, ctx);
    }
}
