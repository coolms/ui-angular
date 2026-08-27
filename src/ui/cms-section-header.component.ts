import {
    ChangeDetectionStrategy,
    Component,
    input,
    output,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ToolbarAction } from './page-toolbar.component';

/**
 * A heading for a GROUP inside a page — one tier below `cms-page-header`.
 *
 * The admin had exactly two heading levels: the page header, and a bare
 * uppercase caption. A caption carries no icon, no actions and no count, so a
 * grouped page either shouted its group keys in caps or dropped the grouping
 * altogether. This is the missing tier: same anatomy as the page header —
 * icon, title, optional subtitle, right-aligned actions — at roughly two-thirds
 * the weight, with a rule under it so groups read as sections rather than as
 * loose headings.
 *
 * Actions reuse {@link ToolbarAction}, so a group's buttons are declared the
 * same way a page's are and a NaviGraph-driven toolbar could feed them later.
 *
 * Deliberately NOT a card: a group heading that draws a box around itself
 * competes with whatever the group contains, which is the thing worth looking
 * at.
 */
@Component({
    selector: 'cms-section-header',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgClass, RouterLink],
    template: `
        <div class="section-header"
             [class.section-header--with-subtitle]="!!subtitle()"
             [class.section-header--flush]="flush()">
            <div class="section-header__main">
                <div class="section-header__title">
                    @if (icon()) {
                        <i class="bi" [ngClass]="'bi-' + icon()"></i>
                    }
                    @if (titleLink(); as link) {
                        <!-- A group heading that names a THING the reader can go
                             look at should take them there. Still an h2: the
                             anchor is inside it, so the outline is unchanged. -->
                        <h2 class="section-header__text">
                            <a [routerLink]="link" class="section-header__link">{{ title() }}</a>
                        </h2>
                    } @else {
                        <h2 class="section-header__text">{{ title() }}</h2>
                    }
                    @if (badge()) {
                        <span class="section-header__badge">{{ badge() }}</span>
                    }
                    <ng-content select="[section-meta]" />
                </div>
                @if (subtitle()) {
                    <div class="section-header__subtitle">{{ subtitle() }}</div>
                }
            </div>

            <div class="section-header__actions">
                @for (action of actions(); track action.id) {
                    @if (!action.hidden && !action.divider) {
                        <button type="button"
                                class="cms-btn cms-btn-sm"
                                [class.cms-btn-primary]="action.primary"
                                [class.cms-btn-danger]="action.danger"
                                [disabled]="action.disabled ?? false"
                                [title]="action.title ?? action.label ?? ''"
                                (click)="actionClick.emit(action.id)">
                            <i class="bi" [ngClass]="'bi-' + action.icon"></i>
                            @if (action.label) {
                                <span>{{ action.label }}</span>
                            }
                        </button>
                    }
                }
                <ng-content select="[section-actions]" />
            </div>
        </div>
    `,
    styles: [`
        .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 0 0 6px;
            margin: 0 0 12px;
            border-bottom: 1px solid var(--cms-border);
        }
        .section-header--with-subtitle { align-items: flex-start; }

        /* The host draws the divider — a header strip whose rule spans the whole
           pane, not just the padded text. Two rules a few pixels apart is the
           tell that a component and its container both thought they owned it. */
        .section-header--flush { padding-bottom: 0; margin-bottom: 0; border-bottom: 0; }

        .section-header__main { min-width: 0; }

        .section-header__title {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
        }

        .section-header__title .bi {
            font-size: .9375rem;
            color: var(--cms-text-muted);
            line-height: 1;
        }

        .section-header__text {
            margin: 0;
            font-size: .9375rem;
            font-weight: 600;
            color: var(--cms-text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .section-header__link {
            color: inherit;
            text-decoration: none;
        }
        .section-header__link:hover { color: var(--cms-accent-text); text-decoration: underline; }
        .section-header__link:focus-visible { outline: 2px solid var(--cms-accent); outline-offset: 2px; }

        .section-header__badge {
            font-size: .6875rem;
            font-weight: 600;
            line-height: 1;
            padding: 3px 7px;
            border-radius: 999px;
            background: var(--cms-bg-muted);
            color: var(--cms-text-muted);
        }

        .section-header__subtitle {
            margin-top: 2px;
            font-size: .75rem;
            color: var(--cms-text-muted);
        }

        .section-header__actions {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
        }
    `],
})
export class CmsSectionHeaderComponent {
    /** Bootstrap Icons name without the bi- prefix. */
    readonly icon = input<string>('');
    readonly title = input.required<string>();
    /**
     * Router path the title links to, or null for plain text.
     *
     * For a group that names something with a page of its own — clicking the
     * heading should go to the thing, not just describe it.
     */
    readonly titleLink = input<string | null>(null);
    readonly subtitle = input<string>('');
    /** Small count or status pill beside the title, e.g. the number of items. */
    readonly badge = input<string>('');
    /**
     * Drop the component's own rule and bottom margin, because the host is a
     * header strip that draws its own full-width divider.
     */
    readonly flush = input<boolean>(false);
    readonly actions = input<ToolbarAction[]>([]);

    readonly actionClick = output<string>();
}
