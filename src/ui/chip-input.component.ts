import {
    ChangeDetectionStrategy,
    Component,
    forwardRef,
    input,
    signal,
} from '@angular/core';

import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
    selector: 'app-chip-input',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    providers: [{
        provide: NG_VALUE_ACCESSOR,
        useExisting: forwardRef(() => ChipInputComponent),
        multi: true,
    }],
    template: `
        <div class="chip-input-wrap" (click)="inputEl.focus()">
            @for (tag of tags(); track tag) {
                <span class="chip">
                    {{ tag }}
                    <button type="button" (click)="remove(tag)">×</button>
                </span>
            }
            <input #inputEl
                   type="text"
                   class="chip-input-field"
                   [placeholder]="tags().length === 0 ? placeholder() : ''"
                   (keydown)="onKeydown($event)"
                   (blur)="onBlur($event)" />
        </div>
    `,
    styles: [`
        .chip-input-wrap {
            display: flex; flex-wrap: wrap; gap: 4px;
            border: 1px solid #dee2e6; border-radius: .375rem;
            padding: 4px 8px; min-height: 38px; cursor: text;
            background: var(--cms-surface);
        }
        .chip-input-wrap:focus-within { border-color: #86b7fe; box-shadow: 0 0 0 .25rem rgba(13,110,253,.25); }
        .chip {
            display: inline-flex; align-items: center; gap: 4px;
            background: #e9ecef; border-radius: 4px;
            padding: 1px 6px; font-size: .8rem;
        }
        .chip button {
            background: none; border: none; cursor: pointer;
            padding: 0; line-height: 1; color: #6c757d; font-size: .9rem;
        }
        .chip button:hover { color: #dc3545; }
        .chip-input-field {
            border: none; outline: none; flex: 1;
            min-width: 80px; font-size: .875rem;
        }
    `],
})
export class ChipInputComponent implements ControlValueAccessor {
    placeholder = input<string>('Add tag…');

    tags     = signal<string[]>([]);
    private onChange  = (_: string[]) => {};
    private onTouched = () => {};

    onKeydown(event: KeyboardEvent): void {
        const input = event.target as HTMLInputElement;
        const value = input.value.trim();

        if ((event.key === 'Enter' || event.key === ',') && value) {
            event.preventDefault();
            this.add(value);
            input.value = '';
        }
        if (event.key === 'Backspace' && !value && this.tags().length > 0) {
            this.remove(this.tags().at(-1)!);
        }
    }

    onBlur(event: FocusEvent): void {
        const value = (event.target as HTMLInputElement).value.trim();
        if (value) {
            this.add(value);
            (event.target as HTMLInputElement).value = '';
        }
        this.onTouched();
    }

    add(tag: string): void {
        const normalized = tag.replace(/,/g, '').trim();
        if (!normalized || this.tags().includes(normalized)) return;
        this.tags.update(t => [...t, normalized]);
        this.onChange(this.tags());
    }

    remove(tag: string): void {
        this.tags.update(t => t.filter(x => x !== tag));
        this.onChange(this.tags());
    }

    writeValue(val: string[]): void {
        this.tags.set(Array.isArray(val) ? val : []);
    }
    registerOnChange(fn: (_: string[]) => void): void { this.onChange = fn; }
    registerOnTouched(fn: () => void): void { this.onTouched = fn; }
}
