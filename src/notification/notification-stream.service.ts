import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';

/**
 * Channel-keyed status-update stream. Callers refresh their own state
 * when the stream emits; the emission itself carries no payload. The
 * default `PollingNotificationStreamService` ticks every 2 s and
 * ignores the channel string; a future Centrifugo implementation will
 * subscribe to it server-side.
 *
 * Channel naming convention (Centrifugo-ready):
 *   document.generation.{id}            -- single generation status
 *   document.generation.{id}.instances  -- per-instance updates
 *   user.{userId}.inbox                 -- per-user inbox
 */
export interface NotificationStreamService {
    /**
     * Watch a channel. Subscribers receive a void emission whenever
     * the channel "may have changed"; the contract does not promise a
     * push-then-fresh-read on every backend mutation, so callers must
     * still drive their own re-fetch on each tick.
     */
    watch(channel: string): Observable<void>;
}

export const NOTIFICATION_STREAM = new InjectionToken<NotificationStreamService>(
    'NotificationStreamService',
);
