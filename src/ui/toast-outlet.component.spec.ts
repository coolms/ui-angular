import { TestBed, fakeAsync, tick, type ComponentFixture } from '@angular/core/testing';
import { ToastOutletComponent } from './toast-outlet.component';
import { ToastService } from './toast.service';

/**
 * The one toast stack as drawn: bottom right; an arrival with its kind's icon, its count and up to two actions; the
 * old single action still drawn; the body opens what the toast announces; a ringing call drawn as urgent and announced
 * as an alert; hovering stops the clock.
 */
describe('ToastOutletComponent -- what was done and what arrived, drawn alike', () => {
    let fixture: ComponentFixture<ToastOutletComponent>;
    let toasts: ToastService;

    beforeEach(() => {
        TestBed.configureTestingModule({ imports: [ToastOutletComponent] });
        toasts = TestBed.inject(ToastService);
        fixture = TestBed.createComponent(ToastOutletComponent);
        fixture.detectChanges();
    });

    afterEach(() => {
        for (const t of toasts.toasts()) {
            toasts.dismiss(t.id);
        }
    });

    function host(): HTMLElement {
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    }

    it('sits at the bottom right', () => {
        const stack = host().querySelector('.cms-toast-container') as HTMLElement;
        const style = getComputedStyle(stack);

        expect(style.position).toBe('fixed');
        expect(style.bottom).toBe('16px');
        expect(style.right).toBe('16px');
    });

    it('an arrival: its kind\'s icon, its count, and two actions, the first the primary one', () => {
        const reply = jasmine.createSpy('reply');
        toasts.show({
            type: 'info', kind: 'message', groupKey: 'chat:7', title: 'Anna', message: 'Are you there?', count: 3,
            actions: [{ label: 'Reply', run: reply }, { label: 'Mute', run: () => undefined }, { label: 'Third', run: () => undefined }],
        });
        const el = host().querySelector('[data-test="toast-message"]') as HTMLElement;

        expect(el.querySelector('.bi-chat-dots-fill')).not.toBeNull();
        expect(el.querySelector('[data-test="toast-count"]')?.textContent?.trim()).toBe('3');
        const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('[data-test="toast-action"]'));
        expect(buttons.map(b => b.textContent?.trim())).withContext('a third action is not drawn').toEqual(['Reply', 'Mute']);
        expect(buttons[0].classList).toContain('cms-btn-primary');
        expect(buttons[1].classList).not.toContain('cms-btn-primary');

        buttons[0].click();
        expect(reply).toHaveBeenCalledTimes(1);
        expect(toasts.toasts()).toEqual([]);
    });

    it('the single action callers already pass is still drawn, and runs once', () => {
        const elevate = jasmine.createSpy('elevate');
        toasts.show({ type: 'warning', title: 'Not allowed', message: 'Elevate to do this', action: { label: 'Elevate', run: elevate } });
        const button = host().querySelector<HTMLButtonElement>('[data-test="toast-action"]') as HTMLButtonElement;

        expect(button.textContent?.trim()).toBe('Elevate');
        button.click();
        expect(elevate).toHaveBeenCalledTimes(1);
        expect(toasts.toasts()).toEqual([]);
    });

    it('clicking the body opens what the toast announces, and dismisses it', () => {
        const open = jasmine.createSpy('open');
        toasts.show({ type: 'info', kind: 'mail', title: 'New mail', message: 'Invoice 42', open });

        (host().querySelector('[data-test="toast-mail"]') as HTMLElement).click();
        expect(open).toHaveBeenCalledTimes(1);
        expect(toasts.toasts()).toEqual([]);
    });

    it('a ringing call is drawn as urgent and announced as an alert; a saved change is only a status', () => {
        toasts.show({ type: 'info', kind: 'ring', groupKey: 'call:9', persistent: true, title: 'Anna', message: 'is calling' });
        toasts.success('Saved');
        const ring = host().querySelector('[data-test="toast-ring"]') as HTMLElement;
        const saved = host().querySelector('[data-test="toast-success"]') as HTMLElement;

        expect(ring.classList).toContain('cms-toast--urgent');
        expect(ring.getAttribute('role')).toBe('alert');
        expect(ring.querySelector('.bi-telephone-inbound-fill')).not.toBeNull();
        expect(saved.classList).not.toContain('cms-toast--urgent');
        expect(saved.getAttribute('role')).toBe('status');
        expect(saved.querySelector('.bi-check-circle-fill')).not.toBeNull();
    });

    it('hovering a toast stops its clock; leaving starts it again', fakeAsync(() => {
        toasts.show({ type: 'info', kind: 'bell', message: 'Hovered' });
        const el = host().querySelector('[data-test="toast-bell"]') as HTMLElement;

        el.dispatchEvent(new MouseEvent('mouseenter'));
        tick(60000);
        expect(toasts.toasts().length).toBe(1);
        el.dispatchEvent(new MouseEvent('mouseleave'));
        tick(5000);
        expect(toasts.toasts().length).toBe(0);
    }));
});
