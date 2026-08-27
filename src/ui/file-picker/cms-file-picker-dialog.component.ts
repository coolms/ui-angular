import {
    ChangeDetectionStrategy,
    Component,
    inject,
    signal,
} from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ModalComponent } from '../modal/modal.component';
import { CmsFilePickerComponent, type FileSelectablePredicate } from './cms-file-picker.component';

/** What the caller passes through `DIALOG_DATA`. */
export interface FilePickerDialogData {
    /** Dialog title; default suits attachments. */
    title?:          string;
    /** Where browsing starts. `/` lets the server's permission filter decide. */
    root?:           string;
    /** Pre-selected paths, so reopening shows what is already chosen. */
    value?:          readonly string[] | string | null;
    multiple?:       boolean;
    selectableWhen?: FileSelectablePredicate;
    /** Verb on the primary button — "Attach", "Insert", "Choose". */
    confirmLabel?:   string;
}

/**
 * `<cms-file-picker>` in its own modal (#1745).
 *
 * The picker was designed to embed, and the newsletter Compose dialog did embed
 * it — which put a scrolling VFS tree inside an already-tall form. The dialog
 * grew past the viewport, and every folder expansion resized it, so the whole
 * modal jumped while the operator was reading it. Browsing a file system is its
 * own task with its own scroll region; it does not belong inside a form the
 * operator is midway through filling in.
 *
 * Modelled on how the Media picker already works, so "pick a thing" is one
 * interaction shape across the admin rather than a per-page invention.
 *
 * Resolves with the selected path(s), or `undefined` when dismissed — a caller
 * MUST treat dismissal as "leave the selection alone", not as "clear it".
 */
@Component({
    selector: 'app-file-picker-dialog',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ModalComponent, CmsFilePickerComponent],
    template: `
        <app-modal [title]="data.title ?? 'Choose files'" [width]="640">
            <cms-file-picker
                class="picker"
                [root]="data.root ?? '/'"
                [multiple]="data.multiple ?? false"
                [value]="selection()"
                [selectableWhen]="data.selectableWhen ?? always"
                (valueChange)="onChange($event)" />

            <ng-container footer>
                <span class="count">{{ countLabel() }}</span>
                <button type="button" class="cms-btn" (click)="cancel()">Cancel</button>
                <button type="button" class="cms-btn cms-btn-primary" (click)="confirm()">
                    {{ data.confirmLabel ?? 'Choose' }}
                </button>
            </ng-container>
        </app-modal>
    `,
    styles: [`
        /*
         * Min == max, so the list is a FIXED size and the dialog stops resizing
         * as the operator moves between folders. A cap alone is not enough: the
         * list shrinks to a short folder's content, and since the dialog is
         * centred it jumps position as well as height on every navigation.
         *
         * Tuned on the picker's own variables rather than by wrapping it in a
         * taller box — the list scrolls itself, so an outer height would only
         * add dead space beneath it.
         */
        .picker {
            display: block;
            --cms-file-picker-list-height: 24rem;
            --cms-file-picker-list-min-height: 24rem;
        }
        .count { margin-right: auto; font-size: 0.82rem; color: var(--cms-text-muted, #6b7280); }
    `],
})
export class CmsFilePickerDialogComponent {
    readonly data = inject<FilePickerDialogData>(DIALOG_DATA);

    private readonly dialogRef = inject<DialogRef<string[] | undefined>>(DialogRef);

    readonly always: FileSelectablePredicate = () => true;

    readonly selection = signal<string[]>(this.normalise(this.data.value));

    countLabel(): string {
        const n = this.selection().length;
        if (0 === n) return 'Nothing selected';

        return `${n} selected`;
    }

    onChange(emitted: string | string[] | null): void {
        this.selection.set(this.normalise(emitted));
    }

    cancel(): void {
        // `undefined`, not `[]` — the caller cannot otherwise tell "I chose
        // nothing" from "I changed my mind", and clearing someone's existing
        // attachments because they pressed Escape is the wrong default.
        this.dialogRef.close(undefined);
    }

    confirm(): void {
        this.dialogRef.close(this.selection());
    }

    private normalise(value: string | readonly string[] | null | undefined): string[] {
        if (null === value || undefined === value) return [];
        const list = Array.isArray(value) ? value : [value];

        return list.filter((v): v is string => 'string' === typeof v && '' !== v);
    }
}
