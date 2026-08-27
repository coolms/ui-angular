import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    input,
    signal,
    ViewEncapsulation,
} from '@angular/core';

import { FormGroup } from '@angular/forms';
import { Store } from '@ngxs/store';
import { CoolmsEditorComponent } from '@coolms/editor-angular';
import { FieldItem, AppConfigState } from '@coolms/core-angular';
import { LocaleFieldComponent } from '../../ui/locale-selector.component';

/**
 * Capability-aware localized rich-text field: one value per locale (EN / UK / …)
 * with a per-locale editor that **progressively enhances**. When the Editor
 * module is installed (its profile is advertised in `manifest.editor.profiles`)
 * the active locale renders a `<coolms-editor>`; otherwise it degrades to a
 * plain textarea — same field, same `{ locale: string }` value, no hard
 * dependency on the Editor backend at runtime.
 *
 * The value is a FLAT `{ locale: string }` map (HTML when the editor is mounted,
 * plain text when degraded) — identical in shape to {@link LocalizedTextFieldComponent},
 * so a consuming form can swap textarea ↔ rich without touching its data wiring.
 *
 * Profile comes from `item.dataSource.widgetOptions.profile` (default `comment`,
 * a lightweight inline profile). If the Editor module is present but that profile
 * is unknown, the field degrades to a textarea rather than rendering an
 * UNKNOWN_PROFILE error — the safe direction.
 */
@Component({
    selector: 'app-localized-rich-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    imports: [LocaleFieldComponent, CoolmsEditorComponent],
    template: `
        <div class="form-group localized-rich-field">
            <app-locale-field [label]="labelWithRequired()" [(activeLocale)]="activeLocale">
                @if (editorAvailable()) {
                    <coolms-editor
                        [profile]="profileName()"
                        [content]="valueFor(activeLocale())"
                        (contentChange)="setValue(activeLocale(), $event)" />
                } @else {
                    <textarea
                        class="form-control cms-input"
                        rows="4"
                        [placeholder]="item().placeholder ?? ''"
                        [value]="valueFor(activeLocale())"
                        (input)="setValue(activeLocale(), $any($event.target).value)"
                    ></textarea>
                }
            </app-locale-field>

            @if (item().hint) {
                <div class="form-text text-muted">{{ item().hint }}</div>
            }
        </div>
    `,
})
export class LocalizedRichFieldComponent {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();

    /** Active locale tab; the LocaleFieldComponent seeds/updates it. */
    activeLocale = signal('en');

    private readonly store = inject(Store);

    /** Editor profiles advertised by the manifest — empty when the Editor module is absent. */
    private readonly editorProfiles =
        this.store.selectSnapshot(AppConfigState.manifest)?.editor?.profiles ?? {};

    /** Profile name for this field; `comment` is a sensible lightweight default. */
    readonly profileName = computed<string>(() => {
        const p = this.item().dataSource?.widgetOptions?.['profile'];
        return typeof p === 'string' && p !== '' ? p : 'comment';
    });

    /** True only when the Editor module is installed AND knows this profile. */
    readonly editorAvailable = computed<boolean>(() => this.profileName() in this.editorProfiles);

    readonly labelWithRequired = computed(() =>
        this.item().required ? `${this.item().label} *` : this.item().label,
    );

    private readonly control = computed(() => this.formGroup().get(this.item().alias));

    /** Read the control value as a `{ locale: string }` map, tolerant of legacy scalars. */
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
        if (this.map()[locale] === text) return; // no-op guard (the editor re-emits on focus churn)
        c.setValue({ ...this.map(), [locale]: text });
        c.markAsDirty();
    }
}
