import { Component, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';

/**
 * Shared modal frame for CDK Dialog overlays.
 *
 * Three slots:
 *   - title input (text in the header)
 *   - default `<ng-content>` slot for the body
 *   - named `<ng-content select="[footer]">` slot for the action row
 *
 * Renders as the platform `cms-dialog` shape (see `src/styles.scss`)
 * so all modals look like siblings of the design-system reference
 * dialog (Runtime Type). Width is fluid between 360-540px by default;
 * a consumer can widen with `[width]` (in px) when its content genuinely
 * needs more horizontal room — but the contract is: when in doubt,
 * leave it at the default and lay the body out as a vertical stack.
 *
 * The footer slot is optional. When absent, the footer separator and
 * padding don't render — so existing consumers that put their actions
 * inside the body still work unchanged.
 */
@Component({
    selector: 'app-modal',
    standalone: true,
    template: `
        <div class="cms-dialog" [style.width.px]="width()">
            <div class="cms-dialog-header">
                <span>{{ title() }}</span>
                <button class="cms-dialog-close"
                        type="button"
                        (click)="close()"
                        aria-label="Close">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
            <div class="cms-dialog-body">
                <ng-content />
            </div>
            <!-- Only render footer wrapper when the consumer projects one. -->
            <div class="cms-dialog-footer" [class.is-empty]="false">
                <ng-content select="[footer]" />
            </div>
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [`
        :host { display: contents; }

        /* Override the platform max-width when a consumer asks for a
           specific width. The base styles.scss rule sets max-width 540px
           via the .cdk-overlay-container .cms-dialog selector. */
        .cms-dialog {
            width: 480px;
            max-width: 95vw;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }
        .cms-dialog-body {
            overflow-y: auto;
            min-height: 0;
        }

        /* Hide the footer chrome when nothing's projected into it.
           :has(>*) is supported in all modern browsers. */
        .cms-dialog-footer:not(:has(*)) {
            display: none;
        }
    `],
})
export class ModalComponent {
    title = input.required<string>();
    /** Optional width override in pixels. Default 480px (platform-consistent). */
    width = input<number>(480);

    private readonly dialogRef = inject(DialogRef);

    close(): void {
        this.dialogRef.close();
    }
}
