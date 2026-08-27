import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Built-in `checkbox` field widget — a Bootstrap switch over the field-widget
 * registry's {@link import('../field-widget-registry').FieldWidgetInputs}
 * callback contract. A field declared `type: checkbox` (e.g. the SEO
 * `noindex` flag) resolves here; without it the registry has no boolean
 * widget, so such a field falls back to the `text` widget and renders as a
 * free-text box (the bug this closes).
 *
 * The host (content field-panels) already renders the field label above the
 * widget, so this renders only the switch. Emits a plain `boolean`; coerces an
 * incoming string/number/null value to a checked state so a value stored as
 * `"true"`/`1` still reflects.
 */
@Component({
    selector: 'app-checkbox-field-widget',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" role="switch"
                   [disabled]="disabled()"
                   [ngModel]="model()"
                   [ngModelOptions]="{ standalone: true }"
                   (ngModelChange)="emit($event)" />
        </div>
    `,
})
export class CheckboxFieldWidgetComponent {
    readonly value = input<unknown>();
    readonly config = input<Record<string, unknown>>({});
    readonly disabled = input(false);
    readonly valueChange = input<(value: unknown) => void>(() => {});

    readonly model = computed(() => {
        const v = this.value();
        if (typeof v === 'boolean') {
            return v;
        }
        if (typeof v === 'string') {
            return v === 'true' || v === '1';
        }
        if (typeof v === 'number') {
            return v !== 0;
        }
        return false;
    });

    emit(checked: boolean): void {
        this.valueChange()(checked);
    }
}
