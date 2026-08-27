import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FieldItem } from '@coolms/core-angular';
import { TokenInputComponent, TokenDef } from '../../ui/token-input/token-input.component';

@Component({
    selector: 'app-token-pattern-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, TokenInputComponent],
    template: `
        <div class="form-group">
            <label class="form-label">
                {{ item().label }}
                @if (item().required) { <span class="text-danger">*</span> }
            </label>

            <app-token-input
                [formControl]="control()"
                [tokens]="tokenDefs()"
                [separators]="separators()"
                [placeholder]="item().placeholder ?? 'Enter pattern…'"
                [isInvalid]="isInvalid()" />

            @if (item().hint) {
                <div class="form-text text-muted">{{ item().hint }}</div>
            }
            @if (isInvalid()) {
                <div class="invalid-feedback d-block">{{ item().label }} is required</div>
            }
        </div>
    `,
})
export class TokenPatternFieldComponent {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();

    control = computed(() => this.formGroup().get(this.item().alias) as FormControl);

    isInvalid = computed(() => {
        const c = this.control();
        return c?.invalid === true && c?.touched === true;
    });

    tokenDefs = computed<TokenDef[]>(() =>
        (this.item().dataSource?.options ?? []).map(opt => ({
            id:      String(opt['value']),
            label:   String(opt['label']),
            example: String(opt['parentId'] ?? opt['value']), // parentId repurposed for example value
        })),
    );

    separators = computed<string[]>(() =>
        (this.item().separators as string[] | undefined) ?? ['_', '-', '.'],
    );
}
