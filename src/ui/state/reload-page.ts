import { InjectionToken } from '@angular/core';

/**
 * How the host shell loads the page in front of the person again: it is made anew, so every read it makes on
 * arrival is made again. Provided by a shell that has pages; absent elsewhere.
 */
export const RELOAD_PAGE = new InjectionToken<(() => void) | null>('RELOAD_PAGE');
