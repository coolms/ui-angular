import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { Observable } from 'rxjs';
import { AppConfigState } from '@coolms/core-angular';
import type {
    CentrifugoAdminDisconnectInput,
    CentrifugoAdminPublishInput,
    CentrifugoChannelHistoryDto,
    CentrifugoChannelPresenceDto,
    CentrifugoChannelsListDto,
    CentrifugoNamespacesListDto,
    CentrifugoNodeInfoDto,
} from './types';

/**
 * Phase 1.5 sub-phase 1.5b -- thin client for the 7 admin
 * proxy endpoints shipped in 1.5a. Kept in its own service rather
 * than bolted onto `ApiService` so the admin-only surface stays
 * scoped and easy to delete if Centrifugo is ever removed.
 *
 * All methods 401 / 403 when the caller is not ROLE_ADMIN -- the
 * backend's API Platform `security:` expression handles that gate;
 * the components handle the error message rendering.
 */
@Injectable({ providedIn: 'root' })
export class CentrifugoAdminService {
    private readonly http = inject(HttpClient);
    private readonly store = inject(Store);

    private get apiBase(): string {
        const manifest = this.store.selectSnapshot(AppConfigState.manifest);
        if (manifest === null || manifest === undefined) {
            throw new Error('ApiManifest not loaded -- call AppInitService.load() first.');
        }
        return manifest.apiBase;
    }

    getNodeInfo(): Observable<CentrifugoNodeInfoDto> {
        return this.http.get<CentrifugoNodeInfoDto>(this.apiBase + '/centrifugo/admin/info');
    }

    getNamespaces(): Observable<CentrifugoNamespacesListDto> {
        return this.http.get<CentrifugoNamespacesListDto>(this.apiBase + '/centrifugo/admin/namespaces');
    }

    /**
     * Optional pattern follows Centrifugo's glob (e.g., `document.*`).
     * Empty / null means no filter.
     */
    getChannels(pattern?: string | null): Observable<CentrifugoChannelsListDto> {
        let params = new HttpParams();
        if (pattern !== null && pattern !== undefined && pattern !== '') {
            params = params.set('pattern', pattern);
        }
        return this.http.get<CentrifugoChannelsListDto>(this.apiBase + '/centrifugo/admin/channels', { params });
    }

    getChannelPresence(channel: string): Observable<CentrifugoChannelPresenceDto> {
        return this.http.get<CentrifugoChannelPresenceDto>(
            this.apiBase + '/centrifugo/admin/channel/' + encodeURIComponent(channel) + '/presence',
        );
    }

    getChannelHistory(channel: string, limit = 50, reverse = true): Observable<CentrifugoChannelHistoryDto> {
        const params = new HttpParams()
            .set('limit', limit.toString())
            .set('reverse', reverse ? 'true' : 'false');
        return this.http.get<CentrifugoChannelHistoryDto>(
            this.apiBase + '/centrifugo/admin/channel/' + encodeURIComponent(channel) + '/history',
            { params },
        );
    }

    publish(input: CentrifugoAdminPublishInput): Observable<CentrifugoAdminPublishInput> {
        return this.http.post<CentrifugoAdminPublishInput>(this.apiBase + '/centrifugo/admin/publish', input);
    }

    disconnect(input: CentrifugoAdminDisconnectInput): Observable<void> {
        return this.http.post<void>(this.apiBase + '/centrifugo/admin/disconnect', input);
    }
}
