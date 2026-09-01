import {
    formatLocalDate,
    formatLocalTime,
    parseLocalDate,
    parseLocalTime,
} from './prefs-format';

/**
 * Task — locale-respect helpers for the range pickers.
 *
 * Coverage:
 *   - formatLocalDate respects all five Profile-Calendar-tab patterns.
 *   - parseLocalDate round-trips its own output exactly (format -> parse
 *     -> format invariant).
 *   - parseLocalDate rejects malformed / impossible dates (Feb 30, etc.).
 *   - formatLocalTime emits 24h "HH:mm" or 12h "h:mm AM/PM".
 *   - parseLocalTime tolerates whitespace, casing, missing leading zero,
 *     and 24h input even when the user's pref is 12h (paste case).
 *   - parseLocalTime rejects out-of-range hours/minutes.
 */
describe('range-picker prefs-format helpers', () => {

    // --- formatLocalDate ---------------------------------------------

    it('formats yyyy-MM-dd (ISO 8601)', () => {
        expect(formatLocalDate('2026-05-30', 'yyyy-MM-dd')).toBe('2026-05-30');
    });

    it('formats dd/MM/yyyy (European)', () => {
        expect(formatLocalDate('2026-05-30', 'dd/MM/yyyy')).toBe('30/05/2026');
    });

    it('formats MM/dd/yyyy (US)', () => {
        expect(formatLocalDate('2026-05-30', 'MM/dd/yyyy')).toBe('05/30/2026');
    });

    it('formats dd MMM yyyy (short-month)', () => {
        expect(formatLocalDate('2026-05-30', 'dd MMM yyyy')).toBe('30 May 2026');
    });

    it('formats MMM d, yyyy (long, no leading zero on day)', () => {
        expect(formatLocalDate('2026-05-05', 'MMM d, yyyy')).toBe('May 5, 2026');
    });

    it('defaults to ISO when format is null/undefined', () => {
        expect(formatLocalDate('2026-05-30', null)).toBe('2026-05-30');
        expect(formatLocalDate('2026-05-30', undefined)).toBe('2026-05-30');
    });

    // --- parseLocalDate ----------------------------------------------

    it('round-trips every supported format (format → parse)', () => {
        for (const fmt of ['yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy', 'dd MMM yyyy', 'MMM d, yyyy']) {
            const formatted = formatLocalDate('2026-05-30', fmt);
            expect(parseLocalDate(formatted, fmt)).toBe('2026-05-30');
        }
    });

    it('parses mixed-case month name (MMM)', () => {
        expect(parseLocalDate('30 may 2026', 'dd MMM yyyy')).toBe('2026-05-30');
        expect(parseLocalDate('30 MAY 2026', 'dd MMM yyyy')).toBe('2026-05-30');
    });

    it('parses single-digit day in MMM d, yyyy', () => {
        expect(parseLocalDate('May 5, 2026', 'MMM d, yyyy')).toBe('2026-05-05');
        expect(parseLocalDate('May 25, 2026', 'MMM d, yyyy')).toBe('2026-05-25');
    });

    it('rejects malformed input', () => {
        expect(parseLocalDate('not-a-date', 'yyyy-MM-dd')).toBeNull();
        expect(parseLocalDate('2026-13-01', 'yyyy-MM-dd')).toBeNull();   // bad month
        expect(parseLocalDate('2026-02-30', 'yyyy-MM-dd')).toBeNull();   // Feb 30
        expect(parseLocalDate('Hugust 5, 2026', 'MMM d, yyyy')).toBeNull(); // bad month name
    });

    it('returns empty string for empty input (preserves the "no value" state)', () => {
        expect(parseLocalDate('', 'yyyy-MM-dd')).toBe('');
        expect(parseLocalDate('   ', 'yyyy-MM-dd')).toBe('');
    });

    // --- formatLocalTime ---------------------------------------------

    it('formats 24h as HH:mm', () => {
        expect(formatLocalTime('14:30', '24h')).toBe('14:30');
        expect(formatLocalTime('09:00', '24h')).toBe('09:00');
    });

    it('formats 12h as h:mm AM/PM (no leading zero on hour)', () => {
        expect(formatLocalTime('14:30', '12h')).toBe('2:30 PM');
        expect(formatLocalTime('09:00', '12h')).toBe('9:00 AM');
        expect(formatLocalTime('00:00', '12h')).toBe('12:00 AM'); // midnight
        expect(formatLocalTime('12:00', '12h')).toBe('12:00 PM'); // noon
        expect(formatLocalTime('23:59', '12h')).toBe('11:59 PM');
    });

    // --- parseLocalTime ----------------------------------------------

    it('parses 24h HH:mm', () => {
        expect(parseLocalTime('14:30', '24h')).toBe('14:30');
        expect(parseLocalTime('9:30', '24h')).toBe('09:30');  // missing leading zero
    });

    it('parses 12h with case + whitespace tolerance', () => {
        expect(parseLocalTime('2:30 PM', '12h')).toBe('14:30');
        expect(parseLocalTime('2:30 pm', '12h')).toBe('14:30');
        expect(parseLocalTime('2:30PM',  '12h')).toBe('14:30');  // no space
        expect(parseLocalTime('  2:30 PM  ', '12h')).toBe('14:30');  // leading/trailing
    });

    it('round-trips 12h corner cases', () => {
        expect(parseLocalTime('12:00 AM', '12h')).toBe('00:00');  // midnight
        expect(parseLocalTime('12:00 PM', '12h')).toBe('12:00');  // noon
        expect(parseLocalTime('11:59 PM', '12h')).toBe('23:59');
    });

    it('tolerates the opposite format (paste-from-clipboard)', () => {
        // User pref is 12h but they pasted "14:30" — still works.
        expect(parseLocalTime('14:30', '12h')).toBe('14:30');
        // User pref is 24h but they pasted "2:30 PM" — still works.
        expect(parseLocalTime('2:30 PM', '24h')).toBe('14:30');
    });

    it('rejects out-of-range or malformed', () => {
        expect(parseLocalTime('25:00', '24h')).toBeNull();
        expect(parseLocalTime('13:00 PM', '12h')).toBeNull();
        expect(parseLocalTime('12:60', '24h')).toBeNull();
        expect(parseLocalTime('not-a-time', '24h')).toBeNull();
    });
});
