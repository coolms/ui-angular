import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { DateTimeFormatService } from './date-time-format.service';
import { UserCalendarPreferencesService } from './user-calendar-preferences.service';

describe('DateTimeFormatService.row()', () => {
    const language = signal('en');
    const timeFormat = signal<'12h' | '24h'>('24h');
    // Friday 2026-11-20, 10:00 in Moscow.
    const now = new Date('2026-11-20T07:00:00Z');

    function service(): DateTimeFormatService {
        TestBed.configureTestingModule({
            providers: [{
                provide: UserCalendarPreferencesService,
                useValue: {
                    tz: () => 'Europe/Moscow', dateFormat: () => 'yyyy-MM-dd', timeFormat, language, ensureLoaded: () => undefined,
                },
            }],
        });
        return TestBed.inject(DateTimeFormatService);
    }

    beforeEach(() => {
        language.set('en');
        timeFormat.set('24h');
    });

    it('says the time today, on the person\'s clock', () => {
        const fmt = service();
        expect(fmt.row('2026-11-20T05:29:00Z', now)).toBe('08:29');
        timeFormat.set('12h');
        expect(fmt.row('2026-11-20T05:29:00Z', now)).toMatch(/^08:29\s?AM$/);
    });

    it('says yesterday in the interface language, capitalised', () => {
        const fmt = service();
        expect(fmt.row('2026-11-19T20:29:00Z', now)).toBe('Yesterday');
        language.set('ru');
        expect(fmt.row('2026-11-19T20:29:00Z', now)).toBe('Вчера');
    });

    it('counts days in the person\'s time zone, not the browser\'s', () => {
        const fmt = service();
        // 21:30Z on the 19th is 00:30 on the 20th in Moscow: today.
        expect(fmt.row('2026-11-19T21:30:00Z', now)).toBe('00:30');
    });

    it('says the weekday within the last week, the day and month this year, and the year before that', () => {
        const fmt = service();
        expect(fmt.row('2026-11-16T09:00:00Z', now)).toBe('Mon');
        expect(fmt.row('2026-11-12T09:00:00Z', now)).toBe('Nov 12');
        expect(fmt.row('2025-11-12T09:00:00Z', now)).toBe('Nov 12, 2025');
        language.set('ru');
        expect(fmt.row('2026-11-16T09:00:00Z', now)).toBe('пн');
        expect(fmt.row('2026-11-12T09:00:00Z', now)).toBe('12 нояб.');
    });

    it('says nothing for no date or one it cannot read', () => {
        const fmt = service();
        expect(fmt.row(null, now)).toBe('');
        expect(fmt.row('not a date', now)).toBe('');
    });
});
