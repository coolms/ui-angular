import { Component, input, computed, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

import { FieldItem } from '@coolms/core-angular';
@Component({
    selector: 'app-text-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    imports: [ReactiveFormsModule],
    template: `
        <div class="form-group">
            <label [for]="item().alias" class="form-label">
                {{ item().label }}
                @if (item().required) { <span class="text-danger">*</span> }
            </label>

            @if (item().type === 'textarea') {
                <textarea
                    [id]="item().alias"
                    class="form-control"
                    [class.is-invalid]="isInvalid()"
                    [formControl]="control()"
                    [placeholder]="item().placeholder ?? ''"
                    rows="3"
                ></textarea>
            } @else {
                <input
                    [id]="item().alias"
                    class="form-control cms-input"
                    [class.is-invalid]="isInvalid()"
                    [type]="item().type"
                    [formControl]="control()"
                    [placeholder]="item().placeholder ?? ''"
                    [attr.autocomplete]="item().type === 'password' ? 'new-password' : 'off'"
                />
            }

            @if (item().hint) {
                <div class="form-text text-muted">{{ item().hint }}</div>
            }
            @if (isInvalid()) {
                <div class="invalid-feedback">{{ errorMessage() }}</div>
            }
        </div>
    `,
})
export class TextFieldComponent {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();

    control      = computed(() => this.formGroup().get(this.item().alias) as any);
    isInvalid    = computed(() => { const c = this.control(); return c && c.invalid && c.touched; });
    errorMessage = computed(() => {
        const errors = this.control()?.errors;
        if (!errors) return '';
        if (errors['server'])    return errors['server'] as string;
        if (errors['required'])  return `${this.item().label} is required`;
        if (errors['email'])     return 'Invalid email address';
        if (errors['maxlength']) return `Max ${errors['maxlength'].requiredLength} characters`;
        if (errors['minlength']) return `Min ${errors['minlength'].requiredLength} characters`;
        if (errors['min'])       return `Min value is ${errors['min'].min}`;
        if (errors['max'])       return `Max value is ${errors['max'].max}`;
        if (errors['pattern'])   return 'Invalid format';
        return 'Invalid value';
    });
}
