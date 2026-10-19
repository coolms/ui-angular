import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ToastService } from './toast.service';

/**
 * The one toast stack: a toast goes after its time, one toast per group key is updated in place, a persistent one
 * stays until dismissed or closed by its key, at most four are shown (a persistent one is never pushed out), and
 * hovering stops a toast's clock.
 */
describe('ToastService -- one stack for what was done and what arrived', () => {
    let toasts: ToastService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        toasts = TestBed.inject(ToastService);
    });

    function messages(): string[] {
        return toasts.toasts().map(t => t.message);
    }

    it('a toast goes after its time, and show answers its id', fakeAsync(() => {
        const id = toasts.show({ type: 'success', message: 'Saved' });

        expect(toasts.toasts().map(t => t.id)).toEqual([id]);
        tick(4999);
        expect(messages()).toEqual(['Saved']);
        tick(1);
        expect(messages()).toEqual([]);
    }));

    it('one toast per group key: a later show updates it where it stands and starts its time again', fakeAsync(() => {
        toasts.success('Before');
        const first = toasts.show({ type: 'info', kind: 'message', groupKey: 'chat:7', message: '1 new message', count: 1 });
        tick(4000);
        const again = toasts.show({ type: 'info', kind: 'message', groupKey: 'chat:7', message: '3 new messages', count: 3 });

        expect(again).toBe(first);
        expect(messages()).toEqual(['Before', '3 new messages']);
        expect(toasts.toasts()[1].count).toBe(3);
        tick(4999);
        expect(messages()).withContext('its time started again on the update').toEqual(['3 new messages']);
        tick(1);
        expect(messages()).toEqual([]);
    }));

    it('a persistent toast stays until it is closed by its key', fakeAsync(() => {
        toasts.show({ type: 'info', kind: 'ring', groupKey: 'call:9', persistent: true, message: 'Anna is calling' });

        tick(10 * 60 * 1000);
        expect(messages()).toEqual(['Anna is calling']);
        toasts.closeGroup('call:9');
        expect(messages()).toEqual([]);
        toasts.closeGroup('call:9');
        expect(messages()).withContext('closing a group that is not shown does nothing').toEqual([]);
    }));

    it('at most four: the oldest that is not persistent goes, and a ringing call is never pushed out', fakeAsync(() => {
        toasts.show({ type: 'info', kind: 'ring', groupKey: 'call:9', persistent: true, message: 'ring' });
        for (const n of [1, 2, 3, 4]) {
            toasts.show({ type: 'info', kind: 'message', message: 'm' + n });
        }

        expect(toasts.toasts().length).toBe(ToastService.MAX_VISIBLE);
        expect(messages()).toEqual(['ring', 'm2', 'm3', 'm4']);
        tick(5000);
        expect(messages()).toEqual(['ring']);
        toasts.closeGroup('call:9');
    }));

    it('hovering stops a toast\'s clock, and leaving starts it again with the time it had left', fakeAsync(() => {
        const id = toasts.show({ type: 'info', message: 'Hovered' });
        tick(3000);
        toasts.pause(id);
        tick(60000);
        expect(messages()).toEqual(['Hovered']);

        toasts.resume(id);
        tick(1999);
        expect(messages()).toEqual(['Hovered']);
        tick(1);
        expect(messages()).toEqual([]);
    }));

    it('a paused toast updated by its group gets its full time again, and still waits for resume', fakeAsync(() => {
        const id = toasts.show({ type: 'info', kind: 'message', groupKey: 'chat:7', message: '1 new message' });
        tick(3000);
        toasts.pause(id);
        toasts.show({ type: 'info', kind: 'message', groupKey: 'chat:7', message: '2 new messages' });
        tick(60000);
        expect(messages()).withContext('hovered while updated').toEqual(['2 new messages']);

        toasts.resume(id);
        tick(4999);
        expect(messages()).toEqual(['2 new messages']);
        tick(1);
        expect(messages()).toEqual([]);
    }));

    it('with four persistent toasts shown, a new toast that is not persistent is dropped at once', fakeAsync(() => {
        for (const n of [1, 2, 3, 4]) {
            toasts.show({ type: 'info', kind: 'ring', groupKey: 'call:' + n, persistent: true, message: 'ring ' + n });
        }
        toasts.show({ type: 'success', message: 'Saved' });

        expect(messages()).toEqual(['ring 1', 'ring 2', 'ring 3', 'ring 4']);
        for (const n of [1, 2, 3, 4]) {
            toasts.closeGroup('call:' + n);
        }
    }));

    it('the shorthands keep their meaning: an error stays longer than a success', fakeAsync(() => {
        toasts.success('ok');
        toasts.error('failed');
        tick(5000);
        expect(messages()).toEqual(['failed']);
        tick(3000);
        expect(messages()).toEqual([]);
    }));
});
