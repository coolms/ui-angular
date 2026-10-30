import { ChangeDetectionStrategy, Component, computed, inject, InjectionToken, input, output } from '@angular/core';
import { isElevationRefusal } from '@coolms/core-angular';
import { ElevationRequiredComponent } from './elevation-required.component';

/**
 * UI-polish A2 -- shared inline error banner. Surfaces a load/action
 * failure in-place (instead of a blank panel + a transient toast that
 * scrolls away), with an optional Retry affordance.
 *
 * Usage: `<app-error-banner [message]="error()!" [showRetry]="true" (retry)="load()" />`
 *
 * Given the failure itself (`[error]`), a refusal for want of elevation is shown as what it is: the Elevate state in
 * place of the banner, whatever the message says -- on a reload, a link or the back button too, where nothing else
 * offered it. Once the session is elevated the page is loaded again ({@link RELOAD_PAGE}) where the shell provides
 * that, so every read the page makes on arrival is made again; elsewhere `retry` fires.
 *
 *   `<app-error-banner [message]="error()!" [error]="failure()" (retry)="load()" />`
 */
/**
 * How the host shell loads the page in front of the person again: it is made anew, so every read it makes on
 * arrival is made again. Provided by a shell that has pages; absent elsewhere.
 */
export const RELOAD_PAGE = new InjectionToken<() => void>('RELOAD_PAGE');

@Component({
    selector: 'app-error-banner',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ElevationRequiredComponent],
    template: `
        @if (elevationRefused()) {
            <cms-elevation-required data-test="error-banner-elevation-required" (elevated)="loadAgain()" />
        } @else {
            <div class="cms-error-banner alert alert-danger" role="alert">
                <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
                <span class="cms-error-banner__msg">{{ message() }}</span>
                @if (showRetry()) {
                    <button type="button" class="cms-btn cms-btn-sm cms-error-banner__retry" (click)="retry.emit()">
                        <i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Retry
                    </button>
                }
            </div>
        }
    `,
    styles: [`
        .cms-error-banner {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: var(--cms-content-padding, 20px);
            font-size: .875rem;
        }
        .cms-error-banner__msg { flex: 1; }
        .cms-error-banner__retry { flex-shrink: 0; }
    `],
})
export class ErrorBannerComponent {
    readonly message = input<string>('Something went wrong.');
    /** Show the Retry button (bind `(retry)` to handle it). */
    readonly showRetry = input<boolean>(false);
    /** The failure the message describes; a refusal for want of elevation is shown as the Elevate state. */
    readonly error = input<unknown>(null);
    readonly retry = output<void>();

    protected readonly elevationRefused = computed(() => isElevationRefusal(this.error()));

    private readonly reloadPage = inject(RELOAD_PAGE, { optional: true });

    protected loadAgain(): void {
        if (this.reloadPage) {
            this.reloadPage();
        } else {
            this.retry.emit();
        }
    }
}
