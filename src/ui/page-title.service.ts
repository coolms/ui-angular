import { Injectable, signal } from '@angular/core';

/**
 * Global singleton that carries the current page's human-readable title
 * for consumers that live outside the scoped PageActionsService context.
 *
 * Primary consumer: AdminTopbarComponent overrides the last breadcrumb segment
 * when a content component (e.g. DynamicRecordListComponent) sets a label after
 * async data loads.
 *
 * Lifecycle contract:
 *  - Content components call set() once their title is resolved.
 *  - AdminTopbarComponent calls clear() on every NavigationEnd (before rebuilding
 *    crumbs), so stale titles from previous pages never bleed into the next route.
 */
@Injectable({ providedIn: 'root' })
export class PageTitleService {
    readonly current = signal<string | null>(null);

    set(title: string): void {
        this.current.set(title);
    }

    clear(): void {
        this.current.set(null);
    }
}
