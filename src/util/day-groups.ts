import { DateTimeFormatService } from './date-time-format.service';

/**
 * A contiguous run of items that fall on the same calendar day (in the user's
 * tz), carrying the day separator label to render above them.
 */
export interface DayGroup<T> {
    /** Canonical `YYYY-MM-DD` day key (the {@link DateTimeFormatService.dayKey}). */
    key: string;
    /** The separator label — `Today` / `Yesterday` / a formatted date. */
    label: string;
    items: T[];
}

/**
 * Split a chronologically-ordered list into per-day groups — the WhatsApp-style
 * "date chip between day runs" model for a chat thread. Each item's day
 * is resolved in the user's tz via {@link DateTimeFormatService}, so a single
 * date chip separates day runs and individual bubbles need only show the time.
 *
 * Assumes `items` is already sorted ascending by instant (a message thread is
 * sorted by seq, which is chronological); it walks once and starts a new group
 * whenever the day key changes. Items with no resolvable instant fall into a
 * group keyed `''` (rendered without a real date — fine for system lines).
 */
export function groupByDay<T>(
    items: readonly T[],
    isoOf: (item: T) => string | null | undefined,
    dtf: DateTimeFormatService,
): DayGroup<T>[] {
    const groups: DayGroup<T>[] = [];
    let current: DayGroup<T> | null = null;
    for (const item of items) {
        const iso = isoOf(item);
        const key = dtf.dayKey(iso);
        if (current === null || current.key !== key) {
            current = { key, label: dtf.dayLabel(iso), items: [] };
            groups.push(current);
        }
        current.items.push(item);
    }
    return groups;
}
