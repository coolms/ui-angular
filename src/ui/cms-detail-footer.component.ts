import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ToolbarAction } from './page-toolbar.component';

/**
 * Fixed bottom action bar for detail pages.
 *
 * Renders a right-aligned row of {@link ToolbarAction} buttons (primary /
 * danger / disabled honoured, optional `divider`) pinned to the bottom of the
 * page. The host page keeps **navigation** in its header and moves its
 * **primary / steering / destructive** actions here, so a cramped header isn't
 * overloaded next to a long title.
 *
 * **Layout contract:** drop this as a sibling of the page's inner scroller
 * inside a flex-column `:host` (the scroller is `flex:1; min-height:0;
 * overflow-y:auto`). The footer is `flex-shrink:0`, so it stays pinned while
 * the content scrolls above it. Renders nothing when there are no visible
 * actions (so terminal/empty states show no bar).
 *
 * Stateless: the host owns the action lifecycle + binds `(actionClick)` (emits
 * the clicked action's `id`). Buttons use the global `cms-btn*` classes.
 */
@Component({
    selector: 'cms-detail-footer',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (visibleActions().length > 0) {
            <footer class="cms-detail-footer">
                @for (a of visibleActions(); track a.id) {
                    @if (a.divider) {
                        <div class="cms-detail-footer__sep"></div>
                    } @else {
                        <button
                            type="button"
                            class="cms-btn cms-btn-sm"
                            [class.cms-btn-primary]="a.primary"
                            [class.cms-btn-danger]="a.danger"
                            [disabled]="a.disabled ?? false"
                            [title]="a.title ?? a.label ?? ''"
                            (click)="actionClick.emit(a.id)"
                        >
                            @if (a.icon) {
                                <i class="bi bi-{{ a.icon }}" aria-hidden="true"></i>
                            }
                            @if (a.label) {
                                <span>{{ a.label }}</span>
                            }
                        </button>
                    }
                }
            </footer>
        }
    `,
    styles: [`
        .cms-detail-footer {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            padding: 10px 16px;
            border-top: 1px solid var(--cms-border, #e5e7eb);
            background: var(--cms-surface, #fff);
            flex-shrink: 0;
        }
        .cms-detail-footer .bi { font-size: .875rem; line-height: 1; }
        .cms-detail-footer__sep {
            width: 1px;
            height: 20px;
            background: var(--cms-border, #e5e7eb);
            margin: 0 2px;
        }
    `],
})
export class CmsDetailFooterComponent {
    /** Actions to render, right-aligned. Hidden entries are filtered out. */
    readonly actions = input<ToolbarAction[]>([]);
    /** Emits the clicked action's `id`. */
    readonly actionClick = output<string>();

    protected readonly visibleActions = computed(() =>
        this.actions().filter((a) => !a.hidden),
    );
}
