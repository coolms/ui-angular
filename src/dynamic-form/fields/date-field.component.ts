import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

import { FieldItem } from '@coolms/core-angular';
@Component({
    selector: 'app-date-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    template: `
        <div class="form-group">
            <label [for]="item().alias" class="form-label">
                {{ item().label }}
                @if (item().required) { <span class="text-danger">*</span> }
            </label>
            <input
                [id]="item().alias"
                class="form-control"
                [class.is-invalid]="isInvalid()"
                [type]="item().type"
                [formControl]="control()"
            />
            @if (item().hint) {
                <div class="form-text text-muted">{{ item().hint }}</div>
            }
            @if (isInvalid()) {
                <div class="invalid-feedback">{{ item().label }} is required</div>
            }
        </div>
    `,
})
export class DateFieldComponent {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();
    control   = computed(() => this.formGroup().get(this.item().alias) as any);
    isInvalid = computed(() => { const c = this.control(); return c && c.invalid && c.touched; });
}
