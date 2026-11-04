import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { StateComponent } from './state.component';

/**
 * Nothing to show, and why: the state component's empty state ({@link StateComponent}), kept under its old name so
 * every `<app-empty-state title="..." hint="...">` draws it, its hint the description. What a page projects (a button
 * to add the first one) follows it. One icon per kind, as the state contract has it: `icon` is still accepted and no
 * longer drawn. Superseded by `<cms-state kind="empty">`; it goes once nothing names it.
 */
@Component({
    selector: 'app-empty-state',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [StateComponent],
    template: `
        <cms-state kind="empty" [title]="title()" [description]="hint()" />
        <ng-content />
    `,
    styles: [`
        :host { display: flex; flex-direction: column; align-items: center; }
    `],
})
export class EmptyStateComponent {
    /** No longer drawn: the state's icon is its kind's. Kept so the pages that pass one still compile. */
    readonly icon = input<string>('inbox');
    readonly title = input<string>('Nothing here yet');
    readonly hint = input<string>('');
}
