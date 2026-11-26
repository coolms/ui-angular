import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { ErrorHandlerService } from '@coolms/core-angular';

import { ContextMenuComponent } from '../../context-menu/context-menu.component';
import { ContextMenuService } from '../../context-menu/context-menu.service';
import { CmsFilterMenuComponent, type FilterMenuOption } from './cms-filter-menu.component';

const OPTIONS: FilterMenuOption[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'attachments', label: 'Attachments' },
];

@Component({
    standalone: true,
    imports: [CmsFilterMenuComponent, ContextMenuComponent],
    template: `
        <div style="display: flex; align-items: center; width: 200px;
                    --cms-accent-light: rgb(254, 247, 230); --cms-accent-text: rgb(124, 77, 0); --cms-control-height-md: 40px">
            <h2 data-test="name" style="flex: 1 1 auto; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                A folder with a name far longer than its row
            </h2>
            <cms-filter-menu label="Show" [options]="options()" [value]="value()" [defaultValue]="fallback()" [iconOnly]="iconOnly()"
                             (valueChange)="chosen.push($event); follow && value.set($event)" />
        </div>
        <coolms-context-menu />
    `,
})
class HostComponent {
    readonly options = signal<FilterMenuOption[]>(OPTIONS);
    readonly value = signal('all');
    readonly fallback = signal<string | null>(null);
    readonly iconOnly = signal(false);
    /** The host takes what it is told. */
    follow = true;
    readonly chosen: string[] = [];
}

