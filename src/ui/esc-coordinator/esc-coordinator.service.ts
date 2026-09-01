import { DestroyRef, inject, Injectable, NgZone } from '@angular/core';

/**
 * Returns `true` when the handler consumed the ESC (the coordinator
 * stops the chain and calls `preventDefault + stopPropagation`).
 * Returns `false` when the handler's overlay isn't active so the
 * next handler in the stack gets a chance.
 */
export type EscHandler = () => boolean;

/**
 * Shared ESC coordinator ( §3). Replaces 3 modal-scope
 * `@HostListener('document:keydown.escape')` bindings that compete on
 * the same global keystroke. LIFO stack — last registered fires
 * first — matches visual z-index stacking so the topmost overlay
 * closes before any underneath.
 *
 * Inline-scope `(keydown.escape)` bindings on inputs (rename fields,
 * search dropdowns) are NOT consumers — they fire only when their
 * input has focus and don't compete on the global keystroke.
 */
@Injectable({ providedIn: 'root' })
export class EscCoordinatorService {
    private readonly stack: EscHandler[] = [];
    private readonly listener: (event: KeyboardEvent) => void;

    constructor() {
        const zone = inject(NgZone);
        this.listener = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }
            // Iterate from top of stack (last-registered first). Stop
            // at the first handler that returns true; coordinator
            // owns preventDefault + stopPropagation at that point.
            for (let i = this.stack.length - 1; i >= 0; i -= 1) {
                let consumed = false;
                zone.run(() => {
                    consumed = this.stack[i]();
                });
                if (consumed) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
            }
        };
        document.addEventListener('keydown', this.listener);
        inject(DestroyRef).onDestroy(() => {
            document.removeEventListener('keydown', this.listener);
        });
    }

    /**
     * Push `handler` onto the LIFO stack. Returns an unregister
     * callback — the consumer MUST call it when its overlay closes
     * (e.g. in `ngOnDestroy`), or the handler stays dead-weight on
     * the stack and ESC iteration cost grows.
     *
     * Calling the returned unregister twice is a no-op (idempotent).
     */
    register(handler: EscHandler): () => void {
        this.stack.push(handler);
        let unregistered = false;
        return () => {
            if (unregistered) {
                return;
            }
            unregistered = true;
            const idx = this.stack.lastIndexOf(handler);
            if (idx >= 0) {
                this.stack.splice(idx, 1);
            }
        };
    }
}
