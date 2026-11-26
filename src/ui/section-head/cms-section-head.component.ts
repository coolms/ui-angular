import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CmsSectionActionsComponent, type SectionHeadAction, type SectionHeadPrimary } from './cms-section-actions.component';
import { SectionRowFit } from './section-fit';

export type { SectionHeadAction, SectionHeadPrimary } from './cms-section-actions.component';

/**
 * The components contract's section-header, in this kit cms-section-head (cms-section-header is the group heading):
 * the head of a section from tablet width up. Row 1: the declared title, its description, then the primary action
 * and More (the section's other actions) at the end, on one line at every width (section-fit). Row 2: the section's context, projected
 * through [section-context], drawn only when something is projected. No divider lines. fullWidth spans a one-column
 * page. Below tablet width the host draws the screen shell instead.
 */
@Component({
    selector: 'cms-section-head',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CmsSectionActionsComponent],
    providers: [SectionRowFit],
    template: `
        <header class="cms-section-head" [class.cms-section-head--full]="fullWidth()">
            <div class="cms-section-head__row" data-row="1" data-section-row data-fit="0">
                @if (icon()) {
                    <i [class]="'cms-section-head__icon bi bi-' + icon()" aria-hidden="true"></i>
                }
                <h1 class="cms-section-head__title" data-section-title [attr.title]="title()">{{ title() }}</h1>
                <div class="cms-section-head__meta" data-section-meta><ng-content select="[section-meta]" /></div>
                @if (description()) {
                    <div class="cms-section-head__description" data-section-description>{{ description() }}</div>
                }
                <div class="cms-section-head__actions">
                    <ng-content select="[section-actions]" />
                    <cms-section-actions [primary]="primary()" [more]="more()" [moreLabel]="moreLabel()"
                                         (action)="action.emit($event)" />
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
            position: relative;
            height: var(--cms-pane-toolbar-height);
            min-width: 0;
            white-space: nowrap;
        }
        .cms-section-head__icon { font-size: 1.25rem; color: var(--cms-text-secondary); flex: none; }
        .cms-section-head__title {
            margin: 0;
            flex: 0 1 auto;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: var(--cms-font-size-title-md, 1.125rem);
            font-weight: 600;
            color: var(--cms-text);
        }
        .cms-section-head__meta { display: flex; align-items: center; gap: var(--cms-space-2, 8px); flex: none; }
        .cms-section-head__meta:empty { display: none; }
        .cms-section-head__description {
            flex: 0 1 auto;
            min-width: 0;
            overflow: hidden;
            font-size: .8125rem;
            color: var(--cms-text-muted);
        }
        /* Whole or not drawn; not drawn, it is still read. */
        .cms-section-head__row:not([data-fit='0']) .cms-section-head__description {
            position: absolute;
            clip: rect(0 0 0 0);
            width: 1px;
            height: 1px;
        }
        /* A chip the page says elsewhere gives way before the title is cut; any other keeps its size. */
        .cms-section-head__row:is([data-fit='2'], [data-fit='3'], [data-fit='4'], [data-fit='5']) ::ng-deep [data-said-elsewhere] { display: none; }
        .cms-section-head__actions { display: flex; align-items: center; gap: var(--cms-space-1, 4px); flex: none; margin-inline-start: auto; }
        .cms-section-head__context { display: flex; align-items: center; min-width: 0; height: var(--cms-pane-header-height); }
        .cms-section-head__context:empty { display: none; }
    `],
})
export class CmsSectionHeadComponent {
    readonly title = input.required<string>();
    /** One line after the title saying what the section is for: drawn whole, or not at all. */
    readonly description = input<string>('');
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

    protected readonly fit = inject(SectionRowFit);
}
