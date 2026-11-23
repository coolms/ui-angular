import { Injectable, inject } from '@angular/core';

import { UserCalendarPreferencesService } from './user-calendar-preferences.service';
import { formatLocalDate, formatLocalTime } from '../ui/range-picker/prefs-format';

/**
 * Platform-wide, preference-aware date/time formatter.
 *
 * The single seam every surface (Messages, Dynamic Chat, Designer, Editor, ...)
 * should use to render an instant, so a user's **Profile -> Calendar** choices
 * (12h/24h time, date format, timezone) are honoured EVERYWHERE -- not just in
 * the Calendar. Before this, each surface hand-rolled `toLocaleTimeString([])`,
 * which defers to the BROWSER locale (-> 12h regardless of the saved pref) and
 * ignored the timezone.
 *
 * It reuses the existing infrastructure rather than reinventing it:
 *  - {@link UserCalendarPreferencesService} (root singleton) -- the resolved
 *    `tz` / `dateFormat` / `timeFormat` signals, loaded from `/auth/me/settings`
 *    (cascading over the deployment's platform defaults). Despite its
 *    `features/calendars/` home it IS the platform's user date/time pref source.
 *  - {@link formatLocalDate} / {@link formatLocalTime} (the range-picker
 *    helpers) -- the same canonical -> display routines the pickers use, so a
 *    date renders identically in a filter input and a chat bubble.
 *
 * An ISO instant is first projected into the user's timezone (via `Intl` with
 * an explicit `timeZone`) to canonical `YYYY-MM-DD` + `HH:mm`, then displayed
 * through those helpers.
 *
 * The methods are plain (call them from a template expression or the
 * {@link DateTimePipe}); they read the pref signals on each call, so a
 * mid-session pref change reflects on the next change-detection pass.
 */
@Injectable({ providedIn: 'root' })
export class DateTimeFormatService {
    private readonly prefs = inject(UserCalendarPreferencesService);

    constructor() {
        // Warm the pref cache the moment any surface first needs formatting,
        // so a thread opened before any Calendar widget mounted still gets the
        // user's real tz/format (not the pre-load platform default).
        this.prefs.ensureLoaded();
    }

    /** Time only, in the user's tz + 12h/24h pref (e.g. `14:30` or `2:30 PM`). */
    time(iso: string | null | undefined): string {
        const p = this.parts(iso);
        return p ? formatLocalTime(p.hm, this.prefs.timeFormat()) : '';
    }

    /** Date only, in the user's tz + date-format pref (e.g. `30/05/2026`). */
    date(iso: string | null | undefined): string {
        const p = this.parts(iso);
        return p ? formatLocalDate(p.ymd, this.prefs.dateFormat()) : '';
    }

    /** Date + time (e.g. `30/05/2026 14:30`). */
    dateTime(iso: string | null | undefined): string {
        const p = this.parts(iso);
        return p ? `${formatLocalDate(p.ymd, this.prefs.dateFormat())} ${formatLocalTime(p.hm, this.prefs.timeFormat())}` : '';
    }

    /**
     * Relative display (the chat convention the user asked for): an instant
     * from TODAY (in the user's tz) shows the TIME only; anything older shows
     * the DATE + time. Keeps recent chatter compact while disambiguating
     * older messages.
     */
    auto(iso: string | null | undefined): string {
        const p = this.parts(iso);
        if (!p) {
            return '';
        }
        return p.ymd === this.todayYmd()
            ? formatLocalTime(p.hm, this.prefs.timeFormat())
            : `${formatLocalDate(p.ymd, this.prefs.dateFormat())} ${formatLocalTime(p.hm, this.prefs.timeFormat())}`;
    }

    /**
     * When, as a row in a list says it, in the person's interface language, time zone and clock: the time today,
     * yesterday, the weekday within the last week, the day and month this year, and the full date before this year,
     * in the person's chosen date format when they chose one. The components contract's convention for dates.
     */
    row(iso: string | null | undefined, now: Date = new Date()): string {
        const p = this.parts(iso);
        if (!p || !iso) {
            return '';
        }
        const at = new Date(iso);
        const tz = this.prefs.tz();
        const language = this.prefs.language();
        const today = this.ymdInTz(now, tz);
        const days = dayNumber(today) - dayNumber(p.ymd);
        const write = (options: Intl.DateTimeFormatOptions): string =>
            new Intl.DateTimeFormat(language, { timeZone: tz, ...options }).format(at);
        if (days === 0) {
            return write({ hour: '2-digit', minute: '2-digit', hourCycle: this.prefs.timeFormat() === '12h' ? 'h12' : 'h23' });
        }
        if (days === 1) {
            const word = new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(-1, 'day');
            return word.charAt(0).toLocaleUpperCase(language) + word.slice(1);
        }
        if (days > 1 && days < 7) {
            return write({ weekday: 'short' });
        }
        if (p.ymd.slice(0, 4) === today.slice(0, 4)) {
            return write({ day: 'numeric', month: 'short' });
        }
        // Before this year: the full date, in the person's own date format when they chose one.
        if (this.prefs.dateFormatChosen?.() === true) {
            return formatLocalDate(p.ymd, this.prefs.dateFormat());
        }
        return write({ day: 'numeric', month: 'short', year: 'numeric' });
    }

    /**
     * The calendar-day key of an instant in the user's tz -- canonical
     * `YYYY-MM-DD`. Stable bucket key for grouping a message thread into
     * per-day sections (see {@link groupByDay}); '' for an unparseable input.
     */
    dayKey(iso: string | null | undefined): string {
        return this.parts(iso)?.ymd ?? '';
    }

    /**
     * A date separator's words for its day (a chat thread's): today, then the list row's rule ({@link row}) for any
     * other day -- yesterday, the weekday within the last week, the day and month this year, and the year before --
     * in the person's interface language and time zone. '' for an unparseable input.
     */
    dayLabel(iso: string | null | undefined, now: Date = new Date()): string {
        const p = this.parts(iso);
        if (!p || !iso) {
            return '';
        }
        if (p.ymd !== this.ymdInTz(now, this.prefs.tz())) {
            return this.row(iso, now);
        }
        const language = this.prefs.language();
        const word = new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(0, 'day');
        return word.charAt(0).toLocaleUpperCase(language) + word.slice(1);
    }

    /** Project an ISO instant into the user's tz as canonical `YYYY-MM-DD` + `HH:mm`. */
    private parts(iso: string | null | undefined): { ymd: string; hm: string } | null {
        if (!iso) {
            return null;
        }
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) {
            return null;
        }
        const tz = this.prefs.tz();
        return { ymd: this.ymdInTz(d, tz), hm: this.hmInTz(d, tz) };
    }

    private ymdInTz(d: Date, tz: string): string {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(d);
        const get = (t: string): string => parts.find(p => p.type === t)?.value ?? '';
        return `${get('year')}-${get('month')}-${get('day')}`;
    }

    private hmInTz(d: Date, tz: string): string {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
        }).formatToParts(d);
        const get = (t: string): string => parts.find(p => p.type === t)?.value ?? '';
        // Some engines emit "24" for hour-0 under hour12:false -- normalise.
        const hh = get('hour') === '24' ? '00' : get('hour');
        return `${hh}:${get('minute')}`;
    }

    private todayYmd(): string {
        return this.ymdInTz(new Date(), this.prefs.tz());
    }
}

/** A canonical `YYYY-MM-DD` as a count of days, for the difference between two days. */
function dayNumber(ymd: string): number {
    const [y, m, d] = ymd.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
}
