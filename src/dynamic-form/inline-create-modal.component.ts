import { Component, inject, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { Store } from '@ngxs/store';
import { ErrorHandlerService, AppConfigState, ApiManifest } from '@coolms/core-angular';
import { ModalComponent } from '../ui/modal/modal.component';
import { DynamicFormComponent } from './dynamic-form.component';

export interface InlineCreateModalData {
    formId: string;
}

@Component({
    selector: 'app-inline-create-modal',
    standalone: true,
    imports: [ModalComponent, DynamicFormComponent],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <app-modal [title]="'Create ' + data.formId.split(':')[1]">
            <app-dynamic-form
                #dynamicForm
                [formId]="data.formId"
                context="create"
                submitLabel="Create"
                (submitted)="onSubmit($event)"
                (cancelled)="dialogRef.close()"
            />
        </app-modal>
    `,
})
export class InlineCreateModalComponent {
    @ViewChild('dynamicForm') dynamicForm!: DynamicFormComponent;

    readonly dialogRef = inject(DialogRef);
    readonly data: InlineCreateModalData = inject(DIALOG_DATA);

    private readonly http   = inject(HttpClient);
    private readonly store  = inject(Store);
    private readonly errors = inject(ErrorHandlerService);

    onSubmit(value: Record<string, unknown>): void {
        const manifest  = this.store.selectSnapshot(AppConfigState.manifest);
        const createUrl = this.resolveCreateUrl(manifest, this.data.formId);

        if (!createUrl) {
            this.dynamicForm.setServerError(
                `Cannot determine API endpoint for form '${this.data.formId}'`,
            );
            return;
        }

        this.http.post<Record<string, unknown>>(createUrl, value).subscribe({
            next:  result => this.dialogRef.close(result),
            error: err    => this.dynamicForm.setServerError(this.errors.humanize(err)),
        });
    }

    private resolveCreateUrl(manifest: ApiManifest | null, formId: string): string | null {
        if (!manifest) return null;

        // Map formId -> manifest create URL. Extend as more form IDs are added.
        const map: Record<string, string | undefined> = {
            'section:site_section': manifest.sections?.create,
            'navi:navi_tree':       manifest.navi?.treesCreate,
            'navi:navi_node':       manifest.navi?.nodesCreate,
        };

        return map[formId] ?? null;
    }
}
