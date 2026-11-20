import { TestBed } from '@angular/core/testing';
import { Store } from '@ngxs/store';
import { Centrifuge, type Subscription } from 'centrifuge';
import { AuthRefreshCoordinator, RealtimeTokenClient } from '@coolms/core-angular';

import { CentrifugoClientService, dropHeldToken } from './centrifugo-client.service';
import { SessionEndedOnDisconnect } from './session-ended-on-disconnect';

/**
 * A subscription the server ends asks for a fresh token once, never with the token it holds (2026-11-20: a revoked
 * person's channels came back on the held token until it expired); every activation after the first is announced so a
 * screen re-reads what it missed. The client and its subscriptions are the real SDK's, never connected.
 */
describe('CentrifugoClientService after the server ends a subscription', () => {
    let service: CentrifugoClientService;
    let client: Centrifuge;

    const held = (sub: Subscription): string => (sub as unknown as { _token: string })._token;
    const hold = (sub: Subscription, token: string): void => {
        (sub as unknown as { _token: string })._token = token;
    };
    const emit = (target: Subscription | Centrifuge, event: string, ctx: unknown): void => {
        (target as unknown as { emit(e: string, c: unknown): void }).emit(event, ctx);
    };
    const flush = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                { provide: RealtimeTokenClient, useValue: {} },
                { provide: Store, useValue: { selectSnapshot: () => null } },
                { provide: AuthRefreshCoordinator, useValue: {} },
                { provide: SessionEndedOnDisconnect, useValue: { handle: () => false } },
            ],
        });
        service = TestBed.inject(CentrifugoClientService);
        client = new Centrifuge('ws://127.0.0.1:9/connection/websocket', { getToken: async () => 'connection' });
        (service as unknown as { centrifuge: Centrifuge }).centrifuge = client;
    });

    afterEach(() => client.disconnect());

    it('the SDK still keeps a subscription token where dropHeldToken clears it', () => {
        const sub = client.newSubscription('probe.channel', { getToken: async () => 'fresh' });
        hold(sub, 'held');
        expect(held(sub)).toBe('held');
        dropHeldToken(sub);
        expect(held(sub)).toBe('');
        // With no token held, the SDK must ask getToken before it subscribes.
        expect((sub as unknown as { _canSubscribeWithoutGettingToken(): boolean })._canSubscribeWithoutGettingToken()).toBeFalse();
    });

    it('a server unsubscribe drops the held token and subscribes again once, fresh', async () => {
        const sub = service.getOrCreateSubscription('email.user.u1');
        const again = spyOn(sub, 'subscribe');
        hold(sub, 'held');
        emit(sub, 'unsubscribed', { channel: sub.channel, code: 2000, reason: 'server unsubscribe' });
        await flush();
        expect(held(sub)).toBe('');
        expect(again).toHaveBeenCalledTimes(1);
        // A second one at once is not asked again: a policy that keeps refusing must not loop.
        hold(sub, 'held');
        emit(sub, 'unsubscribed', { channel: sub.channel, code: 2000, reason: 'server unsubscribe' });
        await flush();
        expect(again).toHaveBeenCalledTimes(1);
    });

    it('an unsubscribe the client asked for, or a refused token, stays final', async () => {
        const sub = service.getOrCreateSubscription('calendar.items.c1');
        const again = spyOn(sub, 'subscribe');
        hold(sub, 'held');
        emit(sub, 'unsubscribed', { channel: sub.channel, code: 0, reason: 'unsubscribe called' });
        emit(sub, 'unsubscribed', { channel: sub.channel, code: 103, reason: 'unauthorized' });
        await flush();
        expect(again).not.toHaveBeenCalled();
        expect(held(sub)).toBe('held');
    });

    it('announces every activation after the first, so a screen re-reads', () => {
        const seen: string[] = [];
        const done = service.resubscribed.subscribe((channel) => seen.push(channel));
        const sub = service.getOrCreateSubscription('notifications.user.u1');
        emit(sub, 'subscribed', { channel: sub.channel });
        expect(seen).toEqual([]);
        emit(sub, 'subscribed', { channel: sub.channel });
        expect(seen).toEqual(['notifications.user.u1']);
        done.unsubscribe();
    });

    it('when the server ends the connection, every held token is dropped; a plain transport drop keeps them', () => {
        const a = service.getOrCreateSubscription('email.user.u1');
        const b = service.getOrCreateSubscription('document.generation.g1');
        const forget = spyOn(client, 'setToken').and.callThrough();
        hold(a, 'held');
        hold(b, 'held');
        (service as unknown as { followConnection(c: Centrifuge): void }).followConnection(client);
        emit(client, 'connecting', { code: 1, reason: 'transport closed' });
        expect([held(a), held(b)]).toEqual(['held', 'held']);
        expect(forget).not.toHaveBeenCalled();
        emit(client, 'connecting', { code: 3005, reason: 'server ended it' });
        expect([held(a), held(b)]).toEqual(['', '']);
        expect(forget).toHaveBeenCalledWith('');
    });
});
