import { inject, Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { NativeDialogService } from './dialog/native-dialog.service';

export interface ConfirmDialogData {
    title:         string;
    message?:      string;
    confirmLabel?: string;
    cancelLabel?:  string;
    danger?:       boolean;
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
    private readonly nativeDialog = inject(NativeDialogService);

    open(data: ConfirmDialogData): Observable<boolean> {
        return from(this.nativeDialog.confirm({
            title:        data.title,
            message:      data.message ?? '',
            confirmLabel: data.confirmLabel,
            cancelLabel:  data.cancelLabel,
            danger:       data.danger,
        }));
    }

    confirmDelete(name: string): Observable<boolean> {
        return this.open({
            title:        `Delete "${name}"?`,
            message:      'This action cannot be undone.',
            confirmLabel: 'Delete',
            danger:       true,
        });
    }

    confirm(title: string, message?: string): Observable<boolean> {
        return this.open({ title, message, danger: false });
    }

    /**
     * "You have unsaved changes" — the one every editor needs and none had.
     *
     * MEASURED before this existed: 30 surfaces in the admin track a `dirty`
     * flag, and there were ZERO `beforeunload` handlers and ZERO
     * `CanDeactivate` guards in the whole frontend. A dirty editor discarded
     * silently on close; the flag was shown to the user and then ignored by
     * the code that threw the work away.
     *
     * `danger` is true because discarding IS the destructive branch, and the
     * labels name the outcomes rather than answering a question — a "Cancel"
     * button on a dialog about cancelling is exactly the ambiguity people
     * click through. "Keep editing" is the safe default the Esc key lands on.
     */
    confirmDiscard(what?: string): Observable<boolean> {
        return this.open({
            title:        'Discard unsaved changes?',
            message:      undefined === what
                ? 'Your changes have not been saved and will be lost.'
                : `"${what}" has changes that have not been saved. They will be lost.`,
            confirmLabel: 'Discard changes',
            cancelLabel:  'Keep editing',
            danger:       true,
        });
    }
}
