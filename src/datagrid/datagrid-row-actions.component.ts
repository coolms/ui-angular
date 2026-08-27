import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgClass } from '@angular/common';
import { DataGridRowAction } from './datagrid.types';

/**
 * Renders per-row action buttons for a DataGrid row.
 *
 * Usage:
 *   <coolms-datagrid-row-actions
 *       [actions]="config.rowActions"
 *       [row]="rowData"
 *       (actionTriggered)="onAction($event)" />
 */
@Component({
    selector: 'coolms-datagrid-row-actions',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgClass],
    template: `
        <div class="d-flex gap-1 justify-content-end flex-nowrap">
          @for (action of actions(); track action) {
            <button
              class="cms-btn cms-btn-sm"
              [class.cms-btn-danger]="isDanger(action)"
              [title]="action.label"
              (click)="trigger(action)">
              @if (action.icon) {
                <i class="bi" [ngClass]="'bi-' + action.icon"></i>
              } @else {
                {{ action.label }}
              }
            </button>
          }
        </div>
        `,
})
export class DataGridRowActionsComponent {
    readonly actions = input.required<ReadonlyArray<DataGridRowAction>>();
    readonly row     = input.required<Record<string, unknown>>();

    readonly actionTriggered = output<{ action: DataGridRowAction; row: Record<string, unknown> }>();

    trigger(action: DataGridRowAction): void {
        // Emit unconditionally — confirmation is the caller's responsibility.
        // DynamicRecordListComponent (and others) handle confirm via CDK dialog.
        this.actionTriggered.emit({ action, row: this.row() });
    }

    isDanger(action: DataGridRowAction): boolean {
        return action.id === 'delete' || action.id.endsWith('_delete') || action.id.endsWith('-delete');
    }

}
