import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

import { FieldItem } from '@coolms/core-angular';
@Component({
    selector: 'app-toggle-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    template: `
        <div class="form-group">
            <div class="form-check form-switch">
                <input
                    [id]="item().alias"
                    class="form-check-input"
                    type="checkbox"
                    role="switch"
                    [formControl]="control()"
                />
                <label [for]="item().alias" class="form-check-label">
                    {{ item().label }}
                </label>
            </div>
            @if (item().hint) {
                <div class="form-text text-muted">{{ item().hint }}</div>
            }
        </div>
    `,
})
export class ToggleFieldComponent {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();
    control   = computed(() => this.formGroup().get(this.item().alias) as any);
}
