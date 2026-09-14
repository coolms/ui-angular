import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

import { FieldItem } from '@coolms/core-angular';

/**
 * A boolean field rendered as the platform's own switch (`.cms-toggle`).
 *
 * It was Bootstrap's `.form-check.form-switch`, and two stylesheets fought over
 * the one `<input>`: Bootstrap's `.form-switch .form-check-input` won `width`
 * (2em) and `margin-left` (-2.5em), the admin's base `input[type=checkbox]`
 * rule won `height` (18px) and `border`, and Bootstrap's knob image was then
 * drawn to a height it had not set -- the fat grey pill an operator reported
 * on 2026-09-11, with the label riding under it at their zoom. The layout also
 * hung on Bootstrap's float + negative-margin trick, which is exactly what
 * drifts as `em` and `px` scale apart.
 *
 * `.cms-toggle` is the kit's own switch (see the UI Kit page): the input stays
 * in the DOM for state, focus and a11y but is invisible, the slider is what is
 * seen, and the rule resets `appearance` precisely so the base checkbox rule
 * cannot repaint it. The row is a flex label with a gap, so the text can never
 * sit under the switch.
 */
@Component({
    selector: 'app-toggle-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    template: `
        <div class="form-group">
            <label class="tf__row" [for]="item().alias">
                <span class="cms-toggle">
                    <input
                        [id]="item().alias"
                        type="checkbox"
                        role="switch"
                        [formControl]="control()"
                    />
                    <span class="cms-toggle__slider"></span>
                </span>
                <span class="tf__label">{{ item().label }}</span>
            </label>
            @if (item().hint) {
                <div class="form-text text-muted">{{ item().hint }}</div>
            }
        </div>
    `,
    styles: [`
        .tf__row {
            display: inline-flex; align-items: center; gap: 8px;
            cursor: pointer; user-select: none; margin: 0;
        }
        .tf__label { font-size: .875rem; color: var(--cms-text, inherit); }
    `],
})
export class ToggleFieldComponent {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();
    control   = computed(() => this.formGroup().get(this.item().alias) as any);
}
