import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmsFilterChipsComponent, type FilterChipOption } from './cms-filter-chips.component';

@Component({
    standalone: true,
    imports: [CmsFilterChipsComponent],
    template: `
        <div [style.width.px]="width()">
            <cms-filter-chips label="Show messages" [options]="options" [value]="value()" (valueChange)="value.set($event); chosen.push($event)" />
        </div>
    `,
})
class HostComponent {
    readonly options: FilterChipOption[] = [
        { id: 'all', label: 'All' },
        { id: 'unread', label: 'Unread' },
        { id: 'attachments', label: 'Attachments' },
    ];
    readonly value = signal('all');
    readonly width = signal(400);
    readonly chosen: string[] = [];
}

describe('CmsFilterChipsComponent', () => {
    let f: ComponentFixture<HostComponent>;
    const el = (): HTMLElement => f.nativeElement as HTMLElement;
    const chips = (): HTMLButtonElement[] => [...el().querySelectorAll<HTMLButtonElement>('.cms-chip')];
    const chip = (id: string): HTMLButtonElement => el().querySelector<HTMLButtonElement>(`[data-chip="${id}"]`)!;

    beforeEach(() => {
        TestBed.configureTestingModule({ imports: [HostComponent] });
        f = TestBed.createComponent(HostComponent);
        document.body.appendChild(f.nativeElement);
        f.detectChanges();
    });
    afterEach(() => el().remove());

    it('is a radio group of the options in order, the chosen one checked, filled and the one tab stop', () => {
        const group = el().querySelector('[role="radiogroup"]')!;
        expect(group.getAttribute('aria-label')).toBe('Show messages');
        expect(chips().map((c) => c.textContent!.trim())).toEqual(['All', 'Unread', 'Attachments']);
        expect(chip('all').getAttribute('aria-checked')).toBe('true');
        expect(chip('all').classList).toContain('is-on');
        expect(chip('all').querySelector('.bi-check-lg')).not.toBeNull();
        expect(chip('unread').getAttribute('aria-checked')).toBe('false');
        expect(chips().map((c) => c.tabIndex)).toEqual([0, -1, -1]);
    });

    it('a value that names no chip leaves the first chip the one tab stop', () => {
        f.componentInstance.value.set('nothing');
        f.detectChanges();
        expect(chips().map((c) => c.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false']);
        expect(chips().map((c) => c.tabIndex)).toEqual([0, -1, -1]);
    });

    it('a click chooses one chip; choosing the chosen one emits nothing', () => {
        chip('unread').click();
        f.detectChanges();
        expect(f.componentInstance.chosen).toEqual(['unread']);
        expect(chip('unread').getAttribute('aria-checked')).toBe('true');
        expect(chip('all').getAttribute('aria-checked')).toBe('false');
        chip('unread').click();
        expect(f.componentInstance.chosen).toEqual(['unread']);
    });

    it('the arrow keys move the choice and the focus, round from the last to the first', () => {
        chip('all').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        f.detectChanges();
        expect(f.componentInstance.value()).toBe('attachments');
        expect(document.activeElement).toBe(chip('attachments'));
        chip('attachments').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        f.detectChanges();
        expect(f.componentInstance.value()).toBe('all');
    });

    it('too narrow for one line, the chips wrap whole onto the next: none is cut and nothing scrolls', () => {
        f.componentInstance.width.set(150);
        f.detectChanges();
        const group = el().querySelector<HTMLElement>('.cms-chips')!;
        const box = group.getBoundingClientRect();
        const tops = new Set(chips().map((c) => Math.round(c.getBoundingClientRect().top)));
        expect(tops.size).withContext('more than one line').toBeGreaterThan(1);
        for (const c of chips()) {
            const r = c.getBoundingClientRect();
            expect(c.scrollWidth).withContext(c.textContent!.trim() + ' whole').toBeLessThanOrEqual(c.clientWidth + 1);
            expect(r.right).toBeLessThanOrEqual(box.right + 0.5);
        }
        expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth + 1);
    });
});
