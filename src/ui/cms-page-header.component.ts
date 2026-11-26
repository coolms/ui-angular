import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    input,
    output,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { ToolbarAction } from './page-toolbar.component';
import { CmsSectionActionsComponent, type SectionHeadAction, type SectionHeadPrimary } from './section-head/cms-section-actions.component';
import { SectionRowFit } from './section-head/section-fit';

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
 * A page's header: a full-width band with the icon and title (and an optional subtitle, the section header's
 * description) on the left, and on the right the page's projected status controls, its one primary action (filled) and
 * More holding its other actions. One line at every width, by the section header's rule (section-fit); the projected
 * meta and controls keep their size.
 */
@Component({
    selector: 'cms-page-header',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgClass, CmsSectionActionsComponent],
    providers: [SectionRowFit],
    template: `
        <div class="page-header" [class.page-header--with-subtitle]="!!subtitle()" data-section-row data-fit="0">
            <div class="page-header__main">
                <div class="page-header__title">
                    @if (icon()) {
                        <i class="bi" [ngClass]="'bi-' + icon()" aria-hidden="true"></i>
                    }
                    <h1 class="cms-page-title" data-section-title [attr.title]="title()">{{ title() }}</h1>
                    <!-- Title-adjacent meta (chips, badges), beside the title. -->
                    <div class="page-header__meta" data-section-meta><ng-content select="[header-meta]" /></div>
                </div>
                <!-- An optional one-line page description beside the title: whole, or not drawn. -->
                @if (subtitle()) {
                    <div class="page-header__subtitle" data-section-description>{{ subtitle() }}</div>
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
            position: relative;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 0 20px;
            min-height: 52px;
            border-bottom: 1px solid var(--cms-border);
            background: var(--cms-surface);
            flex-shrink: 0;
            white-space: nowrap;
        }

        .page-header__main {
            display: flex;
            align-items: baseline;
            gap: 14px;
            flex: 1 1 auto;
            min-width: 0;
        }

        .page-header__title {
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 0 1 auto;
            min-width: 0;

            .bi { font-size: 1.25rem; color: var(--cms-text-secondary); }
        }
        .page-header__title > .bi { flex: none; }

        /* Block, not the global flex: an ellipsis is drawn only by a block that holds the text itself. */
        .cms-page-title {
            display: block;
            margin: 0;
            flex: 0 1 auto;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 1.125rem;
            font-weight: 600;
            color: var(--cms-text);
        }

        .page-header__meta { display: flex; align-items: center; gap: 10px; flex: none; }
        .page-header__meta:empty { display: none; }

        /* After a dot, so it reads as beside the title and second to it. */
        .page-header__subtitle {
            position: relative;
            flex: 0 1 auto;
            min-width: 0;
            padding-left: 14px;
            overflow: hidden;
            color: var(--cms-text-muted, #4b5563);
            font-size: .8125rem;
            line-height: 1.35;
        }
        .page-header__subtitle::before {
            content: '·';
            position: absolute;
            left: 0;
            opacity: .6;
        }
        /* With the title held at its least, what the title's line holds is no longer squeezed out of sight: the row
           measures it, and the chips are cut instead. */
        .page-header[data-fit='5'] .page-header__main,
        .page-header[data-fit='5'] .page-header__title { min-width: auto; }

        /* Whole or not drawn; not drawn, it is still read. */
        .page-header:not([data-fit='0']) .page-header__subtitle {
            position: absolute;
            clip: rect(0 0 0 0);
            width: 1px;
            height: 1px;
            padding: 0;
        }

        /* A chip the page says elsewhere gives way before the title is cut; any other keeps its size. */
        .page-header:is([data-fit='2'], [data-fit='3'], [data-fit='4'], [data-fit='5']) ::ng-deep [data-said-elsewhere] { display: none; }

        .page-header__actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: none;
            margin-inline-start: auto;
        }
    `],
})
export class CmsPageHeaderComponent {
    readonly title       = input.required<string>();
    readonly icon        = input<string>('');
    /** An optional one-line description of the page, beside the title: drawn whole, or not at all. */
    readonly subtitle    = input<string>('');
    readonly actions     = input<ToolbarAction[]>([]);
    /** More's accessible name and tooltip, from the host's catalogue. */
    readonly moreLabel   = input<string>('More actions');
    readonly actionClick = output<string>();

    protected readonly fit = inject(SectionRowFit);
    protected readonly split = computed(() => sectionActionsOf(this.actions()));
}
