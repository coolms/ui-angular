import { Injectable, inject } from '@angular/core';

import { UserCalendarPreferencesService } from './user-calendar-preferences.service';
import { formatLocalDate, formatLocalTime } from '../ui/range-picker/prefs-format';

/**
 * Platform-wide, preference-aware date/time formatter.
 *
 * The single seam every surface (Messages, Dynamic Chat, Designer, Editor, …)
 * should use to render an instant, so a user's **Profile -> Calendar** choices
 * (12h/24h time, date format, timezone) are honoured EVERYWHERE — not just in
 * the Calendar. Before this, each surface hand-rolled `toLocaleTimeString([])`,
 * which defers to the BROWSER locale (-> 12h regardless of the saved pref) and
 * ignored the timezone.
 *
 * It reuses the existing infrastructure rather than reinventing it:
 *  - {@link UserCalendarPreferencesService} (root singleton) — the resolved
 *    `tz` / `dateFormat` / `timeFormat` signals, loaded from `/auth/me/settings`
 *    (cascading over the deployment's platform defaults). Despite its
 *    `features/calendars/` home it IS the platform's user date/time pref source.
 *  - {@link formatLocalDate} / {@link formatLocalTime} (the range-picker
 *    helpers) — the same canonical -> display routines the pickers use, so a
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
     * The calendar-day key of an instant in the user's tz — canonical
     * `YYYY-MM-DD`. Stable bucket key for grouping a message thread into
     * per-day sections (see {@link groupByDay}); '' for an unparseable input.
     */
    dayKey(iso: string | null | undefined): string {
        return this.parts(iso)?.ymd ?? '';
    }

    /**
     * A human day label for a date separator (the chat convention): **Today** /
     * **Yesterday** for the two most recent days (compared in the user's tz),
     * else the full date in the user's date-format pref. '' for an unparseable
     * input.
     */
    dayLabel(iso: string | null | undefined): string {
        const p = this.parts(iso);
        if (!p) {
            return '';
        }
        const today = this.todayYmd();
        if (p.ymd === today) {
            return 'Today';
        }
        if (p.ymd === this.shiftYmd(today, -1)) {
            return 'Yesterday';
        }
        return formatLocalDate(p.ymd, this.prefs.dateFormat());
    }

    /**
     * Shift a canonical `YYYY-MM-DD` by whole days using pure calendar
     * arithmetic (UTC, no tz/DST involvement — the input is already a tz-local
     * day key), returning another canonical `YYYY-MM-DD`.
     */
    private shiftYmd(ymd: string, deltaDays: number): string {
        const [y, m, d] = ymd.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        dt.setUTCDate(dt.getUTCDate() + deltaDays);
        const yy = dt.getUTCFullYear();
        const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(dt.getUTCDate()).padStart(2, '0');
        return `${yy}-${mm}-${dd}`;
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
        // Some engines emit "24" for hour-0 under hour12:false — normalise.
        const hh = get('hour') === '24' ? '00' : get('hour');
        return `${hh}:${get('minute')}`;
    }

    private todayYmd(): string {
        return this.ymdInTz(new Date(), this.prefs.tz());
    }
}
