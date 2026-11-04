import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RELOAD_PAGE } from './reload-page';
import { StateComponent } from './state.component';

/**
 * What a page or section shows in place of its content when the server refused to load it for want
 * of elevation: a stamped 403 ({@link isElevationRefusal} in core). Never an empty page. It is the state
 * component's elevation state ({@link StateComponent}), with its Elevate flow, kept under its old name.
 *
 * The elevation prompt opens only from the Elevate button here -- the person's explicit request.
 * `elevated` is emitted once the session is elevated, from this prompt or from one already granted
 * elsewhere (another tab), and the host loads its content again.
 *
 * Usage:
 *   <cms-elevation-required (elevated)="reload()" />
 */
@Component({
    selector: 'cms-elevation-required',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [StateComponent],
    // The host loads its content again on `elevated`, as this component has always promised: the state inside is
    // given no page to reload, so it tells this component, and this component tells its host.
    providers: [{ provide: RELOAD_PAGE, useValue: null }],
    template: `
        <cms-state kind="elevation-required" [title]="title()" [description]="hint()" (elevated)="elevated.emit()" />
    `,
})
export class ElevationRequiredComponent {
    readonly title = input<string>('This section needs an elevated session');
    readonly hint  = input<string>('Elevate this session to work here. Your password is asked once, and the session stays elevated for a limited time.');

    /** The session is elevated: load the content again. */
    readonly elevated = output<void>();
}
