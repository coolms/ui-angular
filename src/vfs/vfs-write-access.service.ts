import { DestroyRef, inject, Injectable, signal, type Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { Store } from '@ngxs/store';
import { AppConfigState, ElevationService } from '@coolms/core-angular';
import { Observable, of } from 'rxjs';
import type { VfsNodeDto } from './vfs.types';

/**
 * Whether the signed-in person may write THIS node, kept in step with the
 * server for as long as an editor is open.
 *
 * !! WHY AN EDITOR NEEDS THIS AT ALL. The capability flags on a listing are
 * the server's answer AT FETCH TIME. An editor opened from that listing holds
 * a node whose `permissions.write` may be false, and until now no editor read
 * it: Save was enabled, the request went out, and the person learned the file
 * was read-only from a 403. That was tolerable while a refusal was rare. Once
 * narrowing A is enforced an unelevated member loses write on every
 * `document`-owned file, so meeting the refusal at Save becomes the common
 * case rather than the exception.
 *
 * !! IT RE-ASKS THE SERVER; IT DOES NOT INFER. On every change of elevation
 * state the node is re-stated by path and the flag is taken from the answer,
 * which is exactly what the directory listing does -- so an editor and the
 * listing behind it cannot disagree. Deriving writability locally (say, flag
 * OR elevated) would be a second decider, and the whole point of ADR-184's
 * client requirement is that the client keeps none.
 */
export interface VfsWriteAccess {
    /** The server's current answer for this node. */
    readonly writable: Signal<boolean>;

    /**
     * Offer elevation for a node the server says is not writable -- the SAME
     * prompt the interceptor raises on a 403, never a second one. Resolves
     * true once the session is elevated; `writable` then flips on its own,
     * because the grant re-states the node.
     */
    request(): Observable<boolean>;
}

@Injectable({ providedIn: 'root' })
export class VfsWriteAccessService {
    private readonly http = inject(HttpClient);
    private readonly store = inject(Store);
    private readonly elevation = inject(ElevationService);

    /**
     * Track one node for the lifetime of `destroyRef` (pass the component's,
     * so the subscription dies with the editor rather than with the app).
     */
    forNode(node: VfsNodeDto, destroyRef: DestroyRef): VfsWriteAccess {
        const writable = signal<boolean>(node.permissions?.write ?? false);

        this.elevation.changes$.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
            this.restat(node.path).subscribe({
                next: fresh => writable.set(fresh),
                error: () => undefined,
            });
        });

        return {
            writable: writable.asReadonly(),
            request: () => this.elevation.offerFor(),
        };
    }

    /**
     * The node's current write flag, from the same by-path stat the explorer
     * uses. `/vfs/files` is keyed by PATH -- there is no by-id stat.
     */
    private restat(path: string): Observable<boolean> {
        const apiBase = this.store.selectSnapshot(AppConfigState.manifest)?.apiBase;
        if (!apiBase) {
            return of(false);
        }

        return new Observable<boolean>(subscriber => {
            const url = `${apiBase}/vfs/files?path=${encodeURIComponent(path)}`;
            const sub = this.http.get<VfsNodeDto>(url, {
                headers: { Accept: 'application/ld+json' },
            }).subscribe({
                next: fresh => {
                    subscriber.next(fresh.permissions?.write ?? false);
                    subscriber.complete();
                },
                error: err => subscriber.error(err),
            });

            return () => sub.unsubscribe();
        });
    }
}
