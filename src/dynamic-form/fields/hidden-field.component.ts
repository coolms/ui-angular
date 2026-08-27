import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { FieldItem } from '@coolms/core-angular';
@Component({
    selector: 'app-hidden-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    template: `<input type="hidden" [formControl]="control()" />`,
})
export class HiddenFieldComponent {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();
    control   = computed(() => this.formGroup().get(this.item().alias) as any);
}
