import { Component, input, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';

import { FormGroup } from '@angular/forms';
import { FieldItem } from '@coolms/core-angular';
import { TextFieldComponent }         from './fields/text-field.component';
import { SelectFieldComponent }       from './fields/select-field.component';
import { ToggleFieldComponent }       from './fields/toggle-field.component';
import { ColorFieldComponent }        from './fields/color-field.component';
import { DateFieldComponent }         from './fields/date-field.component';
import { HiddenFieldComponent }       from './fields/hidden-field.component';
import { RelationFieldComponent }     from './fields/relation-field.component';
import { TokenPatternFieldComponent } from './fields/token-pattern-field.component';
import { RichTextFieldComponent }     from './fields/richtext-field.component';
import { LocalizedTextFieldComponent } from './fields/localized-text-field.component';
import { OptionsEditorFieldComponent } from './fields/options-editor-field.component';
import { IntlPhoneFieldComponent }     from './fields/intl-phone-field.component';
import { RegistryFieldComponent } from './fields/registry-field.component';

@Component({
    selector: 'app-dynamic-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    imports: [
    TextFieldComponent,
    SelectFieldComponent,
    ToggleFieldComponent,
    ColorFieldComponent,
    DateFieldComponent,
    HiddenFieldComponent,
    RelationFieldComponent,
    TokenPatternFieldComponent,
    RichTextFieldComponent,
    LocalizedTextFieldComponent,
    OptionsEditorFieldComponent,
    IntlPhoneFieldComponent,
    RegistryFieldComponent
],
    template: `
        @switch (item().type) {
            @case ('text')          { <app-text-field          [item]="item()" [formGroup]="formGroup()" /> }
            @case ('email')         { <app-text-field          [item]="item()" [formGroup]="formGroup()" /> }
            @case ('password')      { <app-text-field          [item]="item()" [formGroup]="formGroup()" /> }
            @case ('number')        { <app-text-field          [item]="item()" [formGroup]="formGroup()" /> }
            @case ('textarea')      { <app-text-field          [item]="item()" [formGroup]="formGroup()" /> }
            @case ('select')        { <app-select-field        [item]="item()" [formGroup]="formGroup()" /> }
            @case ('toggle')        { <app-toggle-field        [item]="item()" [formGroup]="formGroup()" /> }
            @case ('color')         { <app-color-field         [item]="item()" [formGroup]="formGroup()" /> }
            @case ('date')          { <app-date-field          [item]="item()" [formGroup]="formGroup()" /> }
            @case ('time')          { <app-date-field          [item]="item()" [formGroup]="formGroup()" /> }
            @case ('hidden')        { <app-hidden-field        [item]="item()" [formGroup]="formGroup()" /> }
            @case ('relation')      { <app-relation-field      [item]="item()" [formGroup]="formGroup()" /> }
            @case ('token-pattern') { <app-token-pattern-field [item]="item()" [formGroup]="formGroup()" /> }
            @case ('richtext')      { <app-richtext-field      [item]="item()" [formGroup]="formGroup()" /> }
            @case ('localizedText')     { <app-localized-text-field [item]="item()" [formGroup]="formGroup()" /> }
            @case ('localizedTextarea') { <app-localized-text-field [item]="item()" [formGroup]="formGroup()" [multiline]="true" /> }
            @case ('optionsEditor')     { <app-options-editor-field [item]="item()" [formGroup]="formGroup()" /> }
            @case ('intlPhone')         { <app-intl-phone-field     [item]="item()" [formGroup]="formGroup()" /> }
            @default {
                <!-- Fall through to the shared field-widget registry: a module
                     widget (e.g. tags / taxonomy) renders here; otherwise the
                     component shows the "not yet supported" notice itself. -->
                <app-registry-field [item]="item()" [formGroup]="formGroup()" />
            }
        }
        @if (item().security?.write?.length && item().readonly) {
            <span class="text-warning ms-1" title="You don't have permission to edit this field">
                🔒
            </span>
        }
    `,
})
export class DynamicFieldComponent {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();
}
