import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { Logout } from '@coolms/core-angular';

/**
 * The server closed the realtime connection because this client's session ENDED
 * (Dmitry, 2026-09-26): a sign-out everywhere from another device, a password
 * change, a deactivation. The code is the answer -- the client signs out at once,
 * and whatever ends with the session (a call) ends with it, instead of waiting
 * for a reconnect's backoff and a 401 (measured before: ~8 s).
 *
 * The code is the server's, declared in the connection-token response
 * (`sessionEndedCode`); a server that declares none ends nothing here, and every
 * other close (a network drop, a server restart, a generic force disconnect) is
 * left to the realtime client's own reconnecting.
 */
@Injectable({ providedIn: 'root' })
export class SessionEndedOnDisconnect {
    private readonly store = inject(Store);
    private readonly router = inject(Router);

    /** Signs out when `code` is the declared session-ended code; says whether it did. */
    handle(code: number | undefined, declared: number | undefined): boolean {
        if (declared === undefined || code !== declared) {
            return false;
        }
        this.store.dispatch(new Logout());
        if (this.router.navigated) {
            void this.router.navigate(['/login']);
        }
        return true;
    }
}
