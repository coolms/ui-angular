import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';

import { InputDialogComponent } from './input-dialog.component';
import type { InputDialogContentData } from './input-dialog.component';

/**
 * The optional select that turns the name prompt into "name it AND classify
 * it" in one dialog.
 *
 * What can go wrong here is the WIRING, not the markup: a select that renders
 * but never reaches the close payload, or a payload shape that quietly breaks
 * the plain `input()` callers. Both are asserted on what the dialog CLOSES
 * with, because that is the only thing a caller ever sees.
 */
describe('InputDialogComponent', () => {
    const BASE: InputDialogContentData = {
        title:         'New Template',
        label:         'Template name',
        placeholder:   'Invoice',
        initialValue:  '',
        confirmLabel:  'Create',
        cancelLabel:   'Cancel',
        required:      true,
        validator:     null,
        choices:       [],
        selectLabel:   '',
        initialChoice: null,
        multiline:     false,
    };

    function build(overrides: Partial<InputDialogContentData> = {}) {
        const close = jasmine.createSpy('close');

        TestBed.configureTestingModule({
            imports: [InputDialogComponent],
            providers: [
                { provide: DIALOG_DATA, useValue: { ...BASE, ...overrides } },
                { provide: DialogRef, useValue: { close } },
            ],
        });

        const fixture = TestBed.createComponent(InputDialogComponent);
        fixture.detectChanges();

        return { fixture, close };
    }

    type Fixture = ReturnType<typeof build>['fixture'];

    /**
     * Found by LABEL, never by index. Adding the select above the input
     * shifts nothing in the button row today, but `querySelectorAll('button')[n]`
     * has already turned a "click save" into a "click cancel" once in this
     * codebase — position is not identity.
     */
    function buttonLabelled(fixture: Fixture, label: string): HTMLButtonElement {
        const buttons: HTMLButtonElement[] = Array.from(
            fixture.nativeElement.querySelectorAll('button'),
        );
        const match = buttons.find(b => (b.textContent ?? '').trim() === label);
        if (!match) {
            throw new Error(`no button labelled "${label}" rendered`);
        }

        return match;
    }

    function typeName(fixture: Fixture, name: string): void {
        const input: HTMLInputElement = fixture.nativeElement.querySelector('#input-dialog-value');
        input.value = name;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
    }

    function pick(fixture: Fixture, value: string): void {
        const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
        select.value = value;
        select.dispatchEvent(new Event('change'));
        fixture.detectChanges();
    }

    it('renders no select and reports no choice when none are offered', () => {
        const { fixture, close } = build();

        expect(fixture.nativeElement.querySelector('select')).toBeNull();

        typeName(fixture, 'Invoice');
        buttonLabelled(fixture, 'Create').click();

        expect(close).toHaveBeenCalledWith({ value: 'Invoice', choice: null });
    });

    /**
     * `ngModel` writes the select's DOM value in a MICROTASK, not during the
     * `detectChanges()` that created it — so an assertion on `select.value`
     * taken straight after render reads `''` no matter what is bound. The
     * component's `choice` is already correct at that point; only the DOM
     * lags. Settle before looking at it.
     */
    async function settle(fixture: Fixture): Promise<void> {
        await fixture.whenStable();
        fixture.detectChanges();
    }

    it('renders one option per choice and preselects the first', async () => {
        const { fixture } = build({
            selectLabel: 'Format',
            choices: [
                { value: 'word', label: 'Word Document' },
                { value: 'spreadsheet', label: 'Spreadsheet' },
            ],
        });
        await settle(fixture);

        const options: HTMLOptionElement[] = Array.from(
            fixture.nativeElement.querySelectorAll('option'),
        );
        expect(options.map(o => o.value)).toEqual(['word', 'spreadsheet']);
        expect(options.map(o => (o.textContent ?? '').trim())).toEqual(['Word Document', 'Spreadsheet']);

        // A select whose initial state is "nothing picked" makes the confirm
        // button lie about what it will do.
        expect(fixture.nativeElement.querySelector('select').value).toBe('word');
    });

    it('closes with the option the operator picked', () => {
        const { fixture, close } = build({
            selectLabel: 'Format',
            choices: [
                { value: 'word', label: 'Word Document' },
                { value: 'spreadsheet', label: 'Spreadsheet' },
            ],
        });

        pick(fixture, 'spreadsheet');
        typeName(fixture, 'Invoice');
        buttonLabelled(fixture, 'Create').click();

        expect(close).toHaveBeenCalledWith({ value: 'Invoice', choice: 'spreadsheet' });
    });

    it('honours an explicit initialChoice over the first option', async () => {
        const { fixture, close } = build({
            selectLabel: 'Format',
            choices: [
                { value: 'word', label: 'Word Document' },
                { value: 'spreadsheet', label: 'Spreadsheet' },
            ],
            initialChoice: 'spreadsheet',
        });
        await settle(fixture);

        expect(fixture.nativeElement.querySelector('select').value).toBe('spreadsheet');

        typeName(fixture, 'Invoice');
        buttonLabelled(fixture, 'Create').click();

        expect(close).toHaveBeenCalledWith({ value: 'Invoice', choice: 'spreadsheet' });
    });

    /**
     * An `<input>` is single-line by definition, so a caller asking for one
     * item per line got a field that silently joined them — and whose own
     * "New\nOpen\nClosed" placeholder rendered as one run-on word. Found in a
     * browser; no spec had reason to look at which element it was.
     */
    it('renders a textarea when the value is multi-line', () => {
        const { fixture } = build({ multiline: true });

        expect(fixture.nativeElement.querySelector('textarea')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('input[type="text"]')).toBeNull();
    });

    /** The default is unchanged, which is what keeps every existing caller working. */
    it('renders a single-line input by default', () => {
        const { fixture } = build();

        expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
        expect(fixture.nativeElement.querySelector('input[type="text"]')).not.toBeNull();
    });

    /** Enter inserts a newline in a paragraph; it must not submit the dialog. */
    it('does not submit on Enter while multi-line', () => {
        const { fixture, close } = build({ multiline: true });

        const area: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
        area.value = 'New\nOpen';
        area.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        expect(close).not.toHaveBeenCalled();
    });

    it('cancels with null rather than a half-filled result', () => {
        const { fixture, close } = build({
            selectLabel: 'Format',
            choices: [{ value: 'word', label: 'Word Document' }],
        });

        typeName(fixture, 'Invoice');
        buttonLabelled(fixture, 'Cancel').click();

        expect(close).toHaveBeenCalledWith(null);
    });
});
