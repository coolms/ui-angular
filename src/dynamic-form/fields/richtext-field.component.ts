import {
    ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation,
} from '@angular/core';

import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { CoolmsEditorComponent } from '@coolms/editor-angular';
import { FieldItem } from '@coolms/core-angular';
/**
 * Dynamic-form field that renders the @coolms/editor-angular bridge for
 * `type: richtext` field configs. Mounts a `<coolms-editor>` with the
 * profile pulled from `field.dataSource.widgetOptions.profile`
 * (default 'standard') and pipes content changes back through the parent
 * FormGroup via the standard `formGroup().get(alias)` pattern the other
 * dynamic-field components use.
 *
 * Storage: plain HTML by default. Surfaces (page editor) that need a
 * different storage form pass their own ContentAdapter — but the
 * dynamic-form pipeline doesn't expose that lever today, so all richtext
 * fields driven by FormConfig speak HTML in/out for now. Backend
 * RichTextProfileValidator validates the stored HTML against the same
 * profile via App\Editor\Application\Service\ContentSanitizer.
 */
@Component({
    selector: 'app-richtext-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    imports: [ReactiveFormsModule, CoolmsEditorComponent],
    template: `
        <div class="form-group">
            <label [for]="item().alias" class="form-label">
                {{ item().label }}
                @if (item().required) { <span class="text-danger">*</span> }
            </label>

            <coolms-editor
                [profile]="profileName()"
                [content]="contentValue()"
                (contentChange)="onContentChange($event)" />

            @if (item().hint) {
                <div class="form-text text-muted">{{ item().hint }}</div>
            }
            @if (isInvalid()) {
                <div class="invalid-feedback d-block">{{ errorMessage() }}</div>
            }
        </div>
    `,
})
export class RichTextFieldComponent {
    readonly item      = input.required<FieldItem>();
    readonly formGroup = input.required<FormGroup>();

    /**
     * Profile name resolved from the field config. The Form module's YAML
     * pipeline forwards `options.profile` into the field's DataSource
     * widgetOptions block (the same channel the media-picker widget uses
     * for its bindTarget / display config). Falls back to 'standard' so a
     * misconfigured field still renders the default toolbar.
     */
    readonly profileName = computed<string>(() => {
        const opts = this.item().dataSource?.widgetOptions ?? {};
        const p = opts['profile'];
        return typeof p === 'string' && p !== '' ? p : 'standard';
    });

    /**
     * The form-control reference. Cast through `FormControl<string>` so the
     * coolms-editor's `[content]` model input receives a non-null string
     * even when the FormGroup hasn't seeded a value yet.
     */
    readonly control = computed<FormControl<string> | null>(
        () => (this.formGroup().get(this.item().alias) as FormControl<string> | null),
    );

    readonly contentValue = computed<string>(() => this.control()?.value ?? '');

    readonly isInvalid = computed<boolean>(() => {
        const c = this.control();
        return !!c && c.invalid && (c.touched || c.dirty);
    });

    readonly errorMessage = computed<string>(() => {
        const errors = this.control()?.errors ?? null;
        if (!errors) return '';
        if (errors['server'])             return errors['server'] as string;
        if (errors['DISALLOWED_WIDGET'])  return 'Some widgets are not allowed by this field\'s profile.';
        if (errors['UNKNOWN_PROFILE'])    return 'Unknown editor profile.';
        if (errors['required'])           return `${this.item().label} is required`;
        return 'Invalid value';
    });

    onContentChange(value: string): void {
        const c = this.control();
        if (!c) return;
        // Avoid an extra emission when nothing actually changed.
        if (c.value === value) return;
        c.setValue(value);
        c.markAsDirty();
    }
}
