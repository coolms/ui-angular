import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ModalComponent } from '../modal/modal.component';

/**
 * Data passed in by {@link NativeDialogService.confirm} via CDK
 * `Dialog.open(..., { data })`. All fields pre-resolved (no `?`) so the
 * template stays binding-only.
 */
export interface ConfirmDialogContentData {
    title:        string;
    message:      string;
    confirmLabel: string;
    /** Empty string hides the Cancel button (X + backdrop still cancel). */
    cancelLabel:  string;
    danger:       boolean;
}

/**
 * A2/A3 dialog convergence — the confirm dialog now renders the platform
 * `<app-modal>` chrome (CDK overlay, `cms-dialog` shape) so it looks like a
 * sibling of every form dialog instead of the old bespoke native `<dialog>`.
 *
 * Opened by {@link NativeDialogService} through CDK `Dialog.open()`, which
 * provides `DialogRef` + `DIALOG_DATA`. The `<app-modal>` close (X) /
 * backdrop / Esc all resolve to `false` (CDK closes with `undefined`);
 * the explicit buttons resolve `true`/`false`. `ConfirmDialogService`'s
 * public API is unchanged — callers are untouched.
 */
@Component({
    selector: 'app-confirm-dialog',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ModalComponent],
    template: `
        <app-modal [title]="data.title">
            <p style="margin: 0; white-space: pre-line;">{{ data.message }}</p>

            <div footer>
                @if (data.cancelLabel) {
                    <button type="button" class="cms-btn" (click)="close(false)">
                        {{ data.cancelLabel }}
                    </button>
                }
                <button type="button"
                        class="cms-btn"
                        [class.cms-btn-danger]="data.danger"
                        [class.cms-btn-primary]="!data.danger"
                        (click)="close(true)">
                    {{ data.confirmLabel }}
                </button>
            </div>
        </app-modal>
    `,
})
export class ConfirmDialogComponent {
    readonly data = inject<ConfirmDialogContentData>(DIALOG_DATA);
    private readonly dialogRef = inject<DialogRef<boolean>>(DialogRef);

    close(result: boolean): void {
        this.dialogRef.close(result);
    }
}
