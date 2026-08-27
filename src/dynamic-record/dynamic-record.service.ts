import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable, of, throwError } from 'rxjs';
import { Store } from '@ngxs/store';
import { AppConfigState, resolvePattern, type HydraCollection } from '@coolms/core-angular';

export interface DynamicRecordDto {
    id:         string;
    entityType: string;       // alias: 'phone-accessories'
    slug:       string | null;
    categoryId: string | null;
    createdAt:  string;
    updatedAt:  string;
    // dynamic fields are flat top-level properties
    [key: string]: unknown;
}

export interface DynamicRecordListParams {
    page?:    number;
    limit?:   number;
    /** One or more RQL filter expressions (e.g. `title cn "product"`). Appended as repeated `filter=` params. */
    filters?: ReadonlyArray<string>;
    sort?:    string;
}

export interface DynamicRecordListResult {
    items: DynamicRecordDto[];
    total: number;
}

@Injectable({ providedIn: 'root' })
export class DynamicRecordService {
    private readonly http  = inject(HttpClient);
    private readonly store = inject(Store);

    private get manifest() {
        return this.store.selectSnapshot(AppConfigState.manifest)?.dynamicEntity;
    }

    listRecords(
        typeAlias: string,
        params?: DynamicRecordListParams,
    ): Observable<DynamicRecordListResult> {
        const pattern = this.manifest?.recordsByTypeUrl;
        if (!pattern) {
            console.warn('[DynamicRecordService] manifest.dynamicEntity.recordsByTypeUrl is not configured');
            return of({ items: [], total: 0 });
        }
        const url = resolvePattern(pattern, { type: typeAlias });

        let httpParams = new HttpParams();
        if (params?.page  != null) httpParams = httpParams.set('page',  params.page);
        if (params?.limit != null) httpParams = httpParams.set('limit', params.limit);
        for (const expr of params?.filters ?? []) {
            httpParams = httpParams.append('filter', expr);
        }
        if (params?.sort)          httpParams = httpParams.set('sort',  params.sort);

        // The API returns a Hydra Collection: { member: T[], totalItems: number, ... }.
        // Map to the flat DynamicRecordListResult shape used throughout the component layer.
        return this.http.get<HydraCollection<DynamicRecordDto>>(url, { params: httpParams }).pipe(
            map(r => ({ items: r.member, total: r.totalItems })),
        );
    }

    getRecord(id: string): Observable<DynamicRecordDto> {
        const pattern = this.manifest?.recordUrl;
        if (!pattern) return throwError(() => new Error('manifest.dynamicEntity.recordUrl not configured'));
        return this.http.get<DynamicRecordDto>(resolvePattern(pattern, { id }));
    }

    createRecord(data: {
        entityType:  string;
        slug?:       string;
        categoryId?: string;
        /** Flat dynamic field values (e.g. title, price). */
        [key: string]: unknown;
    }): Observable<DynamicRecordDto> {
        const pattern = this.manifest?.recordsByTypeUrl;
        if (!pattern) return throwError(() => new Error('manifest.dynamicEntity.recordsByTypeUrl not configured'));
        return this.http.post<DynamicRecordDto>(resolvePattern(pattern, { type: data.entityType }), data);
    }

    /** Partially updates a record. Pass flat dynamic field values (e.g. `{ title: '...' }`). */
    updateRecord(id: string, data: Record<string, unknown>): Observable<DynamicRecordDto> {
        const pattern = this.manifest?.recordUrl;
        if (!pattern) return throwError(() => new Error('manifest.dynamicEntity.recordUrl not configured'));
        return this.http.patch<DynamicRecordDto>(
            resolvePattern(pattern, { id }),
            data,
            { headers: { 'Content-Type': 'application/merge-patch+json' } },
        );
    }

    deleteRecord(id: string): Observable<void> {
        const pattern = this.manifest?.recordUrl;
        if (!pattern) return throwError(() => new Error('manifest.dynamicEntity.recordUrl not configured'));
        return this.http.delete<void>(resolvePattern(pattern, { id }));
    }
}
