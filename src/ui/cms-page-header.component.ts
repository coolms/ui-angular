import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    output,
} from '@angular/core';
import { ToolbarAction } from './page-toolbar.component';
import { CmsSectionHeadComponent, type SectionHeadAction, type SectionHeadPrimary } from './section-head/cms-section-head.component';

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
 * A one-column page's header: the components contract's section-header at full width (cms-section-head). The title
 * and the primary action on row 1 with the page's other actions under More; the subtitle, when given, on row 2.
 * [header-meta] sits beside the title and [header-actions] before the primary, as before.
 */
@Component({
    selector: 'cms-page-header',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CmsSectionHeadComponent],
    template: `
        <cms-section-head class="page-header" [title]="title()" [icon]="icon()" [fullWidth]="true"
                          [primary]="split().primary" [more]="split().more" [moreLabel]="moreLabel()"
                          (action)="actionClick.emit($event)">
            <ng-container ngProjectAs="[section-meta]"><ng-content select="[header-meta]" /></ng-container>
            <ng-container ngProjectAs="[section-actions]"><ng-content select="[header-actions]" /></ng-container>
            @if (subtitle()) {
                <div section-context class="page-header__subtitle">{{ subtitle() }}</div>
            }
        </cms-section-head>
    `,
    styles: [`
        :host { display: block; flex-shrink: 0; }
        .page-header__subtitle {
            color: var(--cms-text-muted, #4b5563);
            font-size: .8125rem;
            line-height: 1.35;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `],
})
export class CmsPageHeaderComponent {
    readonly title       = input.required<string>();
    readonly icon        = input<string>('');
    /** An optional one-line description of the page, on the header's second row. */
    readonly subtitle    = input<string>('');
    readonly actions     = input<ToolbarAction[]>([]);
    /** More's accessible name and tooltip, from the host's catalogue. */
    readonly moreLabel   = input<string>('More actions');
    readonly actionClick = output<string>();

    protected readonly split = computed(() => sectionActionsOf(this.actions()));
}
