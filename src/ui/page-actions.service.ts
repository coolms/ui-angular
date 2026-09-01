import { Injectable, signal } from '@angular/core';
import { ToolbarAction } from './page-toolbar.component';

/**
 * Scoped service that connects slot-rendered content components to the
 * page header rendered by their parent layout (e.g. ListLayoutComponent).
 *
 * Usage:
 *  - Page components (SectionsPageComponent, DynamicRecordPageComponent, …)
 *    provide it in `providers: [PageActionsService]`.
 *  - ListLayoutComponent injects it (without providing its own) and reads
 *    `pageActions.actions()` to populate `CmsPageHeaderComponent`.
 *  - Content components (SectionsListComponent, NaviTreesListComponent, …)
 *    inject it with `{ optional: true }` and call `register()` in ngOnInit.
 *
 * Keeping `providedIn` absent ensures each layout gets its own instance.
 */
@Injectable()
export class PageActionsService {
    readonly actions = signal<ToolbarAction[]>([]);
    /**
     * Optional page-header title override set by content components after async
     * data loads (e.g. DynamicRecordListComponent after schema resolves).
     * ListLayoutComponent prioritises this over its YAML-config title.
     */
    readonly title = signal<string>('');

    private handlers = new Map<string, () => void>();

    /**
     * Register the set of header actions and their click handlers.
     * Calling this again replaces the previous registration.
     */
    register(actions: ToolbarAction[], handlers: Record<string, () => void>): void {
        this.actions.set(actions);
        this.handlers = new Map(Object.entries(handlers));
    }

    /**
     * Register click handlers without touching the rendered action set.
     * Used by layout-driven pages where the header buttons come
     * from layout YAML (the layout shell renders them) and the slot
     * component only contributes behaviour. Each call merges into the
     * existing handler map (matching ids overwrite, others survive).
     */
    setHandlers(handlers: Record<string, () => void>): void {
        for (const [id, fn] of Object.entries(handlers)) {
            this.handlers.set(id, fn);
        }
    }

    /** Push a dynamic title (overrides the YAML-config title in ListLayoutComponent). */
    setTitle(title: string): void {
        this.title.set(title);
    }

    /** Invoke the handler registered for the given action id (no-op if none). */
    dispatch(actionId: string): void {
        this.handlers.get(actionId)?.();
    }
}
