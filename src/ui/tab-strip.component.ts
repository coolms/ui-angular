import {
    type AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    HostListener,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';

/** One tab in an {@link TabStripComponent}. */
export interface TabStripItem {
    /** Stable id emitted on click + compared against `activeId`. */
    readonly id: string;
    /** Visible label. */
    readonly label: string;
    /** Optional Bootstrap icon name, WITHOUT the `bi-` prefix (e.g. `inbox`). */
    readonly icon?: string;
}

/**
 * UI-polish -- shared underline tab strip for list pages that bucket their
 * rows (Inbox My/Claimable/Recent, Leads New/Handled/Spam, Newsletter
 * Confirmed/Pending/Unsubscribed) and for the profile page's sections.
 * Replaces the hand-rolled strips with one token-styled, ARIA-correct
 * (`role="tablist"` / `role="tab"`) component.
 *
 * Bucket selection is owned by the host (it drives the grid + URL); this is a
 * pure presentational control: it renders `tabs`, highlights `activeId`, and
 * emits `selected` on click.
 *
 * **Overflow.** The strip is one row. Tabs that do not fit its width go
 * behind a "more" button (three vertical dots) at the right end, in a menu;
 * picking one selects it. The active tab is always in the row: when the
 * host activates a tab that did not fit, it takes the place of the last
 * visible one, which moves to the menu. Fit is measured, not guessed --
 * every tab keeps its natural width (the hidden ones are taken out of the
 * flow, invisible, so they can still be measured), and a `ResizeObserver`
 * re-fits on every width change. Before the first measurement every tab is
 * visible, so a strip that fits never flickers. Two rows were the previous
 * answer (2026-09-21) and looked wrong; a strip that scrolls the page's body
 * sideways was the one before that.
 *
 * Usage:
 *   <app-tab-strip [tabs]="TABS" [activeId]="tab()" (selected)="switchTab($any($event))" />
 */
@Component({
    selector: 'app-tab-strip',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <nav class="cms-tab-strip" role="tablist" #strip>
            @for (t of tabs(); track t.id) {
                <button type="button" role="tab"
                        class="cms-tab-strip__tab"
                        [class.cms-tab-strip__tab--active]="t.id === activeId()"
                        [class.cms-tab-strip__tab--overflow]="isOverflow(t.id)"
                        [attr.aria-selected]="t.id === activeId()"
                        [attr.aria-hidden]="isOverflow(t.id) || null"
                        [attr.tabindex]="isOverflow(t.id) ? -1 : null"
                        [attr.data-tab]="t.id"
                        (click)="selected.emit(t.id)">
                    @if (t.icon) {
                        <i class="bi bi-{{ t.icon }}" aria-hidden="true"></i>
                    }
                    <span>{{ t.label }}</span>
                </button>
            }
            <div class="cms-tab-strip__more" [class.cms-tab-strip__more--shown]="overflow().length > 0" #more>
                <button type="button" class="cms-tab-strip__more-btn"
                        aria-haspopup="menu" aria-label="More tabs" title="More tabs"
                        [attr.aria-expanded]="menuOpen()"
                        [attr.tabindex]="overflow().length ? null : -1"
                        (click)="menuOpen.set(!menuOpen())">
                    <i class="bi bi-three-dots-vertical" aria-hidden="true"></i>
                </button>
            </div>
        </nav>
        <!-- Outside the nav: the nav clips its overflow, and the menu hangs below it. -->
        @if (menuOpen() && overflow().length) {
            <div class="cms-tab-strip__menu" role="menu">
                @for (t of overflow(); track t.id) {
                    <button type="button" role="menuitem"
                            class="cms-tab-strip__menu-item"
                            [class.cms-tab-strip__menu-item--active]="t.id === activeId()"
                            [attr.data-tab]="t.id"
                            (click)="pick(t.id)">
                        @if (t.icon) {
                            <i class="bi bi-{{ t.icon }}" aria-hidden="true"></i>
                        }
                        <span>{{ t.label }}</span>
                    </button>
                }
            </div>
        }
    `,
    styles: [`
        :host { display: block; position: relative; }
        .cms-tab-strip {
            position: relative;
            display: flex;
            flex-wrap: nowrap;
            flex-shrink: 0;
            align-items: stretch;
            gap: 0.25rem;
            margin-bottom: 0.5rem;
            overflow: hidden;
        }
        /* The strip's rule, drawn inside the box (not as a border) so the
           active tab's underline can sit ON it rather than above it; the
           nav clips its overflow, which a border-overlapping negative margin
           would fall victim to. */
        .cms-tab-strip::after {
            content: '';
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            height: 1px;
            background: var(--cms-border, #e5e7eb);
        }
        .cms-tab-strip__tab {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.5rem 0.9rem;
            border: 0;
            background: transparent;
            color: var(--cms-text-muted, #848b96);
            border-bottom: 2px solid transparent;
            cursor: pointer;
            font: inherit;
            white-space: nowrap;
            flex-shrink: 0;
        }
        /* The selected-item token, as on every "you are here" mark in the
           admin (the sidebar's active item, the picked card), not the blue
           --cms-primary: an amber page with one blue underline read as a
           foreign control (Dmitry, 2026-09-21). The token is the accent
           today; it is named by meaning so the theme decides. */
        .cms-tab-strip__tab--active {
            position: relative;
            z-index: 1;
            color: var(--cms-text, #111827);
            border-bottom-color: var(--cms-selected);
            font-weight: 600;
        }
        /* Out of the flow and invisible, but still laid out at its natural
           width so the next fit can measure it. */
        .cms-tab-strip__tab--overflow {
            position: absolute;
            top: 0;
            left: 0;
            visibility: hidden;
            pointer-events: none;
        }
        .cms-tab-strip__more {
            position: relative;
            margin-left: auto;
            display: none;
            align-items: center;
            flex-shrink: 0;
        }
        .cms-tab-strip__more--shown { display: flex; }
        .cms-tab-strip__more-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 2rem;
            height: 2rem;
            padding: 0;
            border: 0;
            border-radius: var(--cms-radius, 6px);
            background: transparent;
            color: var(--cms-text-muted, #848b96);
            cursor: pointer;
            font: inherit;
        }
        .cms-tab-strip__more-btn:hover,
        .cms-tab-strip__more-btn[aria-expanded="true"] {
            background: var(--cms-surface-hover, #f3f4f6);
            color: var(--cms-text, #111827);
        }
        .cms-tab-strip__menu {
            position: absolute;
            top: calc(100% + 4px);
            right: 0;
            z-index: 1050;
            min-width: 180px;
            padding: 0.25rem 0;
            background: var(--cms-surface, #ffffff);
            color: var(--cms-text, #111827);
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius-md, 8px);
            box-shadow: var(--cms-shadow-md, 0 4px 12px rgba(0,0,0,.10));
        }
        .cms-tab-strip__menu-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            width: 100%;
            padding: 0.45rem 0.9rem;
            border: 0;
            background: transparent;
            color: inherit;
            cursor: pointer;
            font: inherit;
            text-align: left;
            white-space: nowrap;
        }
        .cms-tab-strip__menu-item:hover { background: var(--cms-surface-hover, #f3f4f6); }
        .cms-tab-strip__menu-item--active { font-weight: 600; }
    `],
})
export class TabStripComponent implements AfterViewInit {
    /** Tabs to render, in order. */
    readonly tabs = input.required<ReadonlyArray<TabStripItem>>();
    /** Id of the currently-active tab (highlighted). */
    readonly activeId = input.required<string>();
    /**
     * Emitted with the clicked tab's id.
     *
     * `selected`, not `select`: an output named after a native DOM event is
     * ambiguous in a template -- `(select)` could bind either, and which one
     * wins is not something the reader of the template can see.
     */
    readonly selected = output<string>();

    /** The tabs that did not fit, in strip order; empty until a fit says otherwise. */
    readonly overflow = signal<ReadonlyArray<TabStripItem>>([]);
    readonly menuOpen = signal(false);

    private readonly strip = viewChild.required<ElementRef<HTMLElement>>('strip');
    private readonly more  = viewChild.required<ElementRef<HTMLElement>>('more');
    private readonly host  = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly destroyRef = inject(DestroyRef);
    private readonly overflowIds = computed(() => new Set(this.overflow().map(t => t.id)));

    constructor() {
        // A new tab list or a new active tab changes what fits; refit after
        // the view has rendered the change.
        effect(() => {
            this.tabs();
            this.activeId();
            queueMicrotask(() => this.fit());
        });
    }

    ngAfterViewInit(): void {
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => this.fit());
        ro.observe(this.strip().nativeElement);
        this.destroyRef.onDestroy(() => ro.disconnect());
    }

    isOverflow(id: string): boolean {
        return this.overflowIds().has(id);
    }

    pick(id: string): void {
        this.menuOpen.set(false);
        this.selected.emit(id);
    }

    @HostListener('document:click', ['$event.target'])
    onDocumentClick(target: EventTarget | null): void {
        if (this.menuOpen() && !(target instanceof Node && this.host.nativeElement.contains(target))) {
            this.menuOpen.set(false);
        }
    }

    @HostListener('document:keydown.escape')
    onEscape(): void {
        this.menuOpen.set(false);
    }

    /**
     * Measure, then decide. Widths come from the DOM (every tab is laid out,
     * the overflowed ones out of flow), the budget is the strip's width less
     * the more-button's when one is needed; the first tabs that fit stay,
     * the active tab is kept in the row by swapping with the last one that
     * fits, and the rest go to the menu.
     */
    private fit(): void {
        const stripEl = this.strip().nativeElement;
        const width = stripEl.clientWidth;
        if (width === 0) return; // not laid out (hidden host, or a test without layout)

        const items = this.tabs();
        const buttons = Array.from(stripEl.querySelectorAll<HTMLElement>('.cms-tab-strip__tab'));
        if (buttons.length !== items.length) return; // the view is between renders; the effect will call again
        const gap = parseFloat(getComputedStyle(stripEl).columnGap) || 0;
        const widths = buttons.map(b => b.offsetWidth);
        const total = widths.reduce((s, w, i) => s + w + (i ? gap : 0), 0);

        if (total <= width) {
            if (this.overflow().length) this.overflow.set([]);
            return;
        }

        const moreWidth = this.moreButtonWidth();
        const budget = width - moreWidth - gap;
        let fitCount = 0;
        let used = 0;
        for (let i = 0; i < widths.length; i++) {
            const next = used + widths[i] + (i ? gap : 0);
            if (next > budget) break;
            used = next;
            fitCount = i + 1;
        }

        const visible = items.slice(0, fitCount).map(t => t.id);
        const activeIdx = items.findIndex(t => t.id === this.activeId());
        if (activeIdx >= fitCount && fitCount > 0) {
            // The active tab takes the last visible place; that tab goes to the menu.
            visible[fitCount - 1] = items[activeIdx].id;
        }
        const visibleSet = new Set(visible);
        const next = items.filter(t => !visibleSet.has(t.id));
        const prev = this.overflow();
        if (prev.length === next.length && prev.every((t, i) => t.id === next[i].id)) return;
        this.overflow.set(next);
    }

    private moreButtonWidth(): number {
        const el = this.more().nativeElement;
        if (el.offsetWidth) return el.offsetWidth;
        // Not shown yet: measure it shown, then put it back.
        el.classList.add('cms-tab-strip__more--shown');
        const w = el.offsetWidth;
        el.classList.remove('cms-tab-strip__more--shown');
        return w;
    }
}
