import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';

import type { DynamicEntityTypeDto } from './schema.types';

/**
 * The one thing the shared dynamic-record list needs from the schema feature.
 *
 * Deliberately ONE method. The feature's service has around twenty, and a port
 * that mirrored it would just move the coupling behind an interface -- the
 * point is that shared declares the little it actually uses, and the app binds
 * something that satisfies it.
 */
export interface RuntimeTypesPort {
    listRuntimeTypes(): Observable<DynamicEntityTypeDto[]>;
}

/**
 * Bound in the application's composition root, so `shared/` never names the
 * implementation and the feature never has to know who consumes it.
 */
export const RUNTIME_TYPES_PORT = new InjectionToken<RuntimeTypesPort>(
    'coolms.runtime-types-port',
);
