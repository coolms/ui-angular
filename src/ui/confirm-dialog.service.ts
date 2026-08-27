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
}
