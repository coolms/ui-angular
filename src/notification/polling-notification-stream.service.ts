import { Injectable } from '@angular/core';
import { Observable, interval } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

import type { NotificationStreamService } from './notification-stream.service';

/**
 * Default `NotificationStreamService` implementation. Emits a void
 * tick every `intervalMs` and an immediate startup tick so subscribers
 * receive a synchronous-feeling first refresh without an opening 2 s
 * gap. Ignores the channel string -- Centrifugo replacement uses it.
 */
@Injectable({ providedIn: 'root' })
export class PollingNotificationStreamService implements NotificationStreamService {
    private readonly intervalMs = 2000;

    watch(_channel: string): Observable<void> {
        return interval(this.intervalMs).pipe(
            startWith(0),
            map(() => undefined),
        );
    }
}
