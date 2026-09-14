import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Store } from '@ngxs/store';
import { AppConfigState, FormRenderDefinition } from '@coolms/core-angular';
/** WZ-C -- result of `POST /forms/{id}/validate-step`. */
export interface FormStepValidationResult {
    valid: boolean;
    /** field alias => server-side violation messages */
    violations: Record<string, string[]>;
}

@Injectable({ providedIn: 'root' })
export class FormRenderService {
    private readonly http  = inject(HttpClient);
    private readonly store = inject(Store);

    fetch(formId: string, context: 'create' | 'edit' = 'create'): Observable<FormRenderDefinition> {
        const apiBase = this.store.selectSnapshot(AppConfigState.manifest)?.apiBase ?? '/api/v1';
        const url     = `${apiBase}/forms/${encodeURIComponent(formId)}/render?context=${context}`;
        return this.http.get<FormRenderDefinition>(url);
    }

    /**
     * Render a definition that has NOT been saved -- the Form Builder's draft.
     * `POST /forms/{id}/preview` (admin): same server-side builder and
     * serialiser as {@link fetch}, nothing persisted. The body is the same
     * `{fields, formOptions, dataClass}` the builder sends on its replace
     * save, so the preview and the save are one payload.
     */
    preview(
        formId: string,
        definition: { fields: Record<string, unknown>; formOptions: Record<string, unknown>; dataClass?: string | null },
        context: 'create' | 'edit' = 'create',
    ): Observable<FormRenderDefinition> {
        const apiBase = this.store.selectSnapshot(AppConfigState.manifest)?.apiBase ?? '/api/v1';
        const url     = `${apiBase}/forms/${encodeURIComponent(formId)}/preview?context=${context}`;
        return this.http.post<FormRenderDefinition>(url, definition);
    }

    /**
     * WZ-C -- server-authoritative per-step validation. The wizard calls this on
     * "Next" (after its instant client-side check) to gate advancement on the
     * step's real server constraints. The server validates only the requested
     * step's fields and returns `{ valid, violations }`.
     */
    validateStep(
        formId: string,
        step: number,
        context: 'create' | 'edit',
        values: Record<string, unknown>,
    ): Observable<FormStepValidationResult> {
        const apiBase = this.store.selectSnapshot(AppConfigState.manifest)?.apiBase ?? '/api/v1';
        const url     = `${apiBase}/forms/${encodeURIComponent(formId)}/validate-step`;
        return this.http.post<FormStepValidationResult>(url, { step, context, values });
    }
}
