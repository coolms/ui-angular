import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { Store } from '@ngxs/store';

import { SelectFieldComponent } from './select-field.component';
import { DataSourceDefinition, FieldItem } from '@coolms/core-angular';
/**
 * Two things this component has to get right that a screenshot would not tell
 * you, and that nothing covered until a settings form ran into both.
 *
 * **A null control must still LOOK like a dropdown.** Angular resolves a value
 * with no matching option to the literal string "null", so a fresh form's select
 * had selectedIndex -1 — which Chrome paints as an empty box: no placeholder, no
 * chevron, no hint that it opens. The options were all there and the field was
 * fully usable; it just read as a broken text input. Every native select in the
 * dynamic form was affected, which is why the assertion here is on
 * selectedIndex, not on the option list.
 *
 * **A multi-value picker has to scale past a handful.** A native list box is
 * fine for five options and unusable for two hundred and fifty, which is what a
 * phone-country allow-list is. The searchable picker is opt-in so existing
 * multi-selects keep their shape — and that opt-in is what these pin.
 */
describe('SelectFieldComponent', () => {
    function item(ds: Partial<DataSourceDefinition> = {}, over: Partial<FieldItem> = {}): FieldItem {
        return {
            alias: 'pick',
            type: 'select',
            label: 'Pick',
            required: false,
            readonly: false,
            locked: false,
            private: false,
            validators: [],
            dataSource: {
                type: 'static',
                bindValue: 'value',
                bindLabel: 'label',
                multiple: false,
                widget: 'select',
                loading: 'eager',
                options: [
                    { value: 'email', label: 'Email' },
                    { value: 'phone', label: 'Phone' },
                ],
                ...ds,
            } as DataSourceDefinition,
            ...over,
        } as FieldItem;
    }

    let fixture: ComponentFixture<SelectFieldComponent>;
    let http: HttpTestingController;

    function render(field: FieldItem, initial: unknown = null): HTMLElement {
        fixture = TestBed.createComponent(SelectFieldComponent);
        fixture.componentRef.setInput('item', field);
        fixture.componentRef.setInput('formGroup', new FormGroup({ pick: new FormControl(initial) }));
        fixture.detectChanges();

        return fixture.nativeElement as HTMLElement;
    }

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(withXhr()),
                provideHttpClientTesting(),
                { provide: Store, useValue: { selectSnapshot: () => null } },
            ],
        });

        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('shows the placeholder as the selected option when nothing is set', () => {
        const el = render(item());

        const select = el.querySelector('select');
        expect(select).not.toBeNull();
        // -1 is the bug: a select with no selected option paints as an empty box.
        expect(select!.selectedIndex).toBe(0);
        expect(select!.options[0].textContent?.trim()).toBe('— Select —');
    });

    it('selects the saved value when there is one', () => {
        const el = render(item(), 'phone');

        const select = el.querySelector('select');
        expect(select!.value).toBe('phone');
        expect(select!.options[select!.selectedIndex]?.textContent?.trim()).toBe('Phone');
    });

    it('renders the searchable picker for a multi-select that asks for one', () => {
        const el = render(item({ multiple: true, widget: 'select-search' }));

        expect(el.querySelector('app-multi-option-select')).not.toBeNull();
        expect(el.querySelector('select')).toBeNull();
    });

    it('leaves a plain multi-select on the native list box', () => {
        // Opt-in, so nothing that already used `multiple` changes shape.
        const el = render(item({ multiple: true }));

        expect(el.querySelector('app-multi-option-select')).toBeNull();
        expect(el.querySelector('select')?.multiple).toBeTrue();
    });

    it('shows a native multi-select the value it was given', () => {
        // The attribute was never the problem -- a sibling test already asserts
        // select.multiple is true, and it passed throughout. Angular chooses a
        // control-value accessor by matching the template at COMPILE time, and
        // the multi-value one is selected by select[multiple], a STATIC
        // attribute. While this element carried [attr.multiple] the accessor
        // never matched, the single-value one handled the control, and it
        // cannot write an array: a saved list rendered as nothing selected, and
        // saving that box would have cleared it. Presence of the attribute is
        // not the same as the value arriving.
        const el = render(item({ multiple: true }), ['email', 'phone']);
        const select = el.querySelector('select') as HTMLSelectElement;

        expect(select.multiple).toBeTrue();
        // The LABELS, because Angular rewrites option.value to its own
        // id-tagged form ("0: 'email'") for a multi-select. What the operator
        // reads is the label, and the control keeps the clean values.
        expect([...select.selectedOptions].map(o => o.textContent?.trim())).toEqual(['Email', 'Phone']);
    });

    it('shows a native multi-select a partial selection without inventing the rest', () => {
        const el = render(item({ multiple: true }), ['phone']);
        const select = el.querySelector('select') as HTMLSelectElement;

        expect([...select.selectedOptions].map(o => o.textContent?.trim())).toEqual(['Phone']);
    });

    it('offers a native multi-select no placeholder row to pick', () => {
        // Selecting nothing is how a multi-select says "none"; a null row would
        // be a value the control could actually hold.
        const el = render(item({ multiple: true }), []);
        const options = [...el.querySelectorAll('option')].map(o => o.textContent?.trim());

        expect(options).toEqual(['Email', 'Phone']);
    });

    it('writes the picker selection back as a plain array', () => {
        const field = item({ multiple: true, widget: 'select-search' });
        render(field, []);

        fixture.componentInstance.onMultiValues(Object.freeze(['BY', 'PL']));

        const value: unknown = fixture.componentInstance.control().value;
        expect(value).toEqual(['BY', 'PL']);
        // Copied, not the frozen array the picker emitted: this lands in a form
        // control that later readers will treat as mutable.
        expect(Object.isFrozen(value)).toBeFalse();
    });

    it('shows the picker the selection it just made, and the one it was given', () => {
        // A FormControl's value is not reactive. Read through a computed, this
        // is calculated once and never again: the picker takes a click, emits
        // it, and redraws itself EMPTY — the selection is in the form and
        // invisible on screen, which reads as "the click did nothing".
        const field = item({ multiple: true, widget: 'select-search' });
        render(field, ['BY']);

        expect(fixture.componentInstance.selectedValues()).toEqual(['BY']);

        fixture.componentInstance.onMultiValues(['BY', 'PL']);
        expect(fixture.componentInstance.selectedValues()).toEqual(['BY', 'PL']);

        // And a patch from the host form (a Reset, or the initial value landing
        // late) has to reach it too.
        fixture.componentInstance.control().setValue(['DE']);
        expect(fixture.componentInstance.selectedValues()).toEqual(['DE']);
    });
});
