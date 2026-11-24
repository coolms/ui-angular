import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    output,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { ToolbarAction } from './page-toolbar.component';
import { CmsSectionActionsComponent, type SectionHeadAction, type SectionHeadPrimary } from './section-head/cms-section-actions.component';

/** A page's actions as the section head takes them: the first primary one shown, every other one under More; a title node none. */
export function sectionActionsOf(actions: readonly ToolbarAction[]): { primary: SectionHeadPrimary | null; more: SectionHeadAction[] } {
    // A tree's title node (meta.action title) names the section; it is not an action.
    const drawn = actions.filter((a) => !a.hidden && !a.divider && a.id !== 'title');
    const first = drawn.find((a) => a.primary === true) ?? null;
    const as = (a: ToolbarAction): SectionHeadAction => ({
        id: a.id,
        label: a.label || a.title || a.id,
        icon: a.icon,
        danger: a.danger ?? false,
        disabled: a.disabled ?? false,
        ...(a.disabled && a.refusal ? { reason: a.refusal } : {}),
        locked: a.locked ?? false,
    });

    return { primary: first === null ? null : as(first), more: drawn.filter((a) => a !== first).map(as) };
}

/**
 * A page's header: a full-width band with the icon and title (and an optional subtitle) on the left, and on the
 * right the page's projected status controls, its one primary action (filled) and More holding its other actions.
 */
@Component({
    selector: 'cms-page-header',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgClass, CmsSectionActionsComponent],
    template: `
        <div class="page-header" [class.page-header--with-subtitle]="!!subtitle()">
            <div class="page-header__main">
                <div class="page-header__title">
                    @if (icon()) {
                        <i class="bi" [ngClass]="'bi-' + icon()"></i>
                    }
                    <h1 class="cms-page-title">{{ title() }}</h1>
                    <!-- Title-adjacent meta (chips, badges), on the title's baseline. -->
                    <ng-content select="[header-meta]" />
                </div>
                <!-- An optional one-line page description under the title, beside it from 720px. -->
                @if (subtitle()) {
                    <div class="page-header__subtitle">{{ subtitle() }}</div>
                }
            </div>
            <div class="page-header__actions">
                <!-- Status controls (an online pill, a save button of the page's own), before the actions. -->
                <ng-content select="[header-actions]" />
                <cms-section-actions [primary]="split().primary" [more]="split().more" [moreLabel]="moreLabel()"
                                     (action)="actionClick.emit($event)" />
            </div>
        </div>
    `,
    styles: [`
        :host { display: block; }

        .page-header {
            /* container-type makes the @container queries below resolve
               against the page-header's own inline-size, not the
               viewport. This way the inline-mode switch happens when
               there's genuinely enough header width -- correct whether
               the right drawer is open, the sidebar is collapsed, or
               the user resizes the window. */
            container-type: inline-size;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            min-height: 52px;
            border-bottom: 1px solid var(--cms-border);
            background: var(--cms-surface);
            flex-shrink: 0;
        }
        /* With a subtitle, the header grows to fit two rows. Switch
           cross-axis alignment to flex-start so the title row sits
           where it does in the no-subtitle case (subtitle stacks under
           it), and pad top/bottom symmetrically so the block looks
           deliberate rather than crammed. */
        .page-header--with-subtitle {
            align-items: flex-start;
            padding-top: 10px;
            padding-bottom: 10px;
        }

        .page-header__main {
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
        }

        .page-header__title {
            display: flex;
            align-items: center;
            gap: 10px;

            .bi { font-size: 1.25rem; color: var(--cms-text-secondary); }
        }

        .cms-page-title {
            margin: 0;
            font-size: 1.125rem;
            font-weight: 600;
            color: var(--cms-text);
        }

        .page-header__subtitle {
            color: var(--cms-text-muted, #4b5563);
            font-size: .8125rem;
            line-height: 1.35;
        }

        .page-header__actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        /* Pin actions to the title baseline (not the centre of the
           two-row block) when a subtitle is shown. */
        .page-header--with-subtitle .page-header__actions {
            margin-top: 2px;
        }

        /* When the page-header has at least 720px of inline-size,
           collapse the two-row layout back into a single row: title
           and subtitle sit side-by-side separated by a soft divider.
           This is the wide-monitor default; narrow viewports / open
           drawers fall back to the stacked layout automatically. */
        /* On a phone the actions take their own row: beside a title they cover it. */
        @media (max-width: 768px) {
            .page-header { flex-wrap: wrap; }
            .page-header__main { flex: 1 1 100%; }
            .page-header__actions { flex-wrap: wrap; }
        }
        @container (min-width: 720px) {
            .page-header--with-subtitle {
                align-items: center;
                padding-top: 0;
                padding-bottom: 0;
            }
            .page-header--with-subtitle .page-header__main {
                flex-direction: row;
                align-items: baseline;
                gap: 14px;
                /* Allow the subtitle to truncate with ellipsis if a
                   pathological viewport width occurs between the
                   container threshold and the natural title width. */
                overflow: hidden;
            }
            .page-header--with-subtitle .page-header__subtitle {
                /* Soft visual divider before the subtitle so it reads
                   as related-but-secondary. The dot avoids the heavy
                   look of a pipe or border-left and reads as muted
                   typography by default. */
                position: relative;
                padding-left: 14px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .page-header--with-subtitle .page-header__subtitle::before {
                content: '·';
                position: absolute;
                left: 0;
                opacity: .6;
            }
            .page-header--with-subtitle .page-header__actions {
                margin-top: 0;
            }
        }
    `],
})
export class CmsPageHeaderComponent {
    readonly title       = input.required<string>();
    readonly icon        = input<string>('');
    /** An optional one-line description of the page, under the title (beside it on a wide header). */
    readonly subtitle    = input<string>('');
    readonly actions     = input<ToolbarAction[]>([]);
    /** More's accessible name and tooltip, from the host's catalogue. */
    readonly moreLabel   = input<string>('More actions');
    readonly actionClick = output<string>();

    protected readonly split = computed(() => sectionActionsOf(this.actions()));
}
