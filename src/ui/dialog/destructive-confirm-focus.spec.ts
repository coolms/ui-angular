import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { DeleteNodeDialogComponent, type DeleteNodeDialogResult } from './delete-node-dialog.component';
import { ConfirmDialogComponent } from './confirm-dialog.component';

/**
 * A confirmation of what cannot be undone opens with Cancel focused (2026-10-14): Enter or Space then cancels, and a
 * second Del confirms nothing. The focus is the dialog's own -- CDK's focus trap reads `cdkFocusInitial` -- so every
 * caller gets it without passing anything.
 */
describe('Destructive confirmations open with Cancel focused', () => {
    let dialog: Dialog;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        dialog = TestBed.inject(Dialog);
    });

    afterEach(() => dialog.closeAll());

    /** The focus trap focuses after render; let it. */
    async function settled(): Promise<void> {
        TestBed.inject(ApplicationRef).tick();
        await new Promise(resolve => setTimeout(resolve, 50));
        TestBed.inject(ApplicationRef).tick();
    }

    function focusedText(): string {
        return (document.activeElement?.textContent ?? '').trim();
    }

    it('the delete dialog: Cancel is focused, and a second Del confirms nothing', async () => {
        const ref = dialog.open<DeleteNodeDialogResult | null>(DeleteNodeDialogComponent, {
            data: { name: 'a.png', message: 'This action cannot be undone.' },
        });
        let result: DeleteNodeDialogResult | null | undefined = undefined;
        let closed = false;
        ref.closed.subscribe(r => { result = r; closed = true; });
        await settled();

        expect(focusedText()).withContext('the focused element').toBe('Cancel');

        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
        await settled();
        expect(closed).withContext('a second Del closed the dialog').toBeFalse();
        expect(result).toBeUndefined();
    });

    it('the shared confirm with danger: Cancel is focused', async () => {
        dialog.open(ConfirmDialogComponent, {
            data: { title: 'Delete "a.png"?', message: 'This action cannot be undone.', confirmLabel: 'Delete', cancelLabel: 'Cancel', danger: true },
        });
        await settled();
        expect(focusedText()).toBe('Cancel');
    });

    it('the shared confirm without danger keeps the dialog\'s ordinary first focus (not forced to Cancel)', async () => {
        dialog.open(ConfirmDialogComponent, {
            data: { title: 'Continue?', message: '', confirmLabel: 'OK', cancelLabel: 'Cancel', danger: false },
        });
        await settled();
        expect(document.activeElement?.hasAttribute('cdkfocusinitial') ?? false).toBeFalse();
    });
});
