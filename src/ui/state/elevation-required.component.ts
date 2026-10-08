import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { ElevationService } from '@coolms/core-angular';
import { EmptyStateComponent } from './empty-state.component';

/**
 * What a page or section shows in place of its content when the server refused to load it for want
 * of elevation: a stamped 403 ({@link isElevationRefusal} in core). Never an empty page.
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
    imports: [EmptyStateComponent],
    template: `
        <app-empty-state icon="shield-lock" [title]="title()" [hint]="hint()">
            <button type="button" class="cms-btn cms-btn-primary" data-test="elevate"
                    [disabled]="asking()" (click)="elevate()">
                Elevate
            </button>
            @if (unavailable()) {
                <p class="cms-elevation-required__unavailable" data-test="elevation-unavailable" role="status">
                    Elevation isn't available here. Ask an administrator.
                </p>
            }
        </app-empty-state>
    `,
})
export class ElevationRequiredComponent {
    readonly title = input<string>('This section needs an elevated session');
    readonly hint  = input<string>('Elevate this session to work here. Your password is asked once, and the session stays elevated for a limited time.');

    /** The session is elevated: load the content again. */
    readonly elevated = output<void>();

    private readonly elevation = inject(ElevationService);
    protected readonly asking = signal(false);
    /** The installation cannot elevate: the button opened nothing, and the person is told so. */
    protected readonly unavailable = signal(false);

    elevate(): void {
        this.asking.set(true);
        this.elevation.offerFor().pipe(
            finalize(() => this.asking.set(false)),
        ).subscribe(granted => {
            // offerFor() answers false without a prompt when the session is elevated already.
            if (granted || this.elevation.elevated()) {
                this.elevated.emit();
            } else if (!this.elevation.available) {
                this.unavailable.set(true);
            }
        });
    }
}
