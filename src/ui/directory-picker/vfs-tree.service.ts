import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import type { VfsDirectoryPage, VfsNodeDto } from '../../vfs/vfs.types';

// `VfsDirectoryPage` -- one page of `GET /api/v1/vfs/directories/list` -- is
// declared once, beside the other VFS wire shapes. This file used to carry an
// identical copy but for a `readonly` on the array, so two declarations
// described one endpoint and could drift apart without anything noticing.
export type { VfsDirectoryPage };

/**
 * Thin HTTP client for the three VFS endpoints the
 * `<cms-directory-picker>` consumes:
 *
 *   1. List children of a directory path (paginated).
 *   2. Create a new directory at a path.
 *   3. Stat a path (used to validate user-typed paths in the picker's
 *      path input before the tree navigates).
 *
 * No state — the picker component owns the in-memory tree cache and
 * decides when to fetch. All methods return cold observables;
 * `resolvePath` swallows 404 / 422 into `null` so the path-input UX
 * can show an inline "not found" hint without a try/catch tangle in
 * the component.
 */
@Injectable({ providedIn: 'root' })
export class VfsTreeService {
    private readonly http = inject(HttpClient);

    /**
     * Fetch a single page of directory children. `showHidden=true`
     * surfaces names starting with `.` or `_`; backend still enforces
     * read permission, so the response is already permission-filtered.
     */
    listChildren(
        parentPath: string,
        options: { showHidden?: boolean; limit?: number; cursor?: string } = {},
    ): Observable<VfsDirectoryPage> {
        let params = new HttpParams()
            .set('path', parentPath)
            .set('showHidden', options.showHidden ? 'true' : 'false');
        if (options.limit !== undefined) {
            params = params.set('limit', String(options.limit));
        }
        if (options.cursor) {
            params = params.set('cursor', options.cursor);
        }
        return this.http
            .get<VfsDirectoryPage>('/api/v1/vfs/directories/list', { params });
    }

    /**
     * Create a directory at `path`. Server returns 201 with the new
     * node, 403 when the caller lacks write on the parent, 409 when
     * the name already exists.
     */
    createDirectory(path: string, mode?: string): Observable<VfsNodeDto> {
        return this.http.post<VfsNodeDto>(
            '/api/v1/vfs/directories',
            mode ? { path, mode } : { path },
        );
    }

    /**
     * Stat a path. Returns the node when reachable + readable;
     * `null` when missing (404) or rejected (403 / 422) so the
     * caller can treat "invalid path" uniformly without parsing
     * HTTP statuses.
     */
    resolvePath(path: string): Observable<VfsNodeDto | null> {
        return this.http
            .get<VfsNodeDto>('/api/v1/vfs/files', { params: new HttpParams().set('path', path) })
            .pipe(
                map((node): VfsNodeDto | null => node),
                catchError(() => of<VfsNodeDto | null>(null)),
            );
    }
}
