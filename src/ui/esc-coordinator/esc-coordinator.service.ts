import { DestroyRef, inject, Injectable } from '@angular/core';
import { KeyboardScopeService } from '../keyboard-scope/keyboard-scope.service';

/**
 * Returns `true` when the handler consumed the ESC (the coordinator
 * stops the chain and calls `preventDefault + stopPropagation`).
 * Returns `false` when the handler's overlay isn't active so the
 * next handler in the stack gets a chance.
 */
export type EscHandler = () => boolean;

/**
 * Shared ESC coordinator ( section 3). Replaces 3 modal-scope
 * `@HostListener('document:keydown.escape')` bindings that compete on
 * the same global keystroke. LIFO stack -- last registered fires
 * first -- matches visual z-index stacking so the topmost overlay
 * closes before any underneath.
 *
 * The stack is the keyboard scope's ({@link KeyboardScopeService}): an ESC
 * handler is a binding on any layer, in text fields too, so ESC and every
 * other shortcut go through one document listener and one stack.
 *
 * Inline-scope `(keydown.escape)` bindings on inputs (rename fields,
 * search dropdowns) are NOT consumers -- they fire only when their
 * input has focus and don't compete on the global keystroke.
 */
@Injectable({ providedIn: 'root' })
export class EscCoordinatorService {
    private readonly scope = inject(KeyboardScopeService);
    private readonly unbinds = new Set<() => void>();

    constructor() {
        inject(DestroyRef).onDestroy(() => {
            for (const unbind of this.unbinds) unbind();
            this.unbinds.clear();
        });
    }

    /**
     * Push `handler` onto the LIFO stack. Returns an unregister
     * callback -- the consumer MUST call it when its overlay closes
     * (e.g. in `ngOnDestroy`), or the handler stays dead-weight on
     * the stack and ESC iteration cost grows.
     *
     * Calling the returned unregister twice is a no-op (idempotent).
     */
    register(handler: EscHandler): () => void {
        const unbind = this.scope.bindAnyLayer(event => event.key === 'Escape' && handler());
        this.unbinds.add(unbind);
        return () => {
            this.unbinds.delete(unbind);
            unbind();
        };
    }
}
