import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { FieldItem } from '@coolms/core-angular';
/**
 * Colour input: a native swatch picker beside the hex it produces.
 *
 * Two controls over ONE form value, because neither alone is enough. The
 * picker cannot express "no value" — `<input type="color">` has no empty
 * state and reports #000000 when unset — and a bare text box makes choosing a
 * colour a typing exercise. So the swatch writes into the same control the
 * text field edits, and Clear is what actually empties it.
 *
 * An empty value is meaningful rather than missing: for the admin accent it
 * means "no personal override, use the deployment's colour", which is a
 * different state from picking a colour that happens to match it.
 */
@Component({
    selector: 'app-color-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    template: `
        <div class="form-group">
            <label [for]="item().alias" class="cms-label">{{ item().label }}</label>

            <div class="color-field">
                <input
                    type="color"
                    class="color-field__swatch"
                    [attr.aria-label]="item().label + ' picker'"
                    [value]="swatchValue()"
                    (input)="pick($any($event.target).value)"
                />
                <input
                    [id]="item().alias"
                    type="text"
                    class="cms-input color-field__hex"
                    placeholder="#F5A623"
                    spellcheck="false"
                    autocomplete="off"
                    [formControl]="control()"
                />
                @if (control().value) {
                    <button type="button" class="cms-btn cms-btn-sm" (click)="clear()">Clear</button>
                }
            </div>

            @if (item().hint) {
                <div class="cms-field-hint">{{ item().hint }}</div>
            }
        </div>
    `,
    styles: [`
        .color-field { display: flex; align-items: center; gap: 8px; }
        /* Two classes deep on purpose. The wrapper is a form-group, so the
           kit's own rule for a text input inside one — which sets width 100% —
           applies here too, and being a class PLUS an element it outranks a
           single-class rule of mine. The hex box stretched the full panel
           width until this was nested. NO BACKTICKS IN HERE. */
        .color-field .color-field__hex { width: 11ch; flex: 0 0 auto; font-family: var(--cms-font-mono); }
        .color-field__swatch {
            width: 34px;
            height: 30px;
            padding: 2px;
            flex: 0 0 auto;
            border: 1px solid var(--cms-btn-border);
            border-radius: var(--cms-radius);
            background: var(--cms-input-bg);
            cursor: pointer;
        }
    `],
})
export class ColorFieldComponent {
    /** What the swatch shows when the field is empty — it cannot show nothing. */
    private static readonly FALLBACK = '#f5a623';

    readonly item = input.required<FieldItem>();
    readonly formGroup = input.required<FormGroup>();

    readonly control = computed(() => this.formGroup().get(this.item().alias) as FormControl<string | null>);

    /**
     * The picker only accepts a full `#rrggbb`. Feeding it a half-typed value
     * makes it silently snap to black, which then looks like the user's choice
     * the moment they touch the swatch — so anything invalid shows the fallback
     * instead, and the text control keeps whatever they are typing.
     */
    readonly swatchValue = computed(() => {
        const v = this.control()?.value;

        return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : ColorFieldComponent.FALLBACK;
    });

    pick(value: string): void {
        this.control().setValue(value.toLowerCase());
        this.control().markAsDirty();
    }

    clear(): void {
        this.control().setValue(null);
        this.control().markAsDirty();
    }
}
