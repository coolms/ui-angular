import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Store } from '@ngxs/store';
import { AppConfigState, FormRenderDefinition } from '@coolms/core-angular';
/** WZ-C — result of `POST /forms/{id}/validate-step`. */
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
     * WZ-C — server-authoritative per-step validation. The wizard calls this on
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
