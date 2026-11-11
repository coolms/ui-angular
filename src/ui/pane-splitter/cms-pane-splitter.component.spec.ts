import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmsPaneSplitterComponent, PANE_SPLITTER_KEY_STEP } from './cms-pane-splitter.component';

/**
 * The splitter as a separator: its role and values, each key, Enter as a
 * reset, the width it emits when a move ends, a width set from outside, and a
 * drag that neither scrolls nor selects. Measured in a real layout: a 230px
 * pane before the splitter in a 1000px flex row.
 */
describe('CmsPaneSplitterComponent', () => {
    const KEY = 'spec.pane-splitter.width';

    @Component({
        selector: 'spec-splitter-host',
        standalone: true,
        imports: [CmsPaneSplitterComponent],
        template: `
            <div style="display: flex; width: 1000px; height: 200px">
                @if (side() === 'start') {
                    <aside class="pane"></aside>
                    <cms-pane-splitter [minWidth]="200" [maxWidth]="380" [storageKey]="key()" ariaLabel="Resize folders"
                                       [width]="width()" (widthChange)="emitted.push($event)" />
                    <section style="flex: 1"></section>
                } @else {
                    <section style="flex: 1"></section>
                    <cms-pane-splitter side="end" [minWidth]="200" [maxWidth]="380" [storageKey]="key()"
                                       [width]="width()" (widthChange)="emitted.push($event)" />
                    <aside class="pane"></aside>
                }
            </div>
        `,
        // The pane's width from a stylesheet, as a reset restores it.
        styles: ['.pane { width: 230px; flex: 0 0 230px; }'],
    })
    class SpecSplitterHost {
        readonly side = signal<'start' | 'end'>('start');
        readonly key = signal(KEY);
        readonly width = signal<number | null>(null);
        readonly emitted: number[] = [];
    }

    let fixture: ComponentFixture<SpecSplitterHost>;
    let host: SpecSplitterHost;

    const splitter = (): HTMLElement => fixture.nativeElement.querySelector('cms-pane-splitter');
    const pane = (): HTMLElement => fixture.nativeElement.querySelector('.pane');
    const press = (key: string): KeyboardEvent => {
        const down = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        splitter().dispatchEvent(down);
        splitter().dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
        fixture.detectChanges();
        return down;
    };

    async function render(setup: (h: SpecSplitterHost) => void = () => undefined): Promise<void> {
        fixture = TestBed.createComponent(SpecSplitterHost);
        host = fixture.componentInstance;
        setup(host);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    }

    beforeEach(() => {
        localStorage.removeItem(KEY);
        TestBed.configureTestingModule({ imports: [SpecSplitterHost] });
    });

    afterEach(() => {
        localStorage.removeItem(KEY);
        fixture?.destroy();
    });

    it('is a focusable vertical separator named by its label, its value the pane width within its limits', async () => {
        await render();
        const el = splitter();
        expect(el.getAttribute('role')).toBe('separator');
        expect(el.getAttribute('tabindex')).toBe('0');
        expect(el.getAttribute('aria-orientation')).toBe('vertical');
        expect(el.getAttribute('aria-label')).toBe('Resize folders');
        expect(el.getAttribute('aria-valuemin')).toBe('200');
        expect(el.getAttribute('aria-valuemax')).toBe('380');
        expect(el.getAttribute('aria-valuenow')).toBe('230');
        el.focus();
        expect(document.activeElement).toBe(el);
    });

    it('moves 16px right on ArrowRight and left on ArrowLeft, and aria-valuenow follows', async () => {
        await render();
        expect(PANE_SPLITTER_KEY_STEP).toBe(16);
        const right = press('ArrowRight');
        expect(right.defaultPrevented).toBeTrue();
        expect(pane().offsetWidth).toBe(246);
        expect(splitter().getAttribute('aria-valuenow')).toBe('246');
        press('ArrowLeft');
        press('ArrowLeft');
        expect(pane().offsetWidth).toBe(214);
        expect(splitter().getAttribute('aria-valuenow')).toBe('214');
    });

    it('inverts the arrows for a pane after it (side end)', async () => {
        await render(h => h.side.set('end'));
        press('ArrowLeft');
        expect(pane().offsetWidth).toBe(246);
        press('ArrowRight');
        press('ArrowRight');
        expect(pane().offsetWidth).toBe(214);
    });

    it('never takes the pane past its limits by arrows', async () => {
        await render();
        press('ArrowLeft');
        press('ArrowLeft');
        press('ArrowLeft');
        expect(pane().offsetWidth).toBe(200);
        for (let i = 0; i < 20; i++) {
            press('ArrowRight');
        }
        expect(pane().offsetWidth).toBe(380);
    });

    it('goes to the minimum on Home and the maximum on End, without scrolling the page', async () => {
        await render();
        const home = press('Home');
        expect(home.defaultPrevented).toBeTrue();
        expect(pane().offsetWidth).toBe(200);
        expect(splitter().getAttribute('aria-valuenow')).toBe('200');
        const end = press('End');
        expect(end.defaultPrevented).toBeTrue();
        expect(pane().offsetWidth).toBe(380);
        expect(splitter().getAttribute('aria-valuenow')).toBe('380');
    });

    it('emits and saves the final width when a moving key is released, not while it is held', async () => {
        await render();
        splitter().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
        splitter().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
        expect(host.emitted).toEqual([]);
        expect(localStorage.getItem(KEY)).toBeNull();
        splitter().dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', cancelable: true }));
        expect(host.emitted).toEqual([262]);
        expect(localStorage.getItem(KEY)).toBe('262');
    });

    it('ignores other keys: no move, no emit, the default not prevented', async () => {
        await render();
        const tab = press('Tab');
        expect(tab.defaultPrevented).toBeFalse();
        expect(pane().offsetWidth).toBe(230);
        expect(host.emitted).toEqual([]);
    });

    it('resets on Enter like a double-click: stylesheet width back, saved width cleared, default emitted', async () => {
        localStorage.setItem(KEY, '300');
        await render();
        expect(pane().offsetWidth).toBe(300);
        const enter = press('Enter');
        expect(enter.defaultPrevented).toBeTrue();
        expect(pane().style.width).toBe('');
        expect(pane().offsetWidth).toBe(230);
        expect(localStorage.getItem(KEY)).toBeNull();
        expect(host.emitted).toEqual([230]);
        expect(splitter().getAttribute('aria-valuenow')).toBe('230');

        press('End');
        splitter().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        expect(pane().offsetWidth).toBe(230);
        expect(host.emitted).toEqual([230, 380, 230]);
    });

    it('applies a width set from outside, over the saved one, clamped, and again when it changes', async () => {
        localStorage.setItem(KEY, '300');
        await render(h => h.width.set(260));
        expect(pane().offsetWidth).toBe(260);
        expect(splitter().getAttribute('aria-valuenow')).toBe('260');
        host.width.set(500);
        fixture.detectChanges();
        expect(pane().offsetWidth).toBe(380);
        expect(host.emitted).toEqual([]);
        expect(localStorage.getItem(KEY)).toBe('300');
    });

    it('drags without selecting or scrolling, and emits the final width when the drag ends', async () => {
        await render();
        const down = new PointerEvent('pointerdown', { clientX: 500, bubbles: true, cancelable: true });
        splitter().dispatchEvent(down);
        expect(down.defaultPrevented).toBeTrue();
        expect(getComputedStyle(splitter()).touchAction).toBe('none');
        expect(document.body.style.userSelect).toBe('none');
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: 540 }));
        expect(pane().offsetWidth).toBe(270);
        expect(host.emitted).toEqual([]);
        window.dispatchEvent(new PointerEvent('pointerup', { clientX: 540 }));
        expect(document.body.style.userSelect).toBe('');
        expect(host.emitted).toEqual([270]);
        expect(localStorage.getItem(KEY)).toBe('270');
    });
});
