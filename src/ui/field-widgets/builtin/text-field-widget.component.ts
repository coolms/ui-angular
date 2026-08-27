import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Built-in `text` field widget — a single-line text input over the field-widget
 * registry's {@link import('../field-widget-registry').FieldWidgetInputs}
 * callback contract. The default widget: a field with no richer module widget
 * resolves here, so every field-panel input goes through the registry rather
 * than a hardcoded `@switch` branch.
 */
@Component({
    selector: 'app-text-field-widget',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <input class="cms-input cms-input-sm" type="text"
               [disabled]="disabled()"
               [ngModel]="model()"
               [ngModelOptions]="{ standalone: true }"
               (ngModelChange)="emit($event)" />
    `,
})
export class TextFieldWidgetComponent {
    readonly value = input<unknown>();
    readonly config = input<Record<string, unknown>>({});
    readonly disabled = input(false);
    readonly valueChange = input<(value: unknown) => void>(() => {});

    readonly model = computed(() => {
        const v = this.value();
        return v == null ? '' : String(v);
    });

    emit(value: string): void {
        this.valueChange()(value);
    }
}
