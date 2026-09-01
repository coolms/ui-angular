/**
 * Range-picker locale-respect helpers — date + time format/parse
 * routines keyed off `UserCalendarPreferencesService`'s catalogue.
 *
 * The pickers store **canonical** values internally (`YYYY-MM-DD` +
 * `HH:mm`) so the wire format stays stable; only the visible display
 * varies with the user's `dateFormat` / `timeFormat` prefs. These
 * helpers translate in both directions.
 *
 * Supported date formats (matches the Profile Calendar tab options):
 *   - yyyy-MM-dd   (ISO 8601)         e.g. 2026-05-30
 *   - dd/MM/yyyy   (European)         e.g. 30/05/2026
 *   - MM/dd/yyyy   (US)               e.g. 05/30/2026
 *   - dd MMM yyyy  (short-month)      e.g. 30 May 2026
 *   - MMM d, yyyy  (long)             e.g. May 30, 2026
 *
 * Supported time formats:
 *   - 24h   (HH:mm)                   e.g. 14:30
 *   - 12h   (h:mm AM/PM)              e.g. 2:30 PM
 *
 * Parsers are permissive: accept variants with or without leading
 * zeros, with or without spaces around the AM/PM marker. Anything
 * that doesn't match returns `null` so callers can keep the previous
 * canonical value (the picker discards the partial input rather than
 * corrupting state).
 */

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** Format a canonical `YYYY-MM-DD` per the user's date-format pref. */
export function formatLocalDate(canonical: string, format: string | null | undefined): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(canonical);
    if (!m) return canonical;
    const [, yyyy, MM, dd] = m;
    const fmt = (format || 'yyyy-MM-dd');
    const d_ = String(parseInt(dd, 10));
    const monthShort = MONTH_SHORT[parseInt(MM, 10) - 1];
    return fmt
        .replace(/yyyy/g, yyyy)
        .replace(/MMM/g,  monthShort)
        .replace(/MM/g,   MM)
        .replace(/dd/g,   dd)
        .replace(/d/g,    d_);
}

/**
 * Parse the user's typed date in their preferred format back to the
 * canonical `YYYY-MM-DD`. Returns `null` on any mismatch — the picker
 * keeps the prior canonical value rather than corrupting state.
 *
 * Tolerant of:
 *   - Trailing whitespace on the input.
 *   - Mixed casing on month names (e.g. `may`, `MAY`, `May` all work).
 *   - Single-digit days when the format uses `d`.
 */
export function parseLocalDate(raw: string, format: string | null | undefined): string | null {
    const input = (raw ?? '').trim();
    if (!input) return '';
    const fmt = (format || 'yyyy-MM-dd');

    // Build a regex from the format pattern by replacing tokens with
    // capture groups. Order matters — longest token first so prefix
    // collisions (`MMM` vs `MM` vs `M`) resolve correctly.
    const groups: Array<'yyyy' | 'MMM' | 'MM' | 'dd' | 'd'> = [];
    let regex = '^';
    let i = 0;
    while (i < fmt.length) {
        if (fmt.startsWith('yyyy', i)) { groups.push('yyyy'); regex += '(\\d{4})';     i += 4; continue; }
        if (fmt.startsWith('MMM',  i)) { groups.push('MMM');  regex += '([A-Za-z]{3,9})'; i += 3; continue; }
        if (fmt.startsWith('MM',   i)) { groups.push('MM');   regex += '(\\d{1,2})';   i += 2; continue; }
        if (fmt.startsWith('dd',   i)) { groups.push('dd');   regex += '(\\d{1,2})';   i += 2; continue; }
        if (fmt[i] === 'd')            { groups.push('d');    regex += '(\\d{1,2})';   i += 1; continue; }
        // Literal — escape regex specials.
        regex += fmt[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        i += 1;
    }
    regex += '$';

    const m = new RegExp(regex).exec(input);
    if (!m) return null;

    let yyyy = '', MM = '', dd = '';
    for (let g = 0; g < groups.length; g++) {
        const captured = m[g + 1];
        switch (groups[g]) {
            case 'yyyy': yyyy = captured; break;
            case 'MMM': {
                const idx = MONTH_SHORT.findIndex(s => s.toLowerCase() === captured.slice(0, 3).toLowerCase());
                if (idx < 0) return null;
                MM = String(idx + 1).padStart(2, '0');
                break;
            }
            case 'MM':
            case 'dd':
            case 'd': {
                const padded = captured.padStart(2, '0');
                if (groups[g] === 'MM') MM = padded;
                else dd = padded;
                break;
            }
        }
    }
    if (!yyyy || !MM || !dd) return null;
    if (!isValidDate(yyyy, MM, dd)) return null;
    return `${yyyy}-${MM}-${dd}`;
}

/** Format a canonical `HH:mm` per the user's time-format pref. */
export function formatLocalTime(canonical: string, format: '12h' | '24h' | null | undefined): string {
    const m = /^(\d{2}):(\d{2})$/.exec(canonical);
    if (!m) return canonical;
    const [, HH, mm] = m;
    if (format !== '12h') return `${HH}:${mm}`;
    const hourNum = parseInt(HH, 10);
    const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
    const ampm = hourNum < 12 ? 'AM' : 'PM';
    return `${hour12}:${mm} ${ampm}`;
}

/**
 * Parse a typed time in either 24h (HH:mm) or 12h (h:mm AM/PM) shape
 * back to canonical `HH:mm`.
 *
 * Tolerant of:
 *   - Trailing whitespace.
 *   - Optional leading zero (`9:30` works the same as `09:30`).
 *   - Spaces around the AM/PM marker (`2:30PM`, `2:30 PM`, `2:30 pm`).
 *   - 12h input even when the user's pref is 24h (and vice-versa) —
 *     covers paste-from-clipboard scenarios.
 */
export function parseLocalTime(raw: string, _format: '12h' | '24h' | null | undefined): string | null {
    const input = (raw ?? '').trim();
    if (!input) return '';
    // 12h: `h:mm AM/PM` (with optional whitespace).
    const m12 = /^(\d{1,2}):(\d{2})\s*([AaPp])\.?\s*[Mm]\.?$/.exec(input);
    if (m12) {
        let hh = parseInt(m12[1], 10);
        const mm = parseInt(m12[2], 10);
        const isPm = m12[3].toLowerCase() === 'p';
        if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;
        if (hh === 12) hh = 0;
        if (isPm) hh += 12;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
    // 24h: `HH:mm`.
    const m24 = /^(\d{1,2}):(\d{2})$/.exec(input);
    if (m24) {
        const hh = parseInt(m24[1], 10);
        const mm = parseInt(m24[2], 10);
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
    return null;
}

/** Validate that `Y-M-D` is a real calendar date (e.g. Feb 30 rejected). */
function isValidDate(yyyy: string, MM: string, dd: string): boolean {
    const y = parseInt(yyyy, 10);
    const m = parseInt(MM,   10);
    const d = parseInt(dd,   10);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const probe = new Date(y, m - 1, d);
    return probe.getFullYear() === y
        && probe.getMonth()    === m - 1
        && probe.getDate()     === d;
}
