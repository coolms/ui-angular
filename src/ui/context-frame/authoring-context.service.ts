import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { Store } from '@ngxs/store';
import { AppConfigState } from '@coolms/core-angular';
import type { ContextAsset } from './cms-context-frame.component';

/** `GET /content/authoring-context` — what a surface must load to look like the site. */
export interface AuthoringContextDto {
    readonly themeSlug: string | null;
    readonly css: readonly ContextAsset[];
    readonly js: readonly ContextAsset[];
    /** CSS length (e.g. `210mm`), or null to leave the width unconstrained. */
    readonly contentMaxWidth: string | null;
}

/**
 * Fetches the theme stylesheets an authoring surface should adopt (#1767).
 *
 * Cached per (section, pageSize): the answer changes only when a section's
 * theme assignment or the page's size does, and an editor that re-fetched on
 * every keystroke would be asking a question whose answer it already has.
 *
 * Never errors outward. A failed lookup yields an EMPTY context so the editor
 * opens unstyled rather than not at all — the same rule the backend provider
 * follows, for the same reason: an author blocked from writing because a theme
 * is misconfigured is the worse outcome.
 */
@Injectable({ providedIn: 'root' })
export class AuthoringContextService {
    private readonly http = inject(HttpClient);
    private readonly store = inject(Store);

    private readonly cache = new Map<string, Observable<AuthoringContextDto>>();

    private static readonly EMPTY: AuthoringContextDto = {
        themeSlug: null,
        css: [],
        js: [],
        contentMaxWidth: null,
    };

    get(section = '', pageSize: string | null = null): Observable<AuthoringContextDto> {
        const key = `${section}|${pageSize ?? ''}`;
        const hit = this.cache.get(key);
        if (hit) {
            return hit;
        }

        const base = this.store.selectSnapshot(AppConfigState.manifest)?.apiBase ?? '/api/v1';
        let params = new HttpParams().set('section', section);
        if (null !== pageSize && '' !== pageSize) {
            params = params.set('pageSize', pageSize);
        }

        const req = this.http
            .get<Partial<AuthoringContextDto>>(`${base}/content/authoring-context`, { params })
            .pipe(
                // NORMALISE at the boundary. API-Platform omits null
                // properties, so `contentMaxWidth` arrives absent rather than
                // null and every downstream `null ===` check silently misses
                // it — which is exactly how the frame crashed on
                // `undefined.replace`. One place converts absent to null.
                map((dto): AuthoringContextDto => ({
                    themeSlug: dto.themeSlug ?? null,
                    css: dto.css ?? [],
                    js: dto.js ?? [],
                    contentMaxWidth: dto.contentMaxWidth ?? null,
                })),
                catchError(() => of(AuthoringContextService.EMPTY)),
                shareReplay({ bufferSize: 1, refCount: false }),
            );
        this.cache.set(key, req);

        return req;
    }
}
