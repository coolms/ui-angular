import { InjectionToken, type Signal } from '@angular/core';

/**
 * Whether the page in front of the person is closed to them: something on it shows the elevation-required state
 * instead of its content. Provided by a shell that has pages; absent elsewhere.
 *
 * Each state that closes the page reports itself (`close`) and takes the report back when it changes or goes
 * (`open`), so the page is closed while any one of them is shown. A shell reads `closed` to leave out what would
 * repeat that state (a banner asking for the same elevation); a list page reads it to leave out a count of a list
 * it did not read.
 */
export interface PageClosure {
    readonly closed: Signal<boolean>;
    close(by: object): void;
    open(by: object): void;
}

export const PAGE_CLOSURE = new InjectionToken<PageClosure | null>('PAGE_CLOSURE');
