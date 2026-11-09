import { inject, Injectable } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { CmsFilesPickerComponent, FILES_PICKER_TITLE_ID } from './cms-files-picker.component';
import type { FilesPickerChoice, FilesPickerOptions } from './cms-files-picker.types';

/**
 * Opens `cms-files-picker` over the page: a modal dialog labelled by its title, focus moved onto the list and held
 * inside while open, and returned to what opened it on closing. Resolves with the chosen entries, or undefined when
 * the person cancels -- a host leaves what it already has alone on undefined.
 */
let openedCount = 0;

@Injectable({ providedIn: 'root' })
export class CmsFilesPickerService {
    private readonly dialog = inject(Dialog);

    open(options: FilesPickerOptions): Promise<readonly FilesPickerChoice[] | undefined> {
        const titleId = 'cms-fp-dialog-title-' + ++openedCount;
        const ref = this.dialog.open<readonly FilesPickerChoice[] | undefined, FilesPickerOptions, CmsFilesPickerComponent>(
            CmsFilesPickerComponent,
            {
                data: options,
                role: 'dialog',
                ariaModal: true,
                autoFocus: 'dialog',
                restoreFocus: true,
                // Escape and the backdrop are the picker's cancel, so the host's onCancel hears both.
                disableClose: true,
                panelClass: 'cms-files-picker-pane',
                ariaLabelledBy: titleId,
                providers: [{ provide: FILES_PICKER_TITLE_ID, useValue: titleId }],
            },
        );
        ref.backdropClick.subscribe(() => ref.componentInstance?.cancel());

        return firstValueFrom(ref.closed);
    }
}
