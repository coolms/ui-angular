import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { EntityFieldsResponse } from './cms-filter-builder.types';

/**
 * Phase X-2.6a — thin RPC for the X-2.5 endpoint:
 *
 *   GET /api/v1/entity/{alias}/filters
 *
 * ROLE_ADMIN — the wizard host is admin-only so no per-request
 * guard here; auth failure surfaces as the usual 401/403 the
 * global error handler already covers.
 */
@Injectable({ providedIn: 'root' })
export class EntityFieldsService {
    private readonly http = inject(HttpClient);

    /**
     * @param alias  Entity alias as declared by `#[ClassMeta(alias:…)]`
     *               (e.g. 'identity_user'). The backend resolves the alias
     *               to a concrete FQCN before reflecting.
     */
    fetch(alias: string): Observable<EntityFieldsResponse> {
        return this.http.get<EntityFieldsResponse>(
            `/api/v1/entity/${encodeURIComponent(alias)}/filters`,
        );
    }
}
