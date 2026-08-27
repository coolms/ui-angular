import { DialogModule } from '@angular/cdk/dialog';
import { OverlayContainer } from '@angular/cdk/overlay';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { NativeDialogService } from './native-dialog.service';

/**
 * The service's two input shapes over the REAL CDK Dialog, because what is
 * being asserted is the seam between them: one component now closes with
 * `{ value, choice }`, and `input()` has to keep resolving a bare string or
 * every existing caller silently starts naming things `[object Object]`.
 *
 * Driven through the overlay DOM rather than a mocked `Dialog` — a mock would
 * prove the service calls `open()`, which was never the risk. It also proves
 * `choices` actually reaches the component, which a spy on `open()` could
 * only assert about its own argument.
 */
describe('NativeDialogService', () => {
    let svc: NativeDialogService;
    let container: HTMLElement;

    beforeEach(() => {
        TestBed.configureTestingModule({ imports: [DialogModule] });
        svc = TestBed.inject(NativeDialogService);
        container = TestBed.inject(OverlayContainer).getContainerElement();
    });

    /**
     * Render the attached overlay. Without a `ComponentFixture` there is
     * nothing else driving change detection, and the confirm button stays
     * `[disabled]` — a click on a disabled button is a silent no-op, which
     * would look exactly like a broken promise.
     */
    function render(): void {
        TestBed.inject(ApplicationRef).tick();
    }

    function buttonLabelled(label: string): HTMLButtonElement {
        const buttons: HTMLButtonElement[] = Array.from(container.querySelectorAll('button'));
        const match = buttons.find(b => (b.textContent ?? '').trim() === label);
        if (!match) {
            throw new Error(`no button labelled "${label}" in the overlay`);
        }

        return match;
    }

    function typeName(name: string): void {
        const input = container.querySelector('#input-dialog-value') as HTMLInputElement;
        input.value = name;
        input.dispatchEvent(new Event('input'));
        render();
    }

    function pick(value: string): void {
        const select = container.querySelector('select') as HTMLSelectElement;
        select.value = value;
        select.dispatchEvent(new Event('change'));
        render();
    }

    it('input() still resolves the bare trimmed string', async () => {
        const pending = svc.input({ label: 'Template name', confirmLabel: 'Create', required: true });
        render();

        expect(container.querySelector('select')).toBeNull();

        typeName('  Invoice  ');
        buttonLabelled('Create').click();

        await expectAsync(pending).toBeResolvedTo('Invoice');
    });

    it('inputWithSelect() resolves the value AND the chosen option', async () => {
        const pending = svc.inputWithSelect({
            label: 'Template name',
            selectLabel: 'Format',
            confirmLabel: 'Create',
            required: true,
            choices: [
                { value: 'word', label: 'Word Document' },
                { value: 'spreadsheet', label: 'Spreadsheet' },
            ],
        });
        render();

        pick('spreadsheet');
        typeName('Invoice');
        buttonLabelled('Create').click();

        await expectAsync(pending).toBeResolvedTo({ value: 'Invoice', choice: 'spreadsheet' });
    });

    it('inputWithSelect() resolves null when cancelled', async () => {
        const pending = svc.inputWithSelect({
            label: 'Template name',
            confirmLabel: 'Create',
            choices: [{ value: 'word', label: 'Word Document' }],
        });
        render();

        typeName('Invoice');
        buttonLabelled('Cancel').click();

        await expectAsync(pending).toBeResolvedTo(null);
    });
});
