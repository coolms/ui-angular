import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Built-in `textarea` field widget — a multi-line text input over the
 * field-widget registry's {@link import('../field-widget-registry').FieldWidgetInputs}
 * callback contract.
 */
@Component({
    selector: 'app-textarea-field-widget',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <textarea class="cms-input cms-input-sm" rows="2"
                  [disabled]="disabled()"
                  [ngModel]="model()"
                  [ngModelOptions]="{ standalone: true }"
                  (ngModelChange)="emit($event)"></textarea>
    `,
    styles: [`textarea { resize: vertical; width: 100%; }`],
})
export class TextareaFieldWidgetComponent {
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
