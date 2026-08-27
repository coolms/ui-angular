import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    output,
    signal,
} from '@angular/core';
import { CmsPageHeaderComponent } from './cms-page-header.component';
import { PageToolbarComponent, type ToolbarAction } from './page-toolbar.component';

/**
 * `<cms-list-page>` — the single, blessed shell for admin list pages.
 *
 * ## Why this exists
 * Three list-page shapes had drifted across the admin SPA:
 *   1. the mature pattern — `*-page.component.ts` → `<cms-list-layout>` →
 *      `*-list` with `<app-page-toolbar treeSlug>` + grid, wired through
 *      `PageActionsService` (consistent, but ~2 components + 2 YAMLs +
 *      a service bridge of boilerplate per page);
 *   2. hand-rolled self-contained `<cms-page-header>` + grid (no action
 *      bar — the newest pages, e.g. Forms/Cockpit, skipped the heavy
 *      machinery and looked different as a result);
 *   3. bespoke headers/tables.
 *
 * This component folds the chrome of (1) into ONE host so a list page is
 * a thin template with no `PageActionsService` dance, while keeping the
 * navi-driven action bar available. It owns the things that drifted: the
 * page-header (icon + title + subtitle + actions), the action bar, the
 * host flex layout, and the header↔grid gap. The page just declares its
 * header + drops its `<coolms-datagrid>` in as projected content, so each
 * page keeps its own grid wiring (tree / lazy / live / selection) intact.
 *
 * ## Usage — direct actions (simplest)
 * ```html
 * <cms-list-page title="Forms" icon="ui-checks-grid"
 *                [actions]="headerActions()" (actionClick)="onAction($event)">
 *   <coolms-datagrid gridId="form:list" [configBaseUrl]="configBaseUrl()"
 *                    [externalData]="gridData()"
 *                    (rowActionTriggered)="onRowAction($event)" />
 * </cms-list-page>
 * ```
 *
 * ## Usage — navi-driven action bar (replaces the cms-list-layout pattern)
 * ```html
 * <cms-list-page title="Calendars" icon="calendar"
 *                toolbarTreeSlug="navi.toolbar.calendar.calendars"
 *                [toolbarContext]="toolbarContext()"
 *                (actionClick)="onAction($event)">
 *   <coolms-datagrid ... />
 * </cms-list-page>
 * ```
 * When `toolbarTreeSlug` is set the action bar renders from that navi tree
 * and its **header-positioned** actions are surfaced into the page-header
 * automatically (the `headerActionsChanged` bridge that every page used to
 * re-implement is done here, once). A single `(actionClick)` output fires
 * for both header buttons and action-bar buttons, so the page has one
 * handler.
 *
 * ## Projected slots
 *  - default — the grid (and anything else that is the page body).
 *  - `[header-meta]` — chips/badges next to the title (forwarded to the header).
 *  - `[toolbar-filters]` / `[toolbar-breadcrumb]` — forwarded into the
 *    action bar (only rendered when the action bar is shown).
 *
 * ## Host requirement (IMPORTANT)
 * This scaffold's `:host` is a flex column with `flex: 1; min-height: 0`, but
 * that only stretches it when its OWN host (the page component that embeds
 * `<cms-list-page>`) is also a stretching flex column. So every page using
 * this MUST keep:
 * ```
 * styles: [':host { display: flex; flex-direction: column; flex: 1; min-height: 0; }']
 * ```
 * Omit it and the page collapses to content height — the footer floats up
 * with empty space below instead of pinning to the bottom of the viewport.
 */
