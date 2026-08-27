import {
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    inject,
    input,
    output,
    signal,
} from '@angular/core';

import {
    CdkDrag,
    CdkDragDrop,
    CdkDragHandle,
    CdkDragPlaceholder,
    CdkDropList,
    moveItemInArray,
} from '@angular/cdk/drag-drop';
import { DataGridColumnDef } from './datagrid.types';

@Component({
    selector: 'coolms-column-chooser',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder],
    host: {
        '(document:click)': 'onOutsideClick($event)',
        style: 'position:relative; display:inline-block',
    },
    template: `
        <!-- Trigger button -->
        <button type="button"
          class="cms-btn cms-btn-sm cms-btn-ghost"
          title="Columns"
          (click)="toggle()">
          <i class="bi bi-layout-three-columns"></i>
        </button>
        
        <!-- Dropdown panel -->
        @if (open()) {
          <div class="column-chooser-panel">
            <div class="column-chooser-header">
              <span class="column-chooser-title">Columns</span>
              <button type="button"
                class="cms-btn cms-btn-sm cms-btn-ghost column-chooser-reset"
              (click)="reset()">Reset</button>
            </div>
            <!-- Draggable column list -->
            <div cdkDropList
              (cdkDropListDropped)="onDrop($event)"
              class="py-1">
              @for (col of orderedColumns(); track col) {
                <div
                  cdkDrag
                  class="drag-item d-flex align-items-center gap-2 px-3 py-1"
                  [class.column-chooser-row--required]="col.required">
                  <!-- Drag handle (not for required columns) -->
                  @if (!col.required) {
                    <span
                      cdkDragHandle
                    class="drag-handle-icon">⠿</span>
                  }
                  @if (col.required) {
                    <span style="width:12px"></span>
                  }
                  <!-- Visibility checkbox -->
                  <input type="checkbox"
                    class="form-check-input"
                    [checked]="isVisible(col.field)"
                    [disabled]="!!col.required"
                    (change)="toggleColumn(col.field, $any($event.target).checked)" />
                  <span>{{ col.label }}</span>
                  @if (col.required) {
                    <span class="column-chooser-required-tag">(required)</span>
                  }
                  <!-- Drop placeholder -->
                  <div *cdkDragPlaceholder class="column-chooser-placeholder"></div>
                </div>
              }
            </div>
          </div>
        }
        `,
    styles: [`
        .column-chooser-panel {
            position: absolute;
            z-index: 1050;
            min-width: 220px;
            top: 100%;
            right: 0;
            margin-top: 4px;
            background: var(--cms-surface);
            border: 1px solid var(--cms-border);
            border-radius: var(--cms-radius);
            box-shadow: var(--cms-shadow-sm);
        }
        .drag-item { cursor: default; font-size: .875rem; }
        .drag-handle-icon { font-size: .75rem; cursor: grab; user-select: none; color: var(--cms-text-muted); }
        .drag-handle-icon:active { cursor: grabbing; }
        .column-chooser-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 12px;
            border-bottom: 1px solid var(--cms-border);
        }
        .column-chooser-title {
            font-size: .75rem;
            font-weight: 600;
            color: var(--cms-text-muted);
        }
        .column-chooser-reset { font-size: .7rem; }
        .column-chooser-row--required { color: var(--cms-text-muted); }
        .column-chooser-required-tag {
            color: var(--cms-text-muted);
            font-size: .7rem;
        }
        .column-chooser-placeholder {
            height: 28px;
            background: var(--cms-accent-light);
            border: 1px dashed var(--cms-accent);
            border-radius: var(--cms-radius-sm);
        }
    `],
})
export class ColumnChooserComponent {
    columns       = input.required<ReadonlyArray<DataGridColumnDef>>();
    visibleFields = input.required<string[]>();

    columnsChange = output<string[]>();
    resetAll      = output<void>();

    private readonly elRef = inject(ElementRef);

    open = signal(false);

    /** Visible columns in current order first, then hidden hideable columns */
    orderedColumns = computed<DataGridColumnDef[]>(() => {
        const all     = this.columns();
        const visible = this.visibleFields()
            .map(f => all.find(c => c.field === f))
            .filter((c): c is DataGridColumnDef => c !== undefined);
        const hidden  = all.filter(
            c => c.hideable && !this.visibleFields().includes(c.field),
        );
        return [...visible, ...hidden];
    });

    isVisible(field: string): boolean {
        return this.visibleFields().includes(field);
    }

    toggle(): void { this.open.update(v => !v); }

    onOutsideClick(event: MouseEvent): void {
        if (!this.elRef.nativeElement.contains(event.target)) {
            this.open.set(false);
        }
    }

    toggleColumn(field: string, checked: boolean): void {
        const current = [...this.visibleFields()];
        const updated = checked
            ? [...current, field]
            : current.filter(f => f !== field);
        this.columnsChange.emit(updated);
    }

    onDrop(event: CdkDragDrop<DataGridColumnDef[]>): void {
        const ordered = [...this.orderedColumns()];
        moveItemInArray(ordered, event.previousIndex, event.currentIndex);
        // Emit only the visible fields in their new order
        const newOrder = ordered
            .filter(c => this.isVisible(c.field))
            .map(c => c.field);
        this.columnsChange.emit(newOrder);
    }

    reset(): void {
        this.resetAll.emit();
        this.open.set(false);
    }
}
