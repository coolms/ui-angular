import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { of } from 'rxjs';
import { Logout } from '@coolms/core-angular';

import { SessionEndedOnDisconnect } from './session-ended-on-disconnect';

/**
 * The realtime close code that says the session ended signs the client out at
 * once (2026-09-26); no other close does.
 */
describe('SessionEndedOnDisconnect', () => {
    let dispatched: unknown[];
    let navigated: unknown[][];

    beforeEach(() => {
        dispatched = [];
        navigated = [];
        TestBed.configureTestingModule({
            providers: [
                { provide: Store, useValue: { dispatch: (a: unknown) => (dispatched.push(a), of(null)) } },
                { provide: Router, useValue: { navigated: true, navigate: (c: unknown[]) => navigated.push(c) } },
            ],
        });
    });

    it('signs out and goes to the sign-in page on the declared code', () => {
        const ended = TestBed.inject(SessionEndedOnDisconnect).handle(4501, 4501);

        expect(ended).toBeTrue();
        expect(dispatched.length).toBe(1);
        expect(dispatched[0] instanceof Logout).toBeTrue();
        expect(navigated).toEqual([['/login']]);
    });

    it('leaves any other close to the reconnecting client', () => {
        const handler = TestBed.inject(SessionEndedOnDisconnect);

        // A generic force disconnect, a normal close, a transport drop.
        expect(handler.handle(3503, 4501)).toBeFalse();
        expect(handler.handle(3000, 4501)).toBeFalse();
        expect(handler.handle(undefined, 4501)).toBeFalse();
        expect(dispatched).toEqual([]);
        expect(navigated).toEqual([]);
    });

    it('ends nothing when the server declared no code', () => {
        expect(TestBed.inject(SessionEndedOnDisconnect).handle(4501, undefined)).toBeFalse();
        expect(dispatched).toEqual([]);
    });
});
