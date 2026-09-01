import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    signal,
    ViewEncapsulation,
} from '@angular/core';

import { FormGroup } from '@angular/forms';
import { FieldItem } from '@coolms/core-angular';
import { LocaleFieldComponent } from '../../ui/locale-selector.component';

/**
 * Reusable localized-text widget for the dynamic form: a single text/textarea
 * input with a per-locale (EN / UK / …) tab switcher. The form control's value
 * is a FLAT `{ [locale]: string }` map, mirroring the backend `LocalizedTextType`.
 *
 * Locales come from the API manifest (via {@link LocaleFieldComponent}); the
 * switcher shows one locale at a time and edits its slot in the map, leaving
 * the others untouched. Untouched / single-locale deployments collapse to a
 * plain input.
 *
 * This is the FE half of the "localized text" form type. It is
 * persistence-agnostic — the `{en,uk}` map is just the control value; where it
 * lands (entity `extras`, a catalogue, …) is the consuming form's concern.
 */
@Component({
    selector: 'app-localized-text-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    imports: [LocaleFieldComponent],
    template: `
        <div class="form-group localized-text-field">
            <app-locale-field [label]="labelWithRequired()" [(activeLocale)]="activeLocale">
                @if (multiline()) {
                    <textarea
                        class="form-control"
                        rows="3"
                        [placeholder]="item().placeholder ?? ''"
                        [value]="valueFor(activeLocale())"
                        (input)="setValue(activeLocale(), $any($event.target).value)"
                    ></textarea>
                } @else {
                    <input
                        class="form-control cms-input"
                        type="text"
                        [placeholder]="item().placeholder ?? ''"
                        [value]="valueFor(activeLocale())"
                        (input)="setValue(activeLocale(), $any($event.target).value)"
                    />
                }
            </app-locale-field>

            @if (item().hint) {
                <div class="form-text text-muted">{{ item().hint }}</div>
            }
        </div>
    `,
})
export class LocalizedTextFieldComponent {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();

    /** Active locale tab; the LocaleFieldComponent seeds/updates it. */
    activeLocale = signal('en');

    /**
     * Render a textarea instead of a single-line input. Set true for the
     * `localizedTextarea` field type (the dynamic-field switch binds it); the
     * i18n mirror of plain `text` vs `textarea`. Default single-line.
     */
    multiline = input<boolean>(false);

    labelWithRequired = computed(() =>
        this.item().required ? `${this.item().label} *` : this.item().label,
    );

    private readonly control = computed(() => this.formGroup().get(this.item().alias));

    /** Read the control value as a `{locale: string}` map, tolerant of legacy scalars. */
    private map(): Record<string, string> {
        const v = this.control()?.value;
        return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {};
    }

    valueFor(locale: string): string {
        return this.map()[locale] ?? '';
    }

    setValue(locale: string, text: string): void {
        const c = this.control();
        if (!c) return;
        c.setValue({ ...this.map(), [locale]: text });
        c.markAsDirty();
    }
}
