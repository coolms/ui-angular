import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

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
 * UI-polish — shared underline tab strip for list pages that bucket their
 * rows (Inbox My/Claimable/Recent, Leads New/Handled/Spam, Newsletter
 * Confirmed/Pending/Unsubscribed). Replaces three near-identical hand-rolled
 * strips — including Inbox's inline-styled one — with one token-styled,
 * ARIA-correct (`role="tablist"` / `role="tab"`) component.
 *
 * Bucket selection is owned by the host (it drives the grid + URL); this is a
 * pure presentational control: it renders `tabs`, highlights `activeId`, and
 * emits `select` on click.
 *
 * Usage:
 *   <app-tab-strip [tabs]="TABS" [activeId]="tab()" (selected)="switchTab($any($event))" />
 */
@Component({
    selector: 'app-tab-strip',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <nav class="cms-tab-strip" role="tablist">
            @for (t of tabs(); track t.id) {
                <button type="button" role="tab"
                        class="cms-tab-strip__tab"
                        [class.cms-tab-strip__tab--active]="t.id === activeId()"
                        [attr.aria-selected]="t.id === activeId()"
                        (click)="selected.emit(t.id)">
                    @if (t.icon) {
                        <i class="bi bi-{{ t.icon }}" aria-hidden="true"></i>
                    }
                    <span>{{ t.label }}</span>
                </button>
            }
        </nav>
    `,
    styles: [`
        .cms-tab-strip {
            display: flex;
            flex-shrink: 0;
            gap: 0.25rem;
            border-bottom: 1px solid var(--cms-border, #e5e7eb);
            margin-bottom: 0.5rem;
        }
        .cms-tab-strip__tab {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.5rem 0.9rem;
            border: 0;
            background: transparent;
            color: var(--cms-text-muted, #6b7280);
            border-bottom: 2px solid transparent;
            cursor: pointer;
            font: inherit;
        }
        .cms-tab-strip__tab--active {
            color: var(--cms-text, #111827);
            border-bottom-color: var(--cms-primary, #2563eb);
            font-weight: 600;
        }
    `],
})
export class TabStripComponent {
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
}
