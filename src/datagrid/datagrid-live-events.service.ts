import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { CentrifugoClientService } from '../notification/centrifugo-client.service';

/**
 * Phase 2 DataGrid live -- typed wrapper over
 * `CentrifugoClientService` for the `datagrid.{entityAlias}.list`
 * channel. The `CentrifugoNotificationStreamService` sibling emits
 * `void` for refetch-on-tick consumers; this stream carries the
 * full payload so the DataGrid component can distinguish
 * `row.updated` / `row.deleted` and route per-event.
 *
 * Returned Observable disconnects the centrifuge subscription when
 * the last RxJS subscriber goes away. Payload shape mirrors the
 * backend `DataGridChangeEvent` value object (Sub-phase A).
 */
@Injectable({ providedIn: 'root' })
export class DataGridLiveEventsService {
    private readonly client = inject(CentrifugoClientService);

    watch(entityAlias: string): Observable<DataGridChangeEvent> {
        const channel = `datagrid.${entityAlias}.list`;

        return new Observable<DataGridChangeEvent>(subscriber => {
            let unsubscribed = false;
            let publicationHandler: ((ctx: { data: unknown }) => void) | null = null;

            this.client.connect()
                .then(() => {
                    if (unsubscribed) {
                        return;
                    }
                    const sub = this.client.getOrCreateSubscription(channel);

                    publicationHandler = (ctx: { data: unknown }): void => {
                        const event = this.coerce(ctx.data);
                        if (event !== null) {
                            subscriber.next(event);
                        }
                    };
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

    private coerce(raw: unknown): DataGridChangeEvent | null {
        if (typeof raw !== 'object' || raw === null) {
            return null;
        }
        const obj = raw as Record<string, unknown>;
        const type = obj['type'];
        const entityAlias = obj['entityAlias'];
        const entityId = obj['entityId'];
        if (typeof type !== 'string' || typeof entityAlias !== 'string') {
            return null;
        }
        if (!(type === 'row.created' || type === 'row.updated' || type === 'row.deleted' || type === 'grid.refresh_required')) {
            return null;
        }
        if (entityId !== null && typeof entityId !== 'string') {
            return null;
        }

        return { type, entityAlias, entityId };
    }

    private tryGetSubscription(channel: string): ReturnType<CentrifugoClientService['getOrCreateSubscription']> | null {
        try {
            return this.client.getOrCreateSubscription(channel);
        } catch {
            return null;
        }
    }
}

export type DataGridEventType = 'row.created' | 'row.updated' | 'row.deleted' | 'grid.refresh_required';

export interface DataGridChangeEvent {
    readonly type: DataGridEventType;
    readonly entityAlias: string;
    readonly entityId: string | null;
}
