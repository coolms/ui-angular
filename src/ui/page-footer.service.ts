import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

export interface FooterPagination {
    page:       number;
    totalPages: number;
}

export interface FooterState {
    count?:      string;        // e.g. "2 dirs, 1 file" | "7 items"
    selected?:   string;        // e.g. "3 selected" — omit when nothing is selected
    loading?:    boolean;       // show spinner when true
    pagination?: FooterPagination; // renders Prev / page info / Next on the right
}

/**
 * Scoped service that lets content components push footer status data to the
 * parent layout (ExplorerLayoutComponent or ListLayoutComponent).
 *
 * No `providedIn` — must be provided by the page or layout component.
 *
 * Pagination:
 *  - Content components call `update({ pagination: { page, totalPages } })`.
 *  - CmsPageFooterComponent renders Prev/Next and calls `prev()` / `next()`.
 *  - Content components subscribe to `prevPage$` / `nextPage$` to respond.
 */
@Injectable()
export class PageFooterService {
    readonly state = signal<FooterState>({});

    private readonly prevSubject = new Subject<void>();
    private readonly nextSubject = new Subject<void>();

    /** Emits when the user clicks Prev in the footer pagination. */
    readonly prevPage$ = this.prevSubject.asObservable();
    /** Emits when the user clicks Next in the footer pagination. */
    readonly nextPage$ = this.nextSubject.asObservable();

    set(state: FooterState): void {
        this.state.set(state);
    }

    update(partial: Partial<FooterState>): void {
        this.state.update(s => ({ ...s, ...partial }));
    }

    clear(): void {
        this.state.set({});
    }

    prev(): void { this.prevSubject.next(); }
    next(): void { this.nextSubject.next(); }
}
