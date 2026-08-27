import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
} from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicFormComponent } from '../dynamic-form/dynamic-form.component';
import { DynamicRecordService, DynamicRecordDto } from './dynamic-record.service';
import type { EntityTypeSchema } from '../schema/schema.types';
import { ToastService } from '../ui/toast.service';

export interface DynamicRecordFormData {
    typeAlias: string;
    schema:    EntityTypeSchema | null;
    record?:   DynamicRecordDto;
    mode:      'create' | 'edit';
}

@Component({
    selector: 'app-dynamic-record-form',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DynamicFormComponent],
    template: `
        <div class="record-form-dialog">
            <div class="record-form-dialog__header">
                <span>{{ isEdit ? 'Edit' : 'New' }} {{ schema?.label ?? typeAlias }}</span>
                <button class="cms-dialog-close" (click)="close()">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
            <div class="record-form-dialog__body">
                <app-dynamic-form
                    [formId]="formId"
                    [context]="isEdit ? 'edit' : 'create'"
                    [initialValue]="initialValue()"
                    (submitted)="onSubmit($event)"
                    (cancelled)="close()" />
            </div>
        </div>
    `,
    styles: [`
        .record-form-dialog {
            width: 540px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            background: var(--cms-surface);
            border-radius: var(--cms-radius-lg);
            overflow: hidden;
        }
        .record-form-dialog__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 20px;
            border-bottom: 1px solid var(--cms-border-color);
            font-weight: 600;
        }
        .record-form-dialog__body {
            overflow-y: auto;
            flex: 1;
            padding: 20px;
        }
    `],
})
export class DynamicRecordFormComponent {
    private readonly dialogRef  = inject(DialogRef);
    private readonly data       = inject(DIALOG_DATA) as DynamicRecordFormData;
    private readonly recordSvc  = inject(DynamicRecordService);
    private readonly toast      = inject(ToastService);
    private readonly destroyRef = inject(DestroyRef);

    readonly typeAlias = this.data.typeAlias;
    readonly schema    = this.data.schema;
    readonly isEdit    = this.data.mode === 'edit';

    // Form ID: the type alias is registered as the form config ID
    // via DynamicEntityType.$formConfigArray on the backend.
    readonly formId = this.typeAlias;

    readonly initialValue = computed(() => {
        if (!this.isEdit || !this.data.record) return {};
        const record = this.data.record;
        return (this.schema?.fields ?? []).reduce<Record<string, unknown>>(
            (acc, field) => {
                const raw = this.resolveFieldValue(record, field.name);
                acc[field.name] = this.formatFieldValue(raw, field.type);
                return acc;
            },
            {},
        );
    });

    // Resolves `a.b.c` paths against the record (e.g. `locale.value`).
    private resolveFieldValue(record: DynamicRecordDto, path: string): unknown {
        if (!path.includes('.')) return record[path];
        return path.split('.').reduce<unknown>(
            (v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined),
            record,
        );
    }

    // HTML date/datetime-local inputs require specific formats; ISO-8601 from the
    // API must be trimmed so the native picker can parse it.
    private formatFieldValue(value: unknown, type: string): unknown {
        if (value == null || typeof value !== 'string') return value;
        if (type === 'date')           return value.slice(0, 10);
        if (type === 'datetime-local') return value.slice(0, 16);
        if (type === 'time')           return value.slice(11, 16);
        return value;
    }

    onSubmit(values: Record<string, unknown>): void {
        // Send dynamic field values as flat body fields.
        // PHP processors pick them up via the RequestStack fallback (flat-body path).
        const obs = this.isEdit
            ? this.recordSvc.updateRecord(this.data.record!.id, values)
            : this.recordSvc.createRecord({ entityType: this.typeAlias, ...values });

        obs.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.toast.success(this.isEdit ? 'Record updated' : 'Record created');
                    this.dialogRef.close(true);
                },
                error: (e: { error?: { detail?: string } }) =>
                    this.toast.error(e?.error?.detail ?? 'Save failed'),
            });
    }

    close(): void {
        this.dialogRef.close();
    }
}
