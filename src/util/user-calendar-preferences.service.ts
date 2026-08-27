import { Injectable, computed, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import { Observable, of, ReplaySubject, shareReplay } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { AuthState, AppConfigState, IdentityApiClient } from '@coolms/core-angular';

/**
 * Task #433 (M1.2.f.2) -- centralised reactive access to the user's
 * Calendar preferences (timezone, date/time format, week start,
 * default calendar).
 *
 * The user-stored values live in `IdentityProfile.extras.settings.calendar`
 * and reach the FE through the existing `GET /auth/me/settings`
 * endpoint that already serves the Preferences + Interface tabs. We
 * lazily load that response the first time any consumer reads a
 * preference, cache it (ReplaySubject) for the SPA lifetime, and
 * mirror the resolved-by-default values into Angular signals so
 * downstream calendar widgets (FullCalendar, MiniCalendar, EventEditor,
 * QuickPanel, topbar QuickAccess) can subscribe without nesting
 * `subscribe` calls.
 *
 * When the Profile page saves the Calendar tab it should call
 * `update(...)` so the cache is refreshed without a round-trip.
 *
 * Falls back to platform defaults if loading fails or the user is not
 * yet authenticated -- guarantees signals never expose `null`.
 */
export interface CalendarPrefs {
    readonly tz:                  string;        // IANA TZ id; "UTC" by default
    readonly dateFormat:          string;        // Angular date token
    readonly timeFormat:          '12h' | '24h';
    readonly defaultCalendarSlug: string | null; // null = personal-{uid}
    readonly weekStart:           'monday' | 'sunday';
}

/**
 * Last-resort fallback used only when the API manifest carries no
 * `platformDefaults` (older backend, or the manifest hasn't loaded). F6
 * (ADR-128) made the deployment-configured `platformDefaults` the real
 * source of these values; see `platformDefaults()` below.
 */
const HARDCODED_FALLBACK: CalendarPrefs = {
    tz:                  'UTC',
    dateFormat:          'yyyy-MM-dd',
    timeFormat:          '24h',
    defaultCalendarSlug: null,
    weekStart:           'monday',
};

@Injectable({ providedIn: 'root' })
export class UserCalendarPreferencesService {
    // `ApiService.getSettings()` was already a pass-through to this client, so
    // this reaches the same endpoint by a shorter route -- and one that does
    // not put the application's API under the UI kit.
    private readonly api   = inject(IdentityApiClient);
    private readonly store = inject(Store);

    private readonly _prefs = signal<CalendarPrefs>(this.platformDefaults());

    /** Hot stream of the prefs (replayable). Consumers usually prefer signals. */
    private readonly loaded$ = new ReplaySubject<CalendarPrefs>(1);

    private loadOnce$?: Observable<CalendarPrefs>;

    // ── Public signals (read-only) ────────────────────────────────────────────

    /** Whole preferences VO. */
    readonly prefs              = this._prefs.asReadonly();

    /** Convenience accessors. Each computed reads `_prefs()`. */
    readonly tz                 = computed(() => this._prefs().tz);
    readonly dateFormat         = computed(() => this._prefs().dateFormat);
    readonly timeFormat         = computed(() => this._prefs().timeFormat);
    readonly weekStart          = computed(() => this._prefs().weekStart);

    /**
     * Default calendar slug. When the user has not chosen one we fall
     * back to their personal calendar (slug `personal-{userId}`, minted
     * by `PersonalCalendarSeeder` on user creation). Null only when
     * there is no authenticated user.
     */
    readonly defaultCalendarSlug = computed<string | null>(() => {
        const stored = this._prefs().defaultCalendarSlug;
        if (stored) return stored;
        const user = this.store.selectSnapshot(AuthState.currentUser);
        return user?.id ? `personal-${user.id}` : null;
    });

    /**
     * 0 = Sunday, 1 = Monday -- the format FullCalendar's `firstDay`
     * option expects.
     */
    readonly firstDay = computed<0 | 1>(() => this._prefs().weekStart === 'sunday' ? 0 : 1);

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Trigger a one-shot load of `/auth/me/settings`. Subsequent calls
     * return the same cached observable. Callers may call this eagerly
     * (e.g., at app-init) or rely on the signals lazily — both work.
     */
    ensureLoaded(): Observable<CalendarPrefs> {
        if (this.loadOnce$) return this.loadOnce$;

        this.loadOnce$ = this.api.getSettings().pipe(
            map(all => this.merge((all['calendar'] as Partial<CalendarPrefs> | undefined) ?? {})),
            tap(prefs => {
                this._prefs.set(prefs);
                this.loaded$.next(prefs);
            }),
            catchError(() => {
                // On error (incl. anonymous users who can't hit
                // /auth/me/settings), expose the platform defaults so
                // consumers never see null and pre-login rendering uses
                // the deployment's configured TZ/format.
                const defaults = this.platformDefaults();
                this._prefs.set(defaults);
                this.loaded$.next(defaults);
                return of(defaults);
            }),
            shareReplay({ bufferSize: 1, refCount: false }),
        );
        return this.loadOnce$;
    }

    /**
     * Called by the Profile page after a successful Calendar-tab save.
     * Merges the partial response with the existing cache so signals
     * fire immediately, no GET roundtrip.
     */
    update(partial: Partial<CalendarPrefs>): void {
        this._prefs.update(prev => this.merge({ ...prev, ...partial }));
        // Also push the new value into the loaded$ stream so any
        // observable-based consumers (current or future) see the change
        // without having to re-fetch.
        this.loaded$.next(this._prefs());
    }

    /**
     * Force a re-fetch of /auth/me/settings, bypassing the `loadOnce$`
     * cache. Triggered by Calendar feature components on mount so the
     * UI is always in sync with the server, even if the in-memory
     * `_prefs` got stale (e.g., Profile save handler killed by
     * `takeUntilDestroyed` mid-flight, prefs changed in another tab,
     * or any other edge case where the cached singleton drifted from
     * the persisted truth). Returns the resolved observable so callers
     * can subscribe in a `next:` handler to react when the fresh value
     * arrives.
     */
    refresh(): Observable<CalendarPrefs> {
        this.loadOnce$ = undefined;
        return this.ensureLoaded();
    }

    /** Reset to defaults — used by AuthState when the user logs out. */
    reset(): void {
        this._prefs.set(this.platformDefaults());
        this.loadOnce$ = undefined;
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private merge(overrides: Partial<CalendarPrefs>): CalendarPrefs {
        // The floor a user's stored overrides sit on: the deployment's
        // platform defaults (F6), not an FE-hardcoded Western default.
        const defaults = this.platformDefaults();
        const out: CalendarPrefs = {
            tz:                  this.coerceString(overrides.tz,         defaults.tz),
            dateFormat:          this.coerceString(overrides.dateFormat, defaults.dateFormat),
            // Validate the enum: an unrecognised stored value falls to the
            // platform default, not silently through.
            timeFormat:          overrides.timeFormat === '12h' || overrides.timeFormat === '24h'
                                    ? overrides.timeFormat
                                    : defaults.timeFormat,
            weekStart:           overrides.weekStart === 'monday' || overrides.weekStart === 'sunday'
                                    ? overrides.weekStart
                                    : defaults.weekStart,
            defaultCalendarSlug: typeof overrides.defaultCalendarSlug === 'string'
                && overrides.defaultCalendarSlug.length > 0
                    ? overrides.defaultCalendarSlug
                    : null,
        };
        return out;
    }

    /**
     * Effective platform defaults: the manifest's `platformDefaults`
     * (deployment-configured) per field, falling back to the bundled
     * {@link HARDCODED_FALLBACK} when the manifest carries none. Read
     * fresh from the store each call so a late-arriving manifest is
     * picked up; the manifest is loaded at app-init before any calendar
     * widget mounts, so in practice this always reflects config.
     *
     * `platformDefaults` has no `defaultCalendarSlug` (there is no
     * platform-wide calendar) -- that stays null.
     */
    private platformDefaults(): CalendarPrefs {
        const pd = this.store.selectSnapshot(AppConfigState.manifest)?.platformDefaults;
        if (!pd) {
            return HARDCODED_FALLBACK;
        }
        return {
            tz:                  this.coerceString(pd.timezone,   HARDCODED_FALLBACK.tz),
            dateFormat:          this.coerceString(pd.dateFormat, HARDCODED_FALLBACK.dateFormat),
            timeFormat:          pd.timeFormat === '12h' ? '12h' : '24h',
            weekStart:           pd.weekStart  === 'sunday' ? 'sunday' : 'monday',
            defaultCalendarSlug: null,
        };
    }

    private coerceString(v: unknown, fallback: string): string {
        return typeof v === 'string' && v.length > 0 ? v : fallback;
    }
}
