import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * UI-polish A2 — shared inline error banner. Surfaces a load/action
 * failure in-place (instead of a blank panel + a transient toast that
 * scrolls away), with an optional Retry affordance.
 *
 * Usage: `<app-error-banner [message]="error()!" [showRetry]="true" (retry)="load()" />`
 */
@Component({
    selector: 'app-error-banner',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="cms-error-banner alert alert-danger" role="alert">
            <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
            <span class="cms-error-banner__msg">{{ message() }}</span>
            @if (showRetry()) {
                <button type="button" class="cms-btn cms-btn-sm cms-error-banner__retry" (click)="retry.emit()">
                    <i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Retry
                </button>
            }
        </div>
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
    readonly retry = output<void>();
}
