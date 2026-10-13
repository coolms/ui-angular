import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { NaviGraphNode, ErrorHandlerService } from '@coolms/core-angular';
import { ContextMenuItem, ContextMenuService } from './context-menu.service';

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
    });

    it('locks an item allowed once elevated, and leaves it enabled', () => {
        const [chmod] = itemsFor({ _capabilities: { 'vfs.node.chmod': 'elevate' } });

        expect(chmod.disabled).toBe(false);
        expect(chmod.locked).toBe(true);
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
