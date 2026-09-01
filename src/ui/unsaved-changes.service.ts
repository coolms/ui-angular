import { Injectable } from '@angular/core';

/**
 * The browser-level half of the unsaved-changes guard.
 *
 * The per-dialog confirm covers Cancel and the header X. It
 * does nothing for the ways the PAGE goes away: closing the tab, hitting
 * reload, or following a link out of the SPA. MEASURED before this existed:
 * zero `beforeunload` handlers in the entire frontend, against 30 files
 * tracking a dirty flag.
 *
 * ## Why a registry and not a listener per editor
 *
 * `beforeunload` is a document-level event, so N editors would mean N
 * listeners racing to cancel the same event, and each would have to remember
 * to remove itself. One listener asking a set of sources is the same
 * behaviour with one place to get it wrong.
 *
 * ## Why the listener is always attached
 *
 * It could be added on the first source and removed with the last. It is not,
 * because that is state to keep correct for no gain: with no sources the
 * handler asks an empty set and returns immediately.
 *
 *  **The wording is the browser's, not ours.** Chrome, Firefox and Safari
 * all ignore a custom string and show their own "Leave site?" prompt. Anything
 * we wrote here would be dead code that reads like a feature -- so nothing is
 * written, and `preventDefault()` is the whole of the contract.
 *
 *  **A prompt that fires when nothing is dirty is worse than none**: it
 * trains people to click through it, and then the one that mattered is
 * clicked through too. Sources are asked at event time rather than cached,
 * and a source that throws is treated as clean rather than blocking the exit.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedChangesService {
    /**
     * Keyed by the owner so a component that registers twice (a re-init, a
     * hot reload) replaces its own entry instead of leaving a stale one that
     * reports dirty forever.
     */
    private readonly sources = new Map<object, () => boolean>();

    constructor() {
        // Guarded for the unit suite and any non-browser rendering path.
        if ('undefined' === typeof window) return;

        window.addEventListener('beforeunload', (event: BeforeUnloadEvent) => {
            if (!this.anyDirty()) return;

            // Both are needed: preventDefault() is the modern contract,
            // returnValue the one older engines still read.
            event.preventDefault();
            event.returnValue = '';
        });
    }

    /**
     * Registers a dirty-state source and returns its disposer.
     *
     * The caller passes a THUNK rather than a boolean so the answer is read at
     * unload time; a snapshot taken at registration would always say "clean".
     *
     * Typical use, which cannot leak because the disposer is tied to the
     * component's own lifetime:
     *
     *     const stop = this.unsaved.watch(this, () => this.dirty());
     *     inject(DestroyRef).onDestroy(stop);
     */
    watch(owner: object, isDirty: () => boolean): () => void {
        this.sources.set(owner, isDirty);

        return () => { this.sources.delete(owner); };
    }

    /** True when any registered source reports unsaved work. */
    anyDirty(): boolean {
        for (const isDirty of this.sources.values()) {
            try {
                if (isDirty()) return true;
            } catch {
                // A source mid-teardown must not be able to trap the user on
                // the page. Treat it as clean and keep asking the others.
            }
        }

        return false;
    }

    /** How many sources are registered. Exposed for tests and diagnostics. */
    get size(): number {
        return this.sources.size;
    }
}
