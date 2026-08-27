import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy, Signal, inject, signal } from '@angular/core';
import { Centrifuge, UnauthorizedError, type Subscription } from 'centrifuge';
import { Store } from '@ngxs/store';
import { firstValueFrom } from 'rxjs';
import { AuthRefreshCoordinator, AuthState, RealtimeTokenClient } from '@coolms/core-angular';

/**
 * Grace window in milliseconds: if the access token will expire
 * within this gap, trigger a preemptive refresh before issuing the
 * next protected request from a `getToken` callback.
 */
const ACCESS_TOKEN_REFRESH_GRACE_MS = 30_000;

/**
 * ADR-099 sub-phase 2d -- root-level singleton that owns one
 * `Centrifuge` instance per SPA session. Components never construct
 * their own client; they go through `CentrifugoNotificationStreamService`
 * (which calls `connect()` lazily and then `subscribe()`).
 *
 * Connection lifecycle:
 *   - `connect()` is idempotent. The first caller triggers the
 *     token exchange and the WebSocket handshake; concurrent callers
 *     await the same promise.
 *   - `getToken` callback runs on the initial connect AND on every
 *     refresh; both go through `ApiService` so the auth interceptor
 *     keeps the bearer / cookie attached.
 *   - `ngOnDestroy` disconnects on app teardown.
 *
 * Token-refresh is delegated to centrifuge-js: passing a `getToken`
 * function makes the library call it automatically before `exp` so
 * the WebSocket never observably re-handshakes.
 *
 * Sub-phase Y -- every `getToken` callback first calls
 * `ensureFreshAccessToken()`, which routes through the shared
 * `AuthRefreshCoordinator`. This eliminates the race where
 * Centrifuge's auto-refresh fires alongside a notification poll
 * after a long idle: previously each mutex span a separate
 * `api.refresh` call with the same refresh-token, the backend's
 * `isUsed` replay branch revoked the user, and the operator was
 * kicked to /login. Funnelling both paths through the coordinator
 * guarantees a single in-flight refresh per tab.
 */
@Injectable({ providedIn: 'root' })
export class CentrifugoClientService implements OnDestroy {
    // The two token endpoints, not the application's whole API client: this
    // service needed 2 of its 117 methods, and a UI kit that pulled the other
    // 115 in would drag every module's wire types under it.
    private readonly tokens = inject(RealtimeTokenClient);
    private readonly store = inject(Store);
    private readonly refreshCoordinator = inject(AuthRefreshCoordinator);

    private centrifuge: Centrifuge | null = null;
    private connectPromise: Promise<Centrifuge> | null = null;

    /**
     * Notification Sub-phase K -- reactive WebSocket connection state.
     * `true` only while the Centrifuge SDK is in its `Connected`
     * state; `false` during `Connecting`, `Disconnected`, or before
     * the first `bootstrap()` call. Consumers that layer over the
     * push transport (e.g., `NotificationPollingService`) can read
     * this to suspend polling fallbacks while push is healthy.
     */
    private readonly _isConnected = signal<boolean>(false);
    readonly isConnected: Signal<boolean> = this._isConnected.asReadonly();

    /**
     * Connect к Centrifugo and return the underlying client. Safe to
     * call from every subscriber -- the second and later calls reuse
     * the first one's promise / client.
     */
    async connect(): Promise<Centrifuge> {
        if (this.centrifuge !== null) {
            return this.centrifuge;
        }
        if (this.connectPromise !== null) {
            return this.connectPromise;
        }
        this.connectPromise = this.bootstrap();
        try {
            this.centrifuge = await this.connectPromise;
            return this.centrifuge;
        } finally {
            this.connectPromise = null;
        }
    }

