import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    ViewEncapsulation,
} from '@angular/core';

import { FormGroup } from '@angular/forms';
import { FieldItem } from '@coolms/core-angular';
/** One editable choice row. `value` is the stored key, `label` the display text. */
interface OptionRow {
    value: string;
    label: string;
}

/**
 * Reusable choice-list editor for the dynamic form: add / edit / remove
 * `{ value, label }` rows. The form control's value is a plain
 * `Array<{ value, label }>`, matching the backend `selectOptions` shape
 * (`Definition::$selectOptions` -> `options['selectOptions']`).
 *
 * Source of truth is the FormControl itself — every edit writes the whole
 * array back immutably and marks the control dirty, so the surrounding form's
 * dirty/submit machinery sees the change without any extra wiring. `rows()` is
 * a pure projection of the control value (tolerant of null / legacy scalars),
 * which is what keeps focus stable across keystrokes when tracked by index.
 *
 * Typing into an empty `value` cell is unnecessary in the common case: when the
 * value cell is still blank, editing the label live-derives a slug into it
 * (`Open` -> `open`), so authors usually only fill the label column. Once a
 * value is set (typed or derived) it is never overwritten by later label edits.
 *
 * This is the FE half of the select-options editor — persistence-agnostic; the
 * consuming form decides where the array lands (here: the FieldDefinition API's
 * `selectOptions`).
 */
@Component({
    selector: 'app-options-editor-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    imports: [],
    template: `
        <div class="form-group options-editor-field">
            <label class="form-label">
                {{ item().label }}
                @if (item().required) { <span class="text-danger">*</span> }
            </label>

            <div class="options-editor">
                @if (rows().length > 0) {
                    <div class="options-editor__head">
                        <span class="options-editor__col-value">Value</span>
                        <span class="options-editor__col-label">Label</span>
                        <span class="options-editor__col-action"></span>
                    </div>
                } @else {
                    <div class="options-editor__empty">No options yet — add the first choice below.</div>
                }

                @for (row of rows(); track $index) {
                    <div class="options-editor__row">
                        <input
                            class="cms-input options-editor__value font-mono"
                            type="text"
                            placeholder="value"
                            [value]="row.value"
                            (input)="setValue($index, $any($event.target).value)" />
                        <input
                            class="cms-input options-editor__label"
                            type="text"
                            placeholder="Label shown to users"
                            [value]="row.label"
                            (input)="setLabel($index, $any($event.target).value)" />
                        <button
                            type="button"
                            class="options-editor__remove"
                            title="Remove option"
                            (click)="removeRow($index)">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                }

                <button type="button" class="options-editor__add" (click)="addRow()">
                    <i class="bi bi-plus-lg"></i> Add option
                </button>
            </div>

            @if (item().hint) {
                <div class="form-text text-muted">{{ item().hint }}</div>
            }
        </div>
    `,
    styles: [`
        .options-editor {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 10px;
            border: 1px solid var(--cms-border);
            border-radius: var(--cms-radius);
            background: var(--cms-bg);
        }
        .options-editor__head {
            display: flex;
            gap: 8px;
            font-size: .7rem;
            text-transform: uppercase;
            letter-spacing: .04em;
            color: var(--cms-text-muted);
            padding: 0 2px;
        }
        .options-editor__empty {
            font-size: .8125rem;
            color: var(--cms-text-muted);
            padding: 4px 2px;
        }
        .options-editor__row {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .options-editor__col-value,
        .options-editor__value { flex: 0 0 34%; min-width: 0; }
        .options-editor__col-label,
        .options-editor__label { flex: 1 1 auto; min-width: 0; }
        .options-editor__value,
        .options-editor__label { width: 100%; }
        .options-editor__col-action,
        .options-editor__remove { flex: 0 0 28px; }
        .options-editor__remove {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border: none;
            background: none;
            border-radius: var(--cms-radius);
            color: var(--cms-text-muted);
            cursor: pointer;
            transition: color .15s, background .15s;
        }
        .options-editor__remove:hover {
            color: var(--cms-danger);
            background: var(--cms-danger-light);
        }
        .options-editor__add {
            align-self: flex-start;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            margin-top: 2px;
            padding: 4px 10px;
            border: 1px dashed var(--cms-border);
            background: none;
            border-radius: var(--cms-radius);
            font-size: .8125rem;
            color: var(--cms-text-secondary);
            cursor: pointer;
            transition: color .15s, border-color .15s;
        }
        .options-editor__add:hover {
            color: var(--cms-accent-text);
            border-color: var(--cms-accent);
        }
        .options-editor-field .font-mono {
            font-family: var(--cms-font-mono, monospace);
        }
    `],
})
export class OptionsEditorFieldComponent {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();

    private readonly control = computed(() => this.formGroup().get(this.item().alias));

    /** Pure projection of the control value into typed rows; tolerant of null/scalars. */
    rows = computed<OptionRow[]>(() => {
        const v = this.control()?.value;
        if (!Array.isArray(v)) return [];
        return v.map((o): OptionRow => {
            const obj = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
            return { value: String(obj['value'] ?? ''), label: String(obj['label'] ?? '') };
        });
    });

    /** Edit a row's value cell. Never auto-derives — explicit user intent. */
    setValue(i: number, value: string): void {
        const rows = this.rows();
        if (i < 0 || i >= rows.length) return;
        const next = rows.slice();
        next[i] = { ...next[i], value };
        this.write(next);
    }

    /** Edit a row's label; live-derive a slug into an empty value cell. */
    setLabel(i: number, label: string): void {
        const rows = this.rows();
        if (i < 0 || i >= rows.length) return;
        const next = rows.slice();
        const prev = next[i];
        const value = prev.value === '' ? slugify(label) : prev.value;
        next[i] = { value, label };
        this.write(next);
    }

    addRow(): void {
        this.write([...this.rows(), { value: '', label: '' }]);
    }

    removeRow(i: number): void {
        const rows = this.rows();
        if (i < 0 || i >= rows.length) return;
        const next = rows.slice();
        next.splice(i, 1);
        this.write(next);
    }

    private write(rows: OptionRow[]): void {
        const c = this.control();
        if (!c) return;
        c.setValue(rows);
        c.markAsDirty();
    }
}

/** Gentle key slug: lowercase, non-alphanumerics -> `_`, trimmed. */
function slugify(label: string): string {
    return label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}
