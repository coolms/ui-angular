import {
    ChangeDetectionStrategy,
    Component,
    inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { ModalComponent } from '../modal/modal.component';

/** Input data for {@link DeleteNodeDialogComponent}. */
export interface DeleteNodeDialogData {
    /** Display name of the item being deleted. */
    name: string;
    /** Optional description line shown below the name. */
    message?: string;
    /** When true the recursive checkbox is rendered. */
    showRecursive?: boolean;
    /** Checkbox label. Defaults to "Delete all contents recursively". */
    recursiveLabel?: string;
}

/** Result emitted when the user confirms. Null means cancelled. */
export interface DeleteNodeDialogResult {
    recursive: boolean;
}

/**
 * Generic CDK-Dialog for destructive node / collection deletions
 * (Media-Library collections + VFS tree nodes). Shows an optional
 * "delete recursively" checkbox when showRecursive is true.
 *
 * A3 dialog convergence: renders the platform `<app-modal>` chrome
 * (`cms-dialog` shape) — a sibling of every other dialog — instead of
 * hand-rolled `cms-dialog-*` divs. Already opened via CDK `Dialog.open()`,
 * so this is a template-only swap; consumers (data in, result out) are
 * unchanged. The Delete button uses the global `.cms-btn-danger` so it
 * matches the converged confirm dialog ([#894]).
 */
@Component({
    selector: 'app-delete-node-dialog',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, ModalComponent],
    template: `
        <app-modal [title]="title">
            <p class="delete-msg">
                {{ data.message ?? 'This action cannot be undone.' }}
            </p>

            @if (data.showRecursive) {
                <label class="delete-recursive-row">
                    <input type="checkbox" [(ngModel)]="recursiveModel">
                    <span>{{ data.recursiveLabel ?? 'Delete all contents recursively' }}</span>
                </label>
            }

            <div footer>
                <button type="button" class="cms-btn" (click)="cancel()">Cancel</button>
                <button type="button" class="cms-btn cms-btn-danger" (click)="confirm()">Delete</button>
            </div>
        </app-modal>
    `,
    styles: [`
        .delete-msg {
            margin: 0 0 12px;
            font-size: .875rem;
            color: var(--cms-text);
        }
        .delete-recursive-row {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: .875rem;
            color: var(--cms-text);
            cursor: pointer;
            user-select: none;
        }
    `],
})
export class DeleteNodeDialogComponent {
    readonly dialogRef = inject<DialogRef<DeleteNodeDialogResult | null>>(DialogRef);
    readonly data      = inject<DeleteNodeDialogData>(DIALOG_DATA);

    readonly title = `Delete "${this.data.name}"?`;

    recursiveModel = false;

    confirm(): void {
        this.dialogRef.close({ recursive: this.recursiveModel });
    }

    cancel(): void {
        this.dialogRef.close(null);
    }
}
