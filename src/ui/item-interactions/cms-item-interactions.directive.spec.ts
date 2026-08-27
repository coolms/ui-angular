import { Component, signal, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import {
    CmsItemInteractionsDirective,
    type CmsItemSelectionMode,
    type CmsRangeSelectionRequest,
    type CmsSelectionChange,
} from './cms-item-interactions.directive';

/**
 * Jasmine specs for `CmsItemInteractionsDirective`.
 */

interface Item { id: string; }

@Component({
    standalone: true,
    imports: [CmsItemInteractionsDirective],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div
            cmsItemInteractions
            [cmsItem]="item"
            [selectionMode]="mode()"
            [currentSelection]="selection()"
            [rangeAnchor]="anchor()"
            [dblclickDelay]="delay()"
            (selectionChanged)="onSelectionChanged($event)"
            (rangeSelectionRequested)="onRangeRequested($event)"
            (activated)="onActivated($event)"
            (contextMenuRequested)="onContextMenu($event)"
        ></div>
    `,
})
class HostComponent {
    readonly item: Item = { id: 'a' };
    readonly mode = signal<CmsItemSelectionMode>('single');
    readonly selection = signal<readonly Item[]>([]);
    readonly anchor = signal<Item | null>(null);
    readonly delay = signal<number>(250);

    lastSelectionChange: CmsSelectionChange<Item> | null = null;
    lastRangeRequest: CmsRangeSelectionRequest<Item> | null = null;
    activatedItem: Item | null = null;
    contextMenu: { item: Item; event: MouseEvent } | null = null;

    readonly directive = viewChild.required(CmsItemInteractionsDirective);

    onSelectionChanged(e: CmsSelectionChange<Item>): void { this.lastSelectionChange = e; }
    onRangeRequested(e: CmsRangeSelectionRequest<Item>): void { this.lastRangeRequest = e; }
    onActivated(item: Item): void { this.activatedItem = item; }
    onContextMenu(e: { item: Item; event: MouseEvent }): void { this.contextMenu = e; }
}

function mouseEvent(type: string, opts: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {}): MouseEvent {
    return new MouseEvent(type, { bubbles: true, cancelable: true, ...opts });
}

describe('CmsItemInteractionsDirective', () => {
    function setup() {
        TestBed.configureTestingModule({ imports: [HostComponent] });
        const fixture = TestBed.createComponent(HostComponent);
        fixture.detectChanges();
        const hostEl: HTMLElement = fixture.nativeElement.querySelector('div');

        /**
         * Dispatch `event` at the directive, running change detection first.
         *
         * The detectChanges() is load-bearing. Every test below writes the
         * host's signals (`mode`, `selection`, `anchor`, `delay`) AFTER setup()
         * and then clicks. Those feed the directive's `input()` signals, which
         * only take the new value once change detection runs -- so dispatching
         * straight after a `.set()` exercises the directive's PREVIOUS inputs.
         * That silently made most of this file assert against `mode='single'`
         * regardless of the mode each test meant to pin.
         */
        const fire = (event: MouseEvent): void => {
            fixture.detectChanges();
            hostEl.dispatchEvent(event);
        };

        return { fixture, host: fixture.componentInstance, hostEl, fire };
    }

    describe('single mode', () => {
        it('plain click emits selection=[item]', fakeAsync(() => {
            const { host, fire } = setup();
            host.mode.set('single');
            fire(mouseEvent('click'));
            tick(300);
            expect(host.lastSelectionChange).toEqual({ selection: [host.item], newAnchor: host.item });
        }));

        it('Ctrl+click behaves identically to plain click (modifier ignored)', () => {
            const { host, fire } = setup();
            host.mode.set('single');
            fire(mouseEvent('click', { ctrlKey: true }));
            expect(host.lastSelectionChange).toEqual({ selection: [host.item], newAnchor: host.item });
        });

        it('dblclick emits activated, no pending single-click', fakeAsync(() => {
            const { host, fire } = setup();
            host.mode.set('single');
            fire(mouseEvent('click'));
            fire(mouseEvent('dblclick'));
            tick(300);
            expect(host.activatedItem).toBe(host.item);
            expect(host.lastSelectionChange).toBeNull();
        }));

        it('right-click selects and requests menu', () => {
            const { host, fire } = setup();
            host.mode.set('single');
            fire(mouseEvent('contextmenu'));
            expect(host.lastSelectionChange).toEqual({ selection: [host.item], newAnchor: host.item });
            expect(host.contextMenu?.item).toBe(host.item);
        });
    });

    describe('toggle mode', () => {
        // Unmodified clicks go through the dblclick-disambiguation delay
        // (see the 'disambiguation' block); only modifier-keyed clicks fire
        // synchronously. Hence fakeAsync + tick here.
        it('plain click replaces selection', fakeAsync(() => {
            const { host, fire } = setup();
            host.mode.set('toggle');
            host.selection.set([{ id: 'b' }]);
            fire(mouseEvent('click', { ctrlKey: false }));
            tick(300);
            expect(host.lastSelectionChange?.selection).toEqual([host.item]);
        }));

        it('Ctrl+click adds to existing selection', () => {
            const { host, fire } = setup();
            host.mode.set('toggle');
            const other: Item = { id: 'b' };
            host.selection.set([other]);
            fire(mouseEvent('click', { ctrlKey: true }));
            expect(host.lastSelectionChange?.selection).toEqual([other, host.item]);
        });

        it('Ctrl+click on already-selected item removes it', () => {
            const { host, fire } = setup();
            host.mode.set('toggle');
            const other: Item = { id: 'b' };
            host.selection.set([other, host.item]);
            fire(mouseEvent('click', { ctrlKey: true }));
            expect(host.lastSelectionChange?.selection).toEqual([other]);
        });

        it('right-click on selected item preserves selection', () => {
            const { host, fire } = setup();
            host.mode.set('toggle');
            const other: Item = { id: 'b' };
            host.selection.set([other, host.item]);
            fire(mouseEvent('contextmenu'));
            expect(host.lastSelectionChange).toBeNull();
            expect(host.contextMenu?.item).toBe(host.item);
        });

        it('right-click on unselected item replaces selection', () => {
            const { host, fire } = setup();
            host.mode.set('toggle');
            host.selection.set([{ id: 'b' }]);
            fire(mouseEvent('contextmenu'));
            expect(host.lastSelectionChange?.selection).toEqual([host.item]);
        });
    });

    describe('range mode', () => {
        // Delayed for the same reason as the toggle-mode plain click above.
        it('plain click replaces and sets anchor', fakeAsync(() => {
            const { host, fire } = setup();
            host.mode.set('range');
            fire(mouseEvent('click'));
            tick(300);
            expect(host.lastSelectionChange).toEqual({ selection: [host.item], newAnchor: host.item });
        }));

        it('Shift+click without anchor falls back to plain click', () => {
            const { host, fire } = setup();
            host.mode.set('range');
            host.anchor.set(null);
            fire(mouseEvent('click', { shiftKey: true }));
            expect(host.lastSelectionChange).toEqual({ selection: [host.item], newAnchor: host.item });
            expect(host.lastRangeRequest).toBeNull();
        });

        it('Shift+click with anchor emits rangeSelectionRequested (replace)', () => {
            const { host, fire } = setup();
            host.mode.set('range');
            const anchor: Item = { id: 'b' };
            host.anchor.set(anchor);
            fire(mouseEvent('click', { shiftKey: true }));
            expect(host.lastRangeRequest).toEqual({ from: anchor, to: host.item, modifier: 'replace' });
        });

        it('Shift+Ctrl+click emits rangeSelectionRequested with modifier=add', () => {
            const { host, fire } = setup();
            host.mode.set('range');
            const anchor: Item = { id: 'b' };
            host.anchor.set(anchor);
            fire(mouseEvent('click', { shiftKey: true, ctrlKey: true }));
            expect(host.lastRangeRequest).toEqual({ from: anchor, to: host.item, modifier: 'add' });
        });

        it('Ctrl+click adds/removes like toggle mode and updates anchor', () => {
            const { host, fire } = setup();
            host.mode.set('range');
            const other: Item = { id: 'b' };
            host.selection.set([other]);
            fire(mouseEvent('click', { ctrlKey: true }));
            expect(host.lastSelectionChange?.selection).toEqual([other, host.item]);
            expect(host.lastSelectionChange?.newAnchor).toBe(host.item);
        });
    });

    describe('mailbox mode', () => {
        it('plain click emits activated, no selectionChanged', () => {
            const { host, fire } = setup();
            host.mode.set('mailbox');
            fire(mouseEvent('click'));
            expect(host.activatedItem).toBe(host.item);
            expect(host.lastSelectionChange).toBeNull();
        });

        it('plain click fires immediately (no dblclickDelay)', () => {
            const { host, fire } = setup();
            host.mode.set('mailbox');
            // No fakeAsync / tick -- if the directive scheduled a
            // timeout this expectation would be null until the delay
            // elapsed. Sync assertion pins the immediate-fire path.
            fire(mouseEvent('click'));
            expect(host.activatedItem).toBe(host.item);
        });

        it('Ctrl+click on unselected item adds to selection, anchor=item, no activated', () => {
            const { host, fire } = setup();
            host.mode.set('mailbox');
            const other: Item = { id: 'b' };
            host.selection.set([other]);
            fire(mouseEvent('click', { ctrlKey: true }));
            expect(host.lastSelectionChange?.selection).toEqual([other, host.item]);
            expect(host.lastSelectionChange?.newAnchor).toBe(host.item);
            expect(host.activatedItem).toBeNull();
        });

        it('Ctrl+click on already-selected item removes it from selection', () => {
            const { host, fire } = setup();
            host.mode.set('mailbox');
            const other: Item = { id: 'b' };
            host.selection.set([other, host.item]);
            fire(mouseEvent('click', { ctrlKey: true }));
            expect(host.lastSelectionChange?.selection).toEqual([other]);
            expect(host.activatedItem).toBeNull();
        });

        it('Shift+click with anchor emits rangeSelectionRequested (replace), no activated', () => {
            const { host, fire } = setup();
            host.mode.set('mailbox');
            const anchor: Item = { id: 'b' };
            host.anchor.set(anchor);
            fire(mouseEvent('click', { shiftKey: true }));
            expect(host.lastRangeRequest).toEqual({ from: anchor, to: host.item, modifier: 'replace' });
            expect(host.activatedItem).toBeNull();
            expect(host.lastSelectionChange).toBeNull();
        });

        it('Shift+click without anchor falls back to activated.emit (not selection change)', () => {
            const { host, fire } = setup();
            host.mode.set('mailbox');
            host.anchor.set(null);
            fire(mouseEvent('click', { shiftKey: true }));
            expect(host.activatedItem).toBe(host.item);
            expect(host.lastSelectionChange).toBeNull();
            expect(host.lastRangeRequest).toBeNull();
        });

        it('Shift+Ctrl+click emits rangeSelectionRequested with modifier=add', () => {
            const { host, fire } = setup();
            host.mode.set('mailbox');
            const anchor: Item = { id: 'b' };
            host.anchor.set(anchor);
            fire(mouseEvent('click', { shiftKey: true, ctrlKey: true }));
            expect(host.lastRangeRequest).toEqual({ from: anchor, to: host.item, modifier: 'add' });
            expect(host.activatedItem).toBeNull();
        });

        it('dblclick emits activated', () => {
            const { host, fire } = setup();
            host.mode.set('mailbox');
            fire(mouseEvent('dblclick'));
            expect(host.activatedItem).toBe(host.item);
        });

        it('right-click on unselected item replaces selection and requests menu', () => {
            const { host, fire } = setup();
            host.mode.set('mailbox');
            host.selection.set([{ id: 'b' }]);
            fire(mouseEvent('contextmenu'));
            expect(host.lastSelectionChange?.selection).toEqual([host.item]);
            expect(host.contextMenu?.item).toBe(host.item);
        });

        it('right-click on already-selected item preserves selection and requests menu', () => {
            const { host, fire } = setup();
            host.mode.set('mailbox');
            const other: Item = { id: 'b' };
            host.selection.set([other, host.item]);
            fire(mouseEvent('contextmenu'));
            expect(host.lastSelectionChange).toBeNull();
            expect(host.contextMenu?.item).toBe(host.item);
        });
    });

    describe('disambiguation', () => {
        it('plain click is delayed by dblclickDelay (default 250ms)', fakeAsync(() => {
            const { host, fire } = setup();
            fire(mouseEvent('click'));
            expect(host.lastSelectionChange).toBeNull();
            tick(249);
            expect(host.lastSelectionChange).toBeNull();
            tick(1);
            expect(host.lastSelectionChange?.selection).toEqual([host.item]);
        }));

        it('dblclick within the disambiguation window suppresses pending single-click', fakeAsync(() => {
            const { host, fire } = setup();
            fire(mouseEvent('click'));
            tick(100);
            fire(mouseEvent('dblclick'));
            tick(500);
            expect(host.activatedItem).toBe(host.item);
            expect(host.lastSelectionChange).toBeNull();
        }));

        it('dblclickDelay=0 disables the delay', () => {
            const { host, fire } = setup();
            host.delay.set(0);
            fire(mouseEvent('click'));
            expect(host.lastSelectionChange).toEqual({ selection: [host.item], newAnchor: host.item });
        });

        it('modifier-keyed clicks fire immediately (no delay)', () => {
            const { host, fire } = setup();
            host.mode.set('toggle');
            fire(mouseEvent('click', { ctrlKey: true }));
            expect(host.lastSelectionChange).not.toBeNull();
        });

        it('contextmenu calls preventDefault on the event', () => {
            const { fire } = setup();
            const evt = mouseEvent('contextmenu');
            const spy = spyOn(evt, 'preventDefault');
            fire(evt);
            expect(spy).toHaveBeenCalled();
        });
    });
});