@Component({
    selector: 'cms-list-page',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CmsPageHeaderComponent, PageToolbarComponent],
    template: `
        <cms-page-header
            [title]="title()"
            [icon]="icon()"
            [subtitle]="subtitle()"
            [actions]="resolvedHeaderActions()"
            (actionClick)="actionClick.emit($event)">
            <ng-content select="[header-meta]" ngProjectAs="[header-meta]" />
        </cms-page-header>

        <div class="cms-list-page__body">
            @if (showToolbar()) {
                <app-page-toolbar
                    [treeSlug]="toolbarTreeSlug()"
                    [context]="toolbarContext()"
                    [leftActions]="toolbarLeftActions()"
                    [rightActions]="toolbarRightActions()"
                    (actionClick)="actionClick.emit($event)"
                    (headerActionsChanged)="naviHeaderActions.set($event)">
                    <ng-content select="[toolbar-breadcrumb]" ngProjectAs="[toolbar-breadcrumb]" />
                    <ng-content select="[toolbar-filters]" ngProjectAs="[toolbar-filters]" />
                </app-page-toolbar>
            }
            <ng-content />
        </div>

        @if (footerCount()) {
            <div class="cms-list-page__footer">{{ footerCount() }}</div>
        }
    `,
    styles: [`
        :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }

        /* The body owns the header↔content spacing so every list page gets
           the same gap whether or not it has an action bar. When the action
           bar is present it provides its own margin-bottom before the grid;
           when absent, the grid sits one gap below the header's bottom
           border. 8px matches the mature cms-list-layout pages. */
        .cms-list-page__body {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
            padding-top: 8px;
        }

        /* Footer bar — mirrors cms-page-footer's chrome so a migrated page's
           count strip looks identical. Only rendered when footerCount is set. */
        .cms-list-page__footer {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            padding: 6px 20px;
            min-height: 28px;
            border-top: 1px solid var(--cms-border);
            background: var(--cms-surface);
            font-size: .8125rem;
            color: var(--cms-text-secondary);
        }
    `],
})
export class CmsListPageComponent {
    /** Page title shown in the header (required). */
    readonly title = input.required<string>();
    /** Bootstrap Icons name WITHOUT the `bi-` prefix (e.g. 'speedometer2'). */
    readonly icon = input<string>('');
    /** Optional one-line page subtitle under the title. */
    readonly subtitle = input<string>('');

    /**
     * Optional footer-bar text (e.g. "12 calendars"). When non-empty a thin
     * bottom bar renders with this label — replaces the per-page
     * `PageFooterService` count the mature `cms-list-layout` pages used. Leave
     * blank to omit the footer entirely (the self-contained pages had none).
     */
    readonly footerCount = input<string>('');

    /**
     * Header action buttons supplied directly by the page (the simple path).
     * Merged with any navi-tree header-positioned actions when a
     * `toolbarTreeSlug` is also set.
     */
    readonly actions = input<ToolbarAction[]>([]);

    /**
     * When set, renders the navi-driven action bar from this toolbar tree
     * (e.g. 'navi.toolbar.calendar.calendars') and lifts its header-position
     * actions into the page-header automatically.
     */
    readonly toolbarTreeSlug = input<string | null>(null);
    /** `showWhen`/`activeWhen` evaluation context for the toolbar tree. */
    readonly toolbarContext = input<Record<string, unknown>>({});
    /** Direct action-bar buttons (used instead of, or alongside, a tree). */
    readonly toolbarLeftActions = input<ToolbarAction[]>([]);
    readonly toolbarRightActions = input<ToolbarAction[]>([]);

    /** Unified click stream for header buttons AND action-bar buttons. */
    readonly actionClick = output<string>();

    /** Navi-tree header-position actions, captured from the action bar. */
    protected readonly naviHeaderActions = signal<ToolbarAction[]>([]);

    /** Header buttons = direct `actions` ∪ navi-tree header actions (deduped by id). */
    protected readonly resolvedHeaderActions = computed<ToolbarAction[]>(() => {
        const direct = this.actions();
        const navi = this.naviHeaderActions();
        if (navi.length === 0) return direct;
        const seen = new Set(direct.map(a => a.id));
        return [...direct, ...navi.filter(a => !seen.has(a.id))];
    });

    /** True when the action-bar row should render at all. */
    protected readonly showToolbar = computed(() =>
        this.toolbarTreeSlug() !== null
        || this.toolbarLeftActions().length > 0
        || this.toolbarRightActions().length > 0,
    );
}