describe('CmsFilterMenuComponent', () => {
    let f: ComponentFixture<HostComponent>;
    const el = (): HTMLElement => f.nativeElement as HTMLElement;
    const button = (): HTMLButtonElement | null => el().querySelector<HTMLButtonElement>('cms-filter-menu button');
    const menuItems = (): HTMLButtonElement[] => [...el().querySelectorAll<HTMLButtonElement>('.ctx-menu .ctx-item')];
    const item = (label: string): HTMLButtonElement => menuItems().find(i => i.textContent!.trim() === label)!;
    /** The menu drawn, placed and its item focused. */
    const settle = async (): Promise<void> => {
        f.detectChanges();
        await new Promise(r => setTimeout(r, 20));
        f.detectChanges();
    };
    const press = async (): Promise<void> => {
        button()!.click();
        await settle();
    };
    const key = async (target: HTMLElement, name: string): Promise<void> => {
        target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
        await settle();
    };
    const set = (value: string): void => {
        f.componentInstance.value.set(value);
        f.detectChanges();
    };

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
        document.body.appendChild(f.nativeElement);
        f.detectChanges();
    });
    afterEach(() => {
        TestBed.inject(ContextMenuService).close();
        el().remove();
    });

    it('on the default choice is the funnel icon alone, square, no box, named by what it filters and the choice', () => {
        const b = button()!;
        expect(b.textContent!.trim()).toBe('');
        expect(b.querySelector('.bi-funnel')).not.toBeNull();
        expect(b.querySelector('.bi-chevron-down')).toBeNull();
        expect(b.getAttribute('aria-label')).toBe('Show: All');
        expect(b.getAttribute('aria-haspopup')).toBe('menu');
        expect(b.getAttribute('aria-expanded')).toBe('false');
        const css = getComputedStyle(b);
        expect([css.width, css.height]).toEqual(['40px', '40px']);
        expect(css.backgroundColor).toBe('rgba(0, 0, 0, 0)');
        expect(css.borderTopStyle).toBe('none');
    });

    it('on any other choice is that choice\'s name then a chevron, with the accent, never the icon', () => {
        set('unread');
        const b = button()!;
        expect(b.textContent!.trim()).toBe('Unread');
        expect(b.querySelector('.bi-funnel')).toBeNull();
        expect(b.lastElementChild!.classList).toContain('bi-chevron-down');
        expect(b.getAttribute('aria-label')).toBe('Show: Unread');
        expect(b.classList).not.toContain('cms-btn-primary');
        const css = getComputedStyle(b);
        expect(css.backgroundColor).toBe('rgb(254, 247, 230)');
        expect(css.color).toBe('rgb(124, 77, 0)');
        expect(css.height).toBe('40px');
    });

    it('the default is the choice named, else the first: the named one is the icon, the first is then said', () => {
        f.componentInstance.fallback.set('unread');
        set('unread');
        expect(button()!.querySelector('.bi-funnel')).not.toBeNull();
        set('all');
        expect(button()!.textContent!.trim()).toBe('All');
        f.componentInstance.fallback.set('nothing');
        f.detectChanges();
        expect(button()!.querySelector('.bi-funnel')).withContext('a default that names none is the first').not.toBeNull();
    });

    it('as an icon of a bar it stays the icon, with the accent on a choice other than the default', () => {
        f.componentInstance.iconOnly.set(true);
        set('all');
        expect(getComputedStyle(button()!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        set('unread');
        const b = button()!;
        expect(b.textContent!.trim()).toBe('');
        expect(b.querySelector('.bi-funnel')).not.toBeNull();
        expect(getComputedStyle(b).width).toBe('40px');
        expect(getComputedStyle(b).backgroundColor).toBe('rgb(254, 247, 230)');
        expect(getComputedStyle(b).color).toBe('rgb(124, 77, 0)');
        expect(b.getAttribute('aria-label')).toBe('Show: Unread');
    });

    it('beside a name too long for the row, the name gives way and the button keeps its whole width', () => {
        set('attachments');
        const b = button()!.getBoundingClientRect();
        const name = el().querySelector<HTMLElement>('[data-test="name"]')!;
        expect(b.right).toBeLessThanOrEqual(name.parentElement!.getBoundingClientRect().right + .5);
        expect(button()!.scrollWidth).toBeLessThanOrEqual(button()!.clientWidth + 1);
        expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
        expect(b.top).toBeLessThan(name.getBoundingClientRect().bottom);
    });

    it('a choice\'s name is whole up to the button\'s 176px, then cut with an ellipsis, whole in its name and title', () => {
        set('attachments');
        const label = (): HTMLElement => el().querySelector<HTMLElement>('.cms-filter-menu__label')!;
        expect(label().scrollWidth).withContext('a short one is whole').toBeLessThanOrEqual(label().clientWidth + 1);
        expect(button()!.getBoundingClientRect().width).toBeLessThan(176);

        const long = 'Messages waiting for an answer from the supplier';
        f.componentInstance.options.set([...OPTIONS, { id: 'long', label: long }]);
        set('long');
        const b = button()!;
        expect(b.getBoundingClientRect().width).toBe(176);
        expect(getComputedStyle(label()).textOverflow).toBe('ellipsis');
        expect(label().scrollWidth).withContext('cut').toBeGreaterThan(label().clientWidth);
        expect(label().textContent!.trim()).toBe(long);
        expect(b.getAttribute('aria-label')).toBe('Show: ' + long);
        expect(b.getAttribute('title')).toBe('Show: ' + long);
        const caret = b.querySelector('.cms-filter-menu__caret')!.getBoundingClientRect();
        expect(caret.width).withContext('the chevron stays').toBeGreaterThan(0);
        expect(caret.right).toBeLessThanOrEqual(b.getBoundingClientRect().right);
    });

    it('the menu is a single choice: the choices in order, a check and aria-checked on the current one, which is focused', async () => {
        set('unread');
        await press();
        expect(button()!.getAttribute('aria-expanded')).toBe('true');
        expect(el().querySelector('.ctx-menu')!.getAttribute('aria-label')).toBe('Show');
        expect(menuItems().map(i => i.textContent!.trim())).toEqual(['All', 'Unread', 'Attachments']);
        expect(menuItems().map(i => i.getAttribute('role'))).toEqual(['menuitemradio', 'menuitemradio', 'menuitemradio']);
        expect(menuItems().map(i => i.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
        expect(menuItems().map(i => i.querySelector('.bi-check-lg') !== null)).toEqual([false, true, false]);
        expect(document.activeElement).toBe(item('Unread'));
    });

    it('a choice is emitted and closes the menu, focus back on the button; the current one closes it and emits nothing', async () => {
        await press();
        item('Attachments').click();
        await settle();
        expect(f.componentInstance.chosen).toEqual(['attachments']);
        expect(menuItems().length).toBe(0);
        expect(document.activeElement).toBe(button());
        expect(button()!.textContent!.trim()).toBe('Attachments');

        await press();
        item('Attachments').click();
        await settle();
        expect(f.componentInstance.chosen).toEqual(['attachments']);
        expect(menuItems().length).toBe(0);
    });

    it('a second press closes the menu, and so does Escape, focus back on the button', async () => {
        await press();
        expect(menuItems().length).toBe(3);
        await press();
        expect(menuItems().length).toBe(0);
        expect(button()!.getAttribute('aria-expanded')).toBe('false');

        await press();
        await key(document.activeElement as HTMLElement, 'Escape');
        expect(menuItems().length).toBe(0);
        expect(document.activeElement).toBe(button());
        expect(f.componentInstance.chosen).toEqual([]);
    });

    it('Down opens at the current choice, Up at the last; the arrows move', async () => {
        set('unread');
        await key(button()!, 'ArrowDown');
        expect(document.activeElement).toBe(item('Unread'));
        await key(item('Unread'), 'ArrowDown');
        expect(document.activeElement).toBe(item('Attachments'));
        await key(item('Attachments'), 'Escape');
        await key(button()!, 'ArrowUp');
        expect(document.activeElement).toBe(item('Attachments'));
    });

    it('at the window\'s corner, where the menu is moved into it, the arrows still move: the focus is given once', async () => {
        const row = el().querySelector<HTMLElement>('cms-filter-menu')!.parentElement!;
        row.style.position = 'fixed';
        row.style.right = '0';
        row.style.bottom = '0';
        set('unread');
        await key(button()!, 'ArrowDown');
        const menu = TestBed.inject(ContextMenuService).menu()!;
        expect(menu.y).withContext('moved up into the window').toBeLessThan(button()!.getBoundingClientRect().bottom);
        expect(document.activeElement).toBe(item('Unread'));
        // Pressed at once after the menu is moved, and left to settle.
        await key(item('Unread'), 'ArrowDown');
        await settle();
        expect(document.activeElement).toBe(item('Attachments'));
    });

    it('with fewer than two choices draws nothing', () => {
        f.componentInstance.options.set([OPTIONS[0]]);
        f.detectChanges();
        expect(button()).toBeNull();
        f.componentInstance.options.set([]);
        f.detectChanges();
        expect(button()).toBeNull();
        f.componentInstance.options.set(OPTIONS.slice(0, 2));
        f.detectChanges();
        expect(button()).not.toBeNull();
        expect(f.componentInstance.chosen).toEqual([]);
    });

    it('a value that names no choice reads as the default, and the host is told once', () => {
        f.componentInstance.follow = false;
        f.componentInstance.fallback.set('all');
        set('gone');
        expect(button()!.querySelector('.bi-funnel')).not.toBeNull();
        expect(button()!.getAttribute('aria-label')).toBe('Show: All');
        expect(f.componentInstance.chosen).toEqual(['all']);
        // The choices served again, the same value still: not told again.
        f.componentInstance.options.set([...OPTIONS]);
        f.detectChanges();
        expect(f.componentInstance.chosen).toEqual(['all']);
    });

    it('a host that takes it is left on the default; a current choice no longer offered, with one left, is told too', () => {
        set('gone');
        expect(f.componentInstance.value()).toBe('all');
        set('unread');
        f.componentInstance.options.set([OPTIONS[0]]);
        f.detectChanges();
        expect(f.componentInstance.value()).toBe('all');
        expect(f.componentInstance.chosen).toEqual(['all', 'all']);
    });

    it('with no choices yet, no value is refused', () => {
        f.componentInstance.options.set([]);
        set('unread');
        expect(f.componentInstance.chosen).toEqual([]);
        f.componentInstance.options.set(OPTIONS);
        f.detectChanges();
        expect(f.componentInstance.chosen).toEqual([]);
        expect(button()!.textContent!.trim()).toBe('Unread');
    });

    it('a menu whose items are no choices is a menu of menuitems, no check drawn', async () => {
        TestBed.inject(ContextMenuService).openFrom(button()!, [{ id: 'a', label: 'One', icon: 'gear' }, { id: 'b', label: 'Two' }], () => undefined);
        await settle();
        expect(menuItems().map(i => i.getAttribute('role'))).toEqual(['menuitem', 'menuitem']);
        expect(menuItems().map(i => i.hasAttribute('aria-checked'))).toEqual([false, false]);
        expect(el().querySelector('.ctx-check')).toBeNull();
        expect(el().querySelector('.ctx-menu')!.hasAttribute('aria-label')).toBeFalse();
        expect(document.activeElement).toBe(item('One'));
    });
});
