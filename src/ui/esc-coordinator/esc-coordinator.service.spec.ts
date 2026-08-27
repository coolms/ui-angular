import { TestBed } from '@angular/core/testing';
import { EscCoordinatorService } from './esc-coordinator.service';

/**
 * Jasmine specs for `EscCoordinatorService`.
 */

function pressEscape(): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true }));
}

describe('EscCoordinatorService', () => {
    let svc: EscCoordinatorService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        svc = TestBed.inject(EscCoordinatorService);
    });

    it('register returns an unregister callback (function)', () => {
        const unregister = svc.register(() => true);
        expect(typeof unregister).toBe('function');
        unregister();
    });

    it('a single registered handler is called on ESC', () => {
        const handler = jasmine.createSpy('handler').and.returnValue(true);
        svc.register(handler);
        pressEscape();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('most-recently registered handler fires first (LIFO)', () => {
        const calls: string[] = [];
        svc.register(() => { calls.push('first'); return false; });
        svc.register(() => { calls.push('second'); return true; });
        pressEscape();
        // 'second' registered after 'first', so 'second' fires first.
        expect(calls).toEqual(['second']);
    });

    it('handler returning true stops the chain (lower handlers not called)', () => {
        const lower = jasmine.createSpy('lower');
        const upper = jasmine.createSpy('upper').and.returnValue(true);
        svc.register(lower);
        svc.register(upper);
        pressEscape();
        expect(upper).toHaveBeenCalled();
        expect(lower).not.toHaveBeenCalled();
    });

    it('handler returning false continues to the next handler', () => {
        const lower = jasmine.createSpy('lower').and.returnValue(true);
        const upper = jasmine.createSpy('upper').and.returnValue(false);
        svc.register(lower);
        svc.register(upper);
        pressEscape();
        expect(upper).toHaveBeenCalled();
        expect(lower).toHaveBeenCalled();
    });

    it('all handlers returning false: event is not consumed', () => {
        svc.register(() => false);
        svc.register(() => false);
        const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
        const spy = spyOn(event, 'preventDefault');
        document.dispatchEvent(event);
        expect(spy).not.toHaveBeenCalled();
    });

    it('handler returning true causes preventDefault on the keystroke', () => {
        svc.register(() => true);
        const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
        const spy = spyOn(event, 'preventDefault');
        document.dispatchEvent(event);
        expect(spy).toHaveBeenCalled();
    });

    it('unregister removes the handler from the stack', () => {
        const handler = jasmine.createSpy('handler').and.returnValue(true);
        const unregister = svc.register(handler);
        unregister();
        pressEscape();
        expect(handler).not.toHaveBeenCalled();
    });

    it('unregister called twice is idempotent (second call no-op)', () => {
        const handler = jasmine.createSpy('handler').and.returnValue(true);
        const unregister = svc.register(handler);
        unregister();
        // A second unregister must not throw or remove an unrelated handler.
        expect(() => unregister()).not.toThrow();
    });

    it('non-ESC keys do not trigger handlers', () => {
        const handler = jasmine.createSpy('handler').and.returnValue(true);
        svc.register(handler);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', cancelable: true, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }));
        expect(handler).not.toHaveBeenCalled();
    });

    it('stack stays stable under interleaved register/unregister (10x)', () => {
        const unregisters: Array<() => void> = [];
        for (let i = 0; i < 10; i += 1) {
            unregisters.push(svc.register(() => false));
        }
        // Unregister in reverse: each removal touches the LIFO top
        for (let i = unregisters.length - 1; i >= 0; i -= 1) {
            unregisters[i]();
        }
        // After full teardown, ESC reaches no handler — coordinator
        // would not throw.
        expect(() => pressEscape()).not.toThrow();
    });
});
