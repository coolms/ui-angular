import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DateTimeFieldComponent } from '../../range-picker';

/**
 * Built-in `date` field widget — a date input (no time) over the field-widget
 * registry's {@link import('../field-widget-registry').FieldWidgetInputs}
 * callback contract. Wraps the shared {@link DateTimeFieldComponent} (which
 * respects the user's date-format preference), so the registry path renders the
 * exact same picker the content field-panels' old hardcoded `date` case did.
 */
@Component({
    selector: 'app-date-field-widget',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DateTimeFieldComponent],
    template: `
        <app-datetime-field [withTime]="false"
                            [disabled]="disabled()"
                            [value]="model()"
                            (valueChange)="emit($event)" />
    `,
})
export class DateFieldWidgetComponent {
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
