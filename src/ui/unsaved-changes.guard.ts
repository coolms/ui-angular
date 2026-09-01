import { inject } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';

import { ConfirmDialogService } from './confirm-dialog.service';

/**
 * A route component that can hold unsaved work.
 *
 * Structural on purpose: any component exposing `dirty()` qualifies, so the
 * guard needs no registry and no base class to extend.
 */
export interface HasUnsavedChanges {
    dirty(): boolean;
}

/**
 * Confirms before the ROUTER leaves a page with unsaved work.
 *
 * The three layers, and why each is needed:
 *
 * dialog close the per-editor confirm -- Cancel and the X
 * beforeunload UnsavedChangesService -- tab close, reload
 *   canDeactivate  THIS -- a sidebar link, the back button, any in-SPA nav
 *
 * A page editor is the case where the third matters most: a dialog is left by
 * a button we own, but a route is left by the router, and neither of the other
 * two layers sees that happen.
 *
 *  Attach this ONLY to routes whose component actually exposes `dirty()`.
 * Adding it to a route that does not is worse than leaving it off -- the route
 * config then reads as guarded while nothing is checked, and the next person
 * has no reason to look.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
    // Optional-called rather than assumed: a component can be destroyed or
    // mid-init when the router asks, and a guard that throws would strand the
    // user on the page with no way out -- a worse failure than the one it
    // exists to prevent.
    if (true !== component?.dirty?.()) return true;

    return inject(ConfirmDialogService).confirmDiscard();
};
