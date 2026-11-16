import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { NaviGraphNode, ErrorHandlerService } from '@coolms/core-angular';
import { ContextMenuItem, ContextMenuService, UNWORDED_REASON } from './context-menu.service';

/**
 * The right-click menu reads a node's `capability` as the toolbar does (capability-state.ts):
 * the same node is one declaration on two surfaces, and they must not disagree about it. The visibility
 * evaluator runs for real; only the click event is synthetic.
 */
function node(path: string, meta: Record<string, unknown>): NaviGraphNode {
    return {
        id:        path,
        path,
        title:     'Title for ' + path,
        parentId:  null,
        sortOrder: 0,
        isActive:  true,
        isVisible: true,
        meta,
        children:  [],
    } as NaviGraphNode;
}

describe('ContextMenuService capability state', () => {
    function itemsFor(record: Record<string, unknown>): ContextMenuItem[] {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                { provide: HttpClient, useValue: {} },
                { provide: Router, useValue: {} },
                { provide: ErrorHandlerService, useValue: {} },
                { provide: Store, useValue: { selectSnapshot: () => null } },
            ],
        });
        const svc = TestBed.inject(ContextMenuService);
        svc.openFromNodes(
            new MouseEvent('contextmenu', { clientX: 10, clientY: 20 }),
            [
                node('/chmod', { action: 'VfsChmod', capability: 'vfs.node.chmod' }),
                node('/open', { action: 'VfsOpen' }),
            ],
            record,
            () => undefined,
        );

        return svc.menu()?.items ?? [];
    }

    it('disables a denied item and keeps it in the menu', () => {
        const [chmod] = itemsFor({ _capabilities: { 'vfs.node.chmod': 'denied' } });

        expect(chmod.id).toBe('VfsChmod');
        expect(chmod.disabled).toBe(true);
        expect(chmod.locked).toBeUndefined();
        expect(chmod.refusal).toBe('not allowed');
    });

    it('says on a denied item how many of the selection refuse it', () => {
        const [chmod, open] = itemsFor({
            _capabilities:       { 'vfs.node.chmod': 'denied' },
            _capabilityRefusals: { 'vfs.node.chmod': { refused: 3, of: 4 } },
        });

        expect(chmod.disabled).toBe(true);
        expect(chmod.refusal).toBe('not allowed for 3 of 4 selected items');
        expect(open.refusal).toBeUndefined();
    });

    it('locks an item allowed once elevated, and leaves it enabled', () => {
        const [chmod] = itemsFor({ _capabilities: { 'vfs.node.chmod': 'elevate' } });

        expect(chmod.disabled).toBe(false);
        expect(chmod.locked).toBe(true);
        expect(chmod.refusal).toBeUndefined();
    });

    it('leaves an allowed item, and every item naming no capability, as they were', () => {
        const [chmod, open] = itemsFor({ _capabilities: { 'vfs.node.chmod': 'allowed' } });

        expect(chmod.disabled).toBe(false);
        expect(chmod.locked).toBeUndefined();
        expect(open.disabled).toBe(false);
        expect(open.locked).toBeUndefined();
    });

    it('leaves the item as it was when the record carries no answer', () => {
        for (const record of [{}, { _capabilities: [] }]) {
            const [chmod] = itemsFor(record);

            expect(chmod.disabled).toBe(false);
            expect(chmod.locked).toBeUndefined();
        }
    });
});

describe('ContextMenuService disabled for a reason', () => {
    function itemsFor(meta: Record<string, unknown>, record: Record<string, unknown>): ContextMenuItem[] {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                { provide: HttpClient, useValue: {} },
                { provide: Router, useValue: {} },
                { provide: ErrorHandlerService, useValue: {} },
                { provide: Store, useValue: { selectSnapshot: () => null } },
            ],
        });
        const svc = TestBed.inject(ContextMenuService);
        svc.openFromNodes(new MouseEvent('contextmenu', { clientX: 10, clientY: 20 }), [node('archive', { action: 'archive', ...meta })], record, () => undefined);
        return svc.menu()?.items ?? [];
    }
    const SENTENCE = 'Archive needs All Mail shown over IMAP.';
    const ARCHIVE = { disabledWhen: { field: '_archive', op: 'eq', value: 'blocked' }, disabledReason: 'all-mail-hidden', disabledReasonText: SENTENCE };

    it('draws an item whose disabledWhen holds disabled, kept, saying the server\'s sentence as given', () => {
        const [item] = itemsFor(ARCHIVE, { _archive: 'blocked' });
        expect(item.disabled).toBeTrue();
        expect(item.refusal).toBe(SENTENCE);
    });

    it('a node that gives no sentence says the one generic reason, whatever its code', () => {
        expect(itemsFor({ ...ARCHIVE, disabledReasonText: undefined }, { _archive: 'blocked' })[0].refusal).toBe(UNWORDED_REASON);
        expect(itemsFor({ ...ARCHIVE, disabledReasonText: '  ' }, { _archive: 'blocked' })[0].refusal).toBe('Not available right now');
    });

    it('leaves the item as it was while its disabledWhen does not hold', () => {
        const [item] = itemsFor(ARCHIVE, { _archive: 'can' });
        expect(item.disabled).toBeFalse();
        expect(item.refusal).toBeUndefined();
    });
});
