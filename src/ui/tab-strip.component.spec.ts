import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabStripComponent, TabStripItem } from './tab-strip.component';

/**
 * The strip's overflow, measured in a real layout: a container too narrow for
 * six tabs shows the "more" button and puts the tabs that do not fit behind
 * it; the active tab is always in the row; a wider container shows them all.
 */
describe('TabStripComponent -- overflow', () => {
    const TABS: TabStripItem[] = [
        { id: 'personal',    label: 'Personal',    icon: 'person' },
        { id: 'calendar',    label: 'Calendar',    icon: 'calendar' },
        { id: 'call',        label: 'Calls',       icon: 'telephone' },
        { id: 'contacts',    label: 'Contacts',    icon: 'people' },
        { id: 'preferences', label: 'Preferences', icon: 'sliders' },
        { id: 'interface',   label: 'Interface',   icon: 'palette' },
    ];

    @Component({
        selector: 'spec-strip-host',
        standalone: true,
        imports: [TabStripComponent],
        template: `
            <div class="box" [style.width.px]="width()">
                <app-tab-strip [tabs]="tabs" [activeId]="active()" (selected)="picked.push($event); active.set($event)" />
            </div>
        `,
    })
    class SpecStripHost {
        readonly tabs = TABS;
        readonly width = signal(320);
        readonly active = signal('personal');
        readonly picked: string[] = [];
    }

    let fixture: ComponentFixture<SpecStripHost>;
    let host: HTMLElement;

    const visibleIds = () => Array.from(host.querySelectorAll<HTMLElement>('.cms-tab-strip__tab'))
        .filter(b => !b.classList.contains('cms-tab-strip__tab--overflow'))
        .map(b => b.dataset['tab']);
    const moreShown = () => !!host.querySelector('.cms-tab-strip__more--shown');
    const menuIds = () => Array.from(host.querySelectorAll<HTMLElement>('.cms-tab-strip__menu-item')).map(b => b.dataset['tab']);

    /** The fit runs after render (a microtask) and on resize (an observer): wait for the DOM to say so. */
    async function settle(until: () => boolean): Promise<void> {
        for (let i = 0; i < 40 && !until(); i++) {
            await new Promise(r => setTimeout(r, 10));
            fixture.detectChanges();
        }
        fixture.detectChanges();
    }

    beforeEach(() => {
        TestBed.configureTestingModule({ imports: [SpecStripHost] });
        fixture = TestBed.createComponent(SpecStripHost);
        host = fixture.nativeElement as HTMLElement;
        fixture.detectChanges();
    });

 it('puts the tabs that do not fit behind the more button, in order, and keeps the row unwrapped', async () => {
        await settle(moreShown);

        const strip = host.querySelector('.cms-tab-strip') as HTMLElement;
        const visible = visibleIds();
        expect(moreShown()).toBeTrue();
        expect(visible.length).toBeGreaterThan(0);
        expect(visible.length).toBeLessThan(TABS.length);
        expect(visible).toEqual(TABS.slice(0, visible.length).map(t => t.id));
        expect(strip.scrollWidth).withContext('the row does not overflow its box').toBeLessThanOrEqual(strip.clientWidth);
        const rows = new Set(Array.from(host.querySelectorAll<HTMLElement>('.cms-tab-strip__tab'))
            .filter(b => !b.classList.contains('cms-tab-strip__tab--overflow')).map(b => b.offsetTop));
        expect(rows.size).withContext('one row').toBe(1);

        (host.querySelector('.cms-tab-strip__more-btn') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(menuIds()).toEqual(TABS.slice(visible.length).map(t => t.id));
    });

 it('picking a tab from the menu selects it, closes the menu, and brings it into the row', async () => {
        await settle(moreShown);
        const before = visibleIds();

        (host.querySelector('.cms-tab-strip__more-btn') as HTMLButtonElement).click();
        fixture.detectChanges();
        (host.querySelector('.cms-tab-strip__menu-item[data-tab="interface"]') as HTMLButtonElement).click();
        fixture.detectChanges();

        expect(fixture.componentInstance.picked).toEqual(['interface']);
        expect(host.querySelector('.cms-tab-strip__menu')).withContext('the menu closed').toBeNull();

        await settle(() => visibleIds().includes('interface'));
        const after = visibleIds();
        expect(after).toContain('interface');
        expect(after.length).toBe(before.length);
 // The one it replaced is the last that fitted; the others keep their places.
        expect(after.slice(0, -1)).toEqual(before.slice(0, -1));
        expect(host.querySelector('.cms-tab-strip__tab--active')!.getAttribute('data-tab')).toBe('interface');
    });

 it('shows every tab and no more button once the box is wide enough', async () => {
        await settle(moreShown);
        fixture.componentInstance.width.set(1200);
        fixture.detectChanges();

        await settle(() => !moreShown());
        expect(moreShown()).toBeFalse();
        expect(visibleIds()).toEqual(TABS.map(t => t.id));
    });
});
