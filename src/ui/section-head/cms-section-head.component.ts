import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CmsSectionActionsComponent, type SectionHeadAction, type SectionHeadPrimary } from './cms-section-actions.component';

export type { SectionHeadAction, SectionHeadPrimary } from './cms-section-actions.component';

/**
 * The components contract's section-header, in this kit cms-section-head (cms-section-header is the group heading):
 * the head of a section from tablet width up. Row 1: the declared title, then the primary action and More (the
 * section's other actions) at the end. Row 2: the section's context, projected
 * through [section-context], drawn only when something is projected. No divider lines. fullWidth spans a one-column
 * page. Below tablet width the host draws the screen shell instead.
 */
@Component({
    selector: 'cms-section-head',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CmsSectionActionsComponent],
    template: `
        <header class="cms-section-head" [class.cms-section-head--full]="fullWidth()">
            <div class="cms-section-head__row" data-row="1">
                @if (icon()) {
                    <i [class]="'cms-section-head__icon bi bi-' + icon()" aria-hidden="true"></i>
                }
                <h1 class="cms-section-head__title" [attr.title]="title()">{{ title() }}</h1>
                <ng-content select="[section-meta]" />
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
            height: var(--cms-pane-toolbar-height);
            min-width: 0;
            white-space: nowrap;
        }
        .cms-section-head__icon { font-size: 1.25rem; color: var(--cms-text-secondary); flex: none; }
        .cms-section-head__title {
            margin: 0;
            flex: 1 1 auto;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: var(--cms-font-size-title-md, 1.125rem);
            font-weight: 600;
            color: var(--cms-text);
        }
        .cms-section-head__actions { display: flex; align-items: center; gap: var(--cms-space-1, 4px); flex: none; }
        .cms-section-head__context { display: flex; align-items: center; min-width: 0; height: var(--cms-pane-header-height); }
        .cms-section-head__context:empty { display: none; }
    `],
})
export class CmsSectionHeadComponent {
    readonly title = input.required<string>();
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
}
