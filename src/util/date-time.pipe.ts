import { Pipe, PipeTransform, inject } from '@angular/core';

import { DateTimeFormatService } from './date-time-format.service';

/**
 * Preference-aware instant formatter pipe — the one-token way for any
 * template across the platform to render a timestamp in the user's tz +
 * 12h/24h + date-format pref. Delegates to {@link DateTimeFormatService}.
 *
 *   {{ msg.createdAt | appDateTime }}            -> relative: today shows TIME, older shows DATE + time
 *   {{ savedAt      | appDateTime:'time' }}       -> time only
 *   {{ savedAt      | appDateTime:'date' }}       -> date only
 *   {{ deployedAt   | appDateTime:'datetime' }}   -> always date + time
 *
 * Marked `pure: false` so it re-renders when the user changes their format pref
 * mid-session (the prefs are signals read inside the service; an impure pipe
 * re-evaluates each change-detection pass and picks the new value up). The cost
 * is trivial — formatting a handful of visible timestamps per pass.
 */
@Pipe({ name: 'appDateTime', standalone: true, pure: false })
export class DateTimePipe implements PipeTransform {
    private readonly fmt = inject(DateTimeFormatService);

    transform(iso: string | null | undefined, mode: 'auto' | 'time' | 'date' | 'datetime' = 'auto'): string {
        switch (mode) {
            case 'time':     return this.fmt.time(iso);
            case 'date':     return this.fmt.date(iso);
            case 'datetime': return this.fmt.dateTime(iso);
            default:         return this.fmt.auto(iso);
        }
    }
}
