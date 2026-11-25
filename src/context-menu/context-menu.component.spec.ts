import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { ErrorHandlerService } from '@coolms/core-angular';

import { ContextMenuComponent } from './context-menu.component';
import { ContextMenuService } from './context-menu.service';

@Component({
    standalone: true,
    imports: [ContextMenuComponent],
    template: `<button type="button" data-test="opener">Open</button><coolms-context-menu />`,
})
class HostComponent {}

/** A menu opened from a button gives the focus once; moved into the window, it leaves it where the keys have taken it. */
describe('ContextMenuComponent -- the focus of a menu opened from a button', () => {
    let f: ComponentFixture<HostComponent>;
    let svc: ContextMenuService;
    const el = (): HTMLElement => f.nativeElement as HTMLElement;
    const opener = (): HTMLButtonElement => el().querySelector<HTMLButtonElement>('[data-test="opener"]')!;
    const focused = (): string => (document.activeElement?.textContent ?? '').trim();
    const settle = async (): Promise<void> => {
        f.detectChanges();
        await new Promise(r => setTimeout(r, 20));
        f.detectChanges();
    };
    /** The menu of a button at this place in the window, its first focus given. */
    async function open(place: 'corner' | 'top', focus: 'first' | 'last'): Promise<void> {
        opener().style.cssText = place === 'corner' ? 'position: fixed; right: 0; bottom: 0' : 'position: fixed; left: 0; top: 0';
        svc.openFrom(opener(), ['One', 'Two', 'Three'].map(label => ({ id: label, label })), () => undefined, { focus });
        await settle();
    }
    async function key(name: string): Promise<void> {
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
        await settle();
        await settle();
    }

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HostComponent],
            providers: [
                { provide: HttpClient, useValue: {} },
                { provide: Router, useValue: {} },
                { provide: ErrorHandlerService, useValue: {} },
                { provide: Store, useValue: { selectSnapshot: () => null } },
            ],
        });
        f = TestBed.createComponent(HostComponent);
        svc = TestBed.inject(ContextMenuService);
        document.body.appendChild(f.nativeElement);
        f.detectChanges();
    });
    afterEach(() => {
        svc.close();
        el().remove();
    });

    it('where the menu is not moved: the first item, then Down to the second; the last item, then Up to the second', async () => {
        await open('top', 'first');
        expect(focused()).toBe('One');
        await key('ArrowDown');
        expect(focused()).toBe('Two');
        svc.close();
        await settle();
        await open('top', 'last');
        expect(focused()).toBe('Three');
        await key('ArrowUp');
        expect(focused()).toBe('Two');
    });

    it('moved into the window from its corner, opened at the first item: Down keeps the focus on the second', async () => {
        await open('corner', 'first');
        expect(svc.menu()!.y).withContext('moved up').toBeLessThan(opener().getBoundingClientRect().bottom);
        expect(focused()).toBe('One');
        await key('ArrowDown');
        expect(focused()).toBe('Two');
    });

    it('moved into the window from its corner, opened at the last item: Up keeps the focus on the second', async () => {
        await open('corner', 'last');
        expect(svc.menu()!.y).withContext('moved up').toBeLessThan(opener().getBoundingClientRect().bottom);
        expect(focused()).toBe('Three');
        await key('ArrowUp');
        expect(focused()).toBe('Two');
    });

    it('the same items opened again give the focus again', async () => {
        const items = ['One', 'Two'].map(label => ({ id: label, label }));
        svc.openFrom(opener(), items, () => undefined);
        await settle();
        expect(focused()).toBe('One');
        svc.close();
        await settle();
        expect(document.activeElement).toBe(opener());
        svc.openFrom(opener(), items, () => undefined);
        await settle();
        expect(focused()).toBe('One');
    });

    it('moving a menu keeps its items: the same array, at the new place', () => {
        svc.openFrom(opener(), [{ id: 'One', label: 'One' }], () => undefined);
        const items = svc.menu()!.items;
        svc.setPosition(3, 4);
        expect([svc.menu()!.x, svc.menu()!.y]).toEqual([3, 4]);
        expect(svc.menu()!.items).toBe(items);
    });
});
