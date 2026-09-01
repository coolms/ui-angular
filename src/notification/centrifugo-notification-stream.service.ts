import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { CentrifugoClientService } from './centrifugo-client.service';
import type { NotificationStreamService } from './notification-stream.service';

/**
 * sub-phase 2d -- Centrifugo-backed replacement for
 * `PollingNotificationStreamService`. Exposes the same
 * `watch(channel): Observable<void>` contract, so swapping the
 * provider in `app.config.ts` is a single line and every existing
 * subscriber works unchanged.
 *
 * Per the interface contract emissions carry no payload; subscribers
 * already re-fetch via API on each tick. That matches Centrifugo's
 * push model neatly -- a publication arrives, we emit void, the
 * subscriber refreshes through `ApiService`.
 *
 * Unsubscribe semantics: the returned Observable unsubscribes the
 * Centrifuge subscription when the last RxJS subscriber goes away.
 * `removeSubscription` collapses the centrifuge-js subscription
 * record so a future `watch(sameChannel)` starts cleanly rather
 * than re-using a stale subscription instance.
 */
@Injectable({ providedIn: 'root' })
export class CentrifugoNotificationStreamService implements NotificationStreamService {
    private readonly client = inject(CentrifugoClientService);

    watch(channel: string): Observable<void> {
        return new Observable<void>(subscriber => {
            let unsubscribed = false;
            let publicationHandler: ((..._args: unknown[]) => void) | null = null;

            this.client.connect()
                .then(client => {
                    if (unsubscribed) {
                        return;
                    }
                    const sub = this.client.getOrCreateSubscription(channel);

                    // Emit an immediate tick so consumers see a synchronous-feeling
                    // first refresh, matching PollingNotificationStreamService's
                    // `startWith(0)` semantics. Without it the detail page would
                    // sit at a "loading" spinner until the first publication.
                    subscriber.next();

                    publicationHandler = (): void => subscriber.next();
                    sub.on('publication', publicationHandler);
                    if (sub.state !== 'subscribed') {
                        sub.subscribe();
                    }
                })
                .catch((err: unknown) => subscriber.error(err));

            return () => {
                unsubscribed = true;
                const sub = this.tryGetSubscription(channel);
                if (sub !== null) {
                    if (publicationHandler !== null) {
                        sub.off('publication', publicationHandler);
                    }
                    sub.unsubscribe();
                }
            };
        });
    }

    private tryGetSubscription(channel: string): ReturnType<CentrifugoClientService['getOrCreateSubscription']> | null {
        try {
            return this.client.getOrCreateSubscription(channel);
        } catch {
            // Client never connected -- nothing to clean up.
            return null;
        }
    }
}
