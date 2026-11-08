import { Injectable, computed, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import { Observable, of, ReplaySubject, shareReplay } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { AuthState, AppConfigState, IdentityApiClient } from '@coolms/core-angular';

/**
 * Task () -- centralised reactive access to the user's
 * Calendar preferences (timezone, date/time format, week start,
 * default calendar).
 *
 * The time zone, date and time formats and week start are the person's
 * `region` settings, and the default calendar is in their `calendar`
 * section; both reach the FE through `GET /auth/me/settings`, read by
 * {@link calendarPrefsFromSettings}. We
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
 * made the deployment-configured `platformDefaults` the real
 * source of these values; see `platformDefaults()` below.
 */
const HARDCODED_FALLBACK: CalendarPrefs = {
    tz:                  'UTC',
    dateFormat:          'yyyy-MM-dd',
    timeFormat:          '24h',
    defaultCalendarSlug: null,
    weekStart:           'monday',
};

/** The word a time zone setting holds when the person follows their device: never a zone. */
const AUTOMATIC = 'automatic';

/**
 * Calendar preferences as a settings answer carries them: any subset of the keys, and a zone of null where the person
 * has none of their own -- they follow their device -- so the device's zone or the platform default applies.
 */
export type CalendarPrefsRead = Partial<Omit<CalendarPrefs, 'tz'>> & { readonly tz?: string | null };

/**
 * The calendar preferences a `GET /auth/me/settings` answer carries: the zone, the formats and the week start from
 * the `region` section, the default calendar from `calendar`. A key the answer does not carry is left out, so what
 * a reader has stays. `automatic` is not a zone: it reads as a zone of null, so a reader leaves the zone it had and
 * takes the device's zone, or the platform default.
 */
export function calendarPrefsFromSettings(all: Record<string, unknown> | null | undefined): CalendarPrefsRead {
    const section = (name: string): Record<string, unknown> => {
        const value = all?.[name];
        return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
    };
    const region = section('region');
    const calendar = section('calendar');
    const out: { -readonly [K in keyof CalendarPrefsRead]?: CalendarPrefsRead[K] } = {};
    if (region['timezone'] === AUTOMATIC) {
        out.tz = null;
    } else if (typeof region['timezone'] === 'string') {
        out.tz = region['timezone'];
    }
    if (typeof region['dateFormat'] === 'string') {
        out.dateFormat = region['dateFormat'];
    }
    if (region['timeFormat'] === '12h' || region['timeFormat'] === '24h') {
        out.timeFormat = region['timeFormat'];
    }
    if (region['weekStart'] === 'monday' || region['weekStart'] === 'sunday') {
        out.weekStart = region['weekStart'];
    }
    if (typeof calendar['defaultCalendarSlug'] === 'string') {
        out.defaultCalendarSlug = calendar['defaultCalendarSlug'];
    }
    return out;
}

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

    /** The zone a person who follows their device is in; null when they chose one. */
    private deviceZone: string | null = null;
    /** The zone the section last answered, for when a person stops following their device. */
    private sectionZone: string | null = null;

    // -- Public signals (read-only) --------------------------------------------

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

    // -- Lifecycle -------------------------------------------------------------

    /**
     * Trigger a one-shot load of `/auth/me/settings`. Subsequent calls
     * return the same cached observable. Callers may call this eagerly
     * (e.g., at app-init) or rely on the signals lazily -- both work.
     */
    ensureLoaded(): Observable<CalendarPrefs> {
        if (this.loadOnce$) return this.loadOnce$;

        this.loadOnce$ = this.api.getSettings().pipe(
            map(all => {
                const read = calendarPrefsFromSettings(all);
                this.sectionZone = null === read.tz ? null : read.tz ?? this.sectionZone;
                return this.merge(read);
            }),
            tap(prefs => {
                this._prefs.set(prefs);
                this.loaded$.next(prefs);
            }),
            catchError(() => {
                // On error (incl. anonymous users who can't hit
                // /auth/me/settings), expose the platform defaults so
                // consumers never see null and pre-login rendering uses
                // the deployment's configured TZ/format.
                const defaults = this.merge(this.platformDefaults());
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
    update(partial: CalendarPrefsRead): void {
        // A zone of null is none of the person's: the one held before goes, and the device's zone or the default applies.
        this.sectionZone = null === partial.tz ? null : partial.tz ?? this.sectionZone;
        this._prefs.update(prev => this.merge({ ...prev, ...partial, tz: null === partial.tz ? null : partial.tz ?? prev.tz }));
        // Also push the new value into the loaded$ stream so any
        // observable-based consumers (current or future) see the change
        // without having to re-fetch.
        this.loaded$.next(this._prefs());
    }

    /**
     * A person whose time zone follows their device: dates here are in `zone`, whatever the section answers, on this
     * read and every later one. Null when they chose a zone, which puts the section's back.
     */
    followDeviceZone(zone: string | null): void {
        this.deviceZone = zone;
        this._prefs.update(prev => this.merge({ ...prev, tz: this.sectionZone ?? this.platformDefaults().tz }));
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

    /** Reset to defaults -- used by AuthState when the user logs out. */
    reset(): void {
        this.deviceZone = null;
        this.sectionZone = null;
        this._prefs.set(this.platformDefaults());
        this.loadOnce$ = undefined;
    }

    // -- Internals -------------------------------------------------------------

    private merge(overrides: CalendarPrefsRead): CalendarPrefs {
        // The floor a user's stored overrides sit on: the deployment's
        // platform defaults (F6), not an FE-hardcoded Western default.
        const defaults = this.platformDefaults();
        const out: CalendarPrefs = {
            tz:                  this.deviceZone ?? this.coerceString(overrides.tz, defaults.tz),
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
