import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { StateComponent } from './state.component';

/**
 * A read in progress, said in words: the state component's loading state ({@link StateComponent}), kept under its
 * old name so every `<app-loading label="..." />` draws it -- the spinner from the tokens, seen only after the delay,
 * its words live from the start. Superseded by `<cms-state kind="loading">`; it goes once nothing names it.
 */
@Component({
    selector: 'app-loading',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [StateComponent],
    template: `<cms-state kind="loading" [title]="label()" />`,
})
export class LoadingComponent {
    readonly label = input<string>('Loading…');
}