    /**
     * Return the existing subscription for `channel`, or create one.
     * Caller decides when to `.subscribe()`; passing the bare
     * Subscription back keeps event-listener wiring at the caller so
     * the stream service can map `publication` -- Observable emission.
     *
     * Sub-phase O -- new subscriptions register a per-channel
     * `getToken` callback so private namespaces (notifications, vfs,
     * datagrid, document) authorize each subscribe command with a
     * fresh JWT from `POST /centrifugo/subscription-token`. The
     * centrifuge SDK reuses the callback automatically before
     * expiry, so callers never need to refresh manually.
     */
    getOrCreateSubscription(channel: string): Subscription {
        if (this.centrifuge === null) {
            throw new Error('CentrifugoClientService.getOrCreateSubscription called before connect().');
        }
        const existing = this.centrifuge.getSubscription(channel);
        if (existing !== null) {
            return existing;
        }
        return this.centrifuge.newSubscription(channel, {
            getToken: async (ctx) => {
                await this.ensureFreshAccessToken();
                try {
                    const fresh = await firstValueFrom(this.tokens.subscriptionToken(ctx.channel));
                    return fresh.token;
                } catch (err) {
                    // A 403 is a PERMANENT authorization denial for this channel
                    // (e.g. the call wallboard's `calls.broadcast` for a user without
                    // ROLE_CALL). Throwing the SDK's `UnauthorizedError` moves the
                    // subscription to `unsubscribed` instead of re-issuing
                    // `POST /centrifugo/subscription-token` forever in a backoff loop
                    // (the 403 storm). Any other failure — network / 5xx, or a 401 the
                    // auth interceptor already tried to refresh — rethrows so the SDK's
                    // normal transient resubscribe still applies.
                    if (err instanceof HttpErrorResponse && err.status === 403) {
                        throw new UnauthorizedError(`Subscription to "${ctx.channel}" is not permitted.`);
                    }
                    throw err;
                }
            },
        });
    }

    ngOnDestroy(): void {
        this.centrifuge?.disconnect();
        this.centrifuge = null;
        this.connectPromise = null;
        this._isConnected.set(false);
    }

    private async bootstrap(): Promise<Centrifuge> {
        const initial = await firstValueFrom(this.tokens.connectionToken());
        const client = new Centrifuge(initial.wsUrl, {
            token: initial.token,
            getToken: async () => {
                await this.ensureFreshAccessToken();
                const fresh = await firstValueFrom(this.tokens.connectionToken());
                return fresh.token;
            },
        });
        client.on('state', (ctx) => {
            this._isConnected.set(ctx.newState === 'connected');
        });
        client.on('disconnected', () => this._isConnected.set(false));
        client.connect();
        return client;
    }

    /**
     * Rotate the access token preemptively when the stored expiry
     * sits inside the grace window. Routes through
     * `AuthRefreshCoordinator` so the same in-flight refresh is
     * shared with `authInterceptor`, eliminating the parallel-call
     * race that triggers backend replay detection.
     *
     * Failure path is intentionally silent: if the preemptive
     * refresh errors, the upcoming Centrifugo HTTP call falls
     * through to the interceptor's reactive 401-retry, which
     * surfaces the failure through the standard logout path.
     */
    private async ensureFreshAccessToken(): Promise<void> {
        const expiresAtStr = this.store.selectSnapshot(AuthState.expiresAt);
        const refreshToken = this.store.selectSnapshot(AuthState.refreshToken);
        if (expiresAtStr === null || refreshToken === null) {
            return;
        }
        const expiresAtMs = new Date(expiresAtStr).getTime();
        if (Number.isNaN(expiresAtMs)) {
            return;
        }
        if (Date.now() < expiresAtMs - ACCESS_TOKEN_REFRESH_GRACE_MS) {
            return;
        }
        try {
            await firstValueFrom(this.refreshCoordinator.refresh(refreshToken));
        } catch {
            // Coordinator handles Logout dispatch on auth failure;
            // swallow here so the caller proceeds to the HTTP request
            // that will surface the same failure through the
            // interceptor's normal channel.
        }
    }
}
