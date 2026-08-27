import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { SpaceDto } from './space-dto';

/**
 * The part of an explorer's space handling that is genuinely identical across
 * libraries: fetch the space list once, order it, and work out which space the
 * user was last looking at.
 *
 * **Why this exists now and not earlier.** `MediaSpaceAccordionComponent` and
 * `DocumentSpaceAccordionComponent` were left as deliberate near-duplicates,
 * and the Media composer's header says why: a single generic
 * `SpaceAccordionComponent` would have to expose three module-specific
 * concerns — which state service to bridge, which child tree to project, and
 * what to do after a space change — as inputs or callbacks, "which is worse
 * than the ~150-LOC parallel composer for only two consumers".
 *
 * That reasoning was right, and it is also why this is a STORE and not a
 * component. Articles is the third consumer, so the duplication is no longer
 * two-of-a-kind; but the answer is to lift only the data logic, which has
 * none of those three concerns in it, and leave the composer to do the
 * module-specific wiring in plain code. Nothing here knows about trees, state
 * services, or side effects.
 *
 * Provide it on the component (`providers: [SpaceSelectionStore]`), not in
 * root — each explorer has its own independent selection.
 */
@Injectable()
export class SpaceSelectionStore {
    private readonly http = inject(HttpClient);
    private readonly destroyRef = inject(DestroyRef);

    readonly spaces = signal<readonly SpaceDto[]>([]);

    readonly activeKey = signal<string>('');

    /**
     * Root path of the active space, or `null` while unknown.
     *
     * Deliberately nullable rather than defaulting: the per-library fallback
     * (`/media`, `/docs`, …) is module knowledge, so it stays in the composer
     * as a one-line `?? '/media'`. Baking a default in here would mean either
     * a constructor argument this class cannot take (it is component-provided)
     * or a `configure()` call that every caller must remember to make before
     * the first read — temporal coupling for no gain.
     */
    readonly activeRootPath = computed<string | null>(() => {
        const key = this.activeKey();

        return this.spaces().find(s => s.key === key)?.rootPath ?? null;
    });

    /**
     * Load the spaces and pick the active one.
     *
     * `currentPath` is the explorer's persisted location: when it sits inside
     * one of the returned spaces that space is re-selected, so a reload lands
     * the user where they left off rather than bouncing them to the first
     * entry. Otherwise the lowest-priority space wins.
     *
     * **It is a GETTER, and that is load-bearing, not a style choice.** The
     * page state service restores its own `lastDir` from prefs asynchronously
     * relative to this component's `ngOnInit`, so reading the path eagerly
     * captures the service's *default* (`/media`) rather than the restored
     * value. Evaluating it after the spaces response lands is what the two
     * original composers did (they re-read `state.currentDir()` inside the
     * subscribe) and it is what makes "reload keeps your space" work. Passing
     * a plain string here silently reverts users to the first space on every
     * reload — caught in the browser, invisible to `ng build`.
     *
     * `fallback` covers a legacy install whose manifest exposes no spaces URL,
     * and doubles as the error path — an accordion with one usable entry beats
     * an empty left pane.
     */
    load(options: {
        url: string | null | undefined;
        fallback: () => SpaceDto[];
        currentPath: () => string;
    }): void {
        const { url, fallback, currentPath } = options;

        if (!url) {
            this.apply(fallback(), currentPath(), fallback);

            return;
        }

        this.http.get<Record<string, unknown>>(url).pipe(
            catchError(() => of({} as Record<string, unknown>)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(res => {
            // API Platform emits `hydra:member`; the JSON-LD-less profile uses
            // `member`. Both shapes are in play depending on the format the
            // client negotiated, so accept either rather than pinning one.
            const raw = (res['hydra:member'] ?? res['member'] ?? []) as ReadonlyArray<SpaceDto>;
            // Read the path HERE, not at call time -- see the note on the
            // `currentPath` parameter above.
            this.apply(raw.slice(), currentPath(), fallback);
        });
    }

    /** Select a space by key; returns it so the caller can act on the change. */
    select(key: string): SpaceDto | null {
        const next = this.spaces().find(s => s.key === key) ?? null;
        if (null !== next) {
            this.activeKey.set(key);
        }

        return next;
    }

    private apply(list: SpaceDto[], currentPath: string, fallback: () => SpaceDto[]): void {
        const final = list.length > 0 ? list : fallback();
        final.sort((a, b) => (a.priority - b.priority) || a.key.localeCompare(b.key));
        this.spaces.set(final);

        const match = final.find(s => currentPath === s.rootPath || currentPath.startsWith(`${s.rootPath}/`));
        this.activeKey.set(match?.key ?? final[0]?.key ?? '');
    }
}
