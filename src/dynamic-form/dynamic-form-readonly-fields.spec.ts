import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { FieldItem, FormRenderDefinition } from '@coolms/core-angular';

import { DynamicFormComponent } from './dynamic-form.component';
import { FormRenderService } from './form-render.service';

/**
 * `readonlyFields` — the host's way to fix a control the form DEFINITION cannot
 * know is fixed.
 *
 * Its first caller is the settings screen, where a key the deployment pins in
 * its environment must render locked: the reader ignores a saved value for such
 * a key, so an editable control would accept an edit, report a save, and change
 * nothing. That makes "the control is actually disabled" the visible
 * half of a correctness property, not styling — which is why it is asserted
 * here rather than left to the screen that uses it.
 */
describe('DynamicFormComponent readonlyFields', () => {
    function field(alias: string, over: Partial<FieldItem> = {}): FieldItem {
        return {
            alias,
            type: 'text',
            label: alias,
            required: false,
            readonly: false,
            locked: false,
            private: false,
            validators: [],
            ...over,
        };
    }

    function definition(items: FieldItem[]): FormRenderDefinition {
        return {
            id: 'test_form',
            context: 'edit',
            layout: items.map(i => ({ type: 'field', name: i.alias })),
            items,
            actions: [],
        };
    }

    function mount(items: FieldItem[], readonlyFields: string[]): DynamicFormComponent {
        TestBed.configureTestingModule({
            imports: [DynamicFormComponent],
            providers: [
                { provide: FormRenderService, useValue: { fetch: () => of(definition(items)) } },
            ],
        });

        const fixture = TestBed.createComponent(DynamicFormComponent);
        fixture.componentRef.setInput('formId', 'test_form');
        fixture.componentRef.setInput('context', 'edit');
        fixture.componentRef.setInput('readonlyFields', readonlyFields);
        fixture.detectChanges();

        return fixture.componentInstance;
    }

    it('disables only the named controls', () => {
        const form = mount([field('ttl'), field('enabled')], ['ttl']);

        expect(form.getControl('ttl')!.disabled).toBeTrue();
        expect(form.getControl('enabled')!.disabled).toBeFalse();
    });

    it('leaves every control editable when none are named', () => {
        const form = mount([field('ttl'), field('enabled')], []);

        expect(form.getControl('ttl')!.disabled).toBeFalse();
        expect(form.getControl('enabled')!.disabled).toBeFalse();
    });

    it('adds to the definition rather than replacing it', () => {
        // A field the definition already calls readonly stays readonly even
        // though the host named a different one.
        const form = mount([field('id', { readonly: true }), field('ttl')], ['ttl']);

        expect(form.getControl('id')!.disabled).toBeTrue();
        expect(form.getControl('ttl')!.disabled).toBeTrue();
    });

    it('ignores a name no field carries', () => {
        const form = mount([field('ttl')], ['not_a_field']);

        expect(form.getControl('ttl')!.disabled).toBeFalse();
        expect(form.getControl('not_a_field')).toBeNull();
    });

    /**
     *  **A `number` field must submit a NUMBER, and for a long time it did not.**
     *
     * Angular's `NumberValueAccessor` has the selector `input[type=number]`,
     * matched at COMPILE time against the static template — and this form binds
     * `[type]="item().type"`, so it can never match and the default STRING
     * accessor is used. Every numeric field this form rendered therefore
     * submitted `"300"`.
     *
     * Invisible for as long as nothing checked: a settings row storing `"300"`
     * where the module reads `is_int()` saves, reads back, and is silently
     * discarded. It surfaced only when a write validation refused the mismatch
     * out loud, on a real screen.
     */
    it('submits a declared number field as a number, not the string the DOM gives', () => {
        const form = mount([field('ttl', { type: 'number' }), field('label')], []);
        form.getControl('ttl')!.setValue('60');
        form.getControl('label')!.setValue('300');

        let emitted: Record<string, unknown> | null = null;
        form.submitted.subscribe(v => (emitted = v));
        form.submit();

        expect(emitted!['ttl']).toBe(60);
        // A text field that happens to hold digits stays a string: the DECLARED
        // type decides, not the content.
        expect(emitted!['label']).toBe('300');
    });

    it('submits an emptied number field as null rather than zero', () => {
        // An operator who cleared a box did not ask for zero. Whether the key may
        // be cleared at all is the server's decision, not this component's.
        const form = mount([field('ttl', { type: 'number' })], []);
        form.getControl('ttl')!.setValue('');

        let emitted: Record<string, unknown> | null = null;
        form.submitted.subscribe(v => (emitted = v));
        form.submit();

        expect(emitted!['ttl']).toBeNull();
    });

    it('leaves an unparseable number alone so validation can report it', () => {
        // Coercing to NaN would turn a value someone can see into one nothing can
        // explain.
        const form = mount([field('ttl', { type: 'number' })], []);
        form.getControl('ttl')!.setValue('not a number');

        let emitted: Record<string, unknown> | null = null;
        form.submitted.subscribe(v => (emitted = v));
        form.submit();

        expect(emitted!['ttl']).toBe('not a number');
    });

    /**
     *  Documents the sharp edge rather than asserting a wish: Angular reports
     * a DISABLED control in `getRawValue()`, which is what {@link DynamicFormComponent.submit}
     * emits. So disabling is NOT enough to keep a value out of the payload, and a
     * host that must not send it drops it itself — see `withoutPinnedKeys` in the
     * settings feature. If this ever starts failing, that stripping is redundant
     * and should go, not be duplicated.
     */
    it('still SUBMITS a disabled control, which is why hosts must strip', () => {
        const form = mount([field('ttl'), field('enabled')], ['ttl']);

        let emitted: Record<string, unknown> | null = null;
        form.submitted.subscribe(v => (emitted = v));
        form.submit();

        expect(Object.keys(emitted!)).toContain('ttl');
    });
});
