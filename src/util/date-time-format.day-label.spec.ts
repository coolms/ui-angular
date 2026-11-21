import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import { Store } from '@ngxs/store';
import { IdentityApiClient } from '@coolms/core-angular';

import { groupByDay } from './day-groups';
import { DateTimeFormatService } from './date-time-format.service';
import { UserCalendarPreferencesService } from './user-calendar-preferences.service';

describe('DateTimeFormatService.dayLabel(): a chat\'s date separator', () => {
    const language = signal('en');
    // Friday 2026-11-20, 10:00 in Moscow.
    const now = new Date('2026-11-20T07:00:00Z');

    function service(): DateTimeFormatService {
        TestBed.configureTestingModule({
            providers: [{
                provide: UserCalendarPreferencesService,
                useValue: {
                    // The person's date format is ISO: a separator never shows it.
                    tz: () => 'Europe/Moscow', dateFormat: () => 'yyyy-MM-dd', timeFormat: () => '24h', language, ensureLoaded: () => undefined,
                },
            }],
        });
        return TestBed.inject(DateTimeFormatService);
    }

    beforeEach(() => language.set('en'));

    it('says today and yesterday in the interface language, capitalised', () => {
        const fmt = service();
        expect(fmt.dayLabel('2026-11-20T05:29:00Z', now)).toBe('Today');
        expect(fmt.dayLabel('2026-11-19T20:29:00Z', now)).toBe('Yesterday');
        language.set('ru');
        expect(fmt.dayLabel('2026-11-20T05:29:00Z', now)).toBe('Сегодня');
        expect(fmt.dayLabel('2026-11-19T20:29:00Z', now)).toBe('Вчера');
    });

    it('says older days by the list row\'s rule, never as an ISO date', () => {
        const fmt = service();
        expect(fmt.dayLabel('2026-11-16T09:00:00Z', now)).toBe('Mon');
        expect(fmt.dayLabel('2026-07-10T09:00:00Z', now)).toBe('Jul 10');
        expect(fmt.dayLabel('2025-07-10T09:00:00Z', now)).toBe('Jul 10, 2025');
        language.set('ru');
        expect(fmt.dayLabel('2026-07-10T09:00:00Z', now)).toBe('10 июл.');
        for (const iso of ['2026-11-16T09:00:00Z', '2026-07-10T09:00:00Z', '2025-07-10T09:00:00Z']) {
            expect(fmt.dayLabel(iso, now)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
        }
    });

    it('counts the day in the person\'s time zone', () => {
        const fmt = service();
        // 21:30Z on the 19th is 00:30 on the 20th in Moscow: today.
        expect(fmt.dayLabel('2026-11-19T21:30:00Z', now)).toBe('Today');
    });

    it('says nothing for no date or one it cannot read', () => {
        const fmt = service();
        expect(fmt.dayLabel(null, now)).toBe('');
        expect(fmt.dayLabel('not a date', now)).toBe('');
    });

    it('labels each day group of a thread with it', () => {
        const fmt = service();
        const groups = groupByDay(['2025-07-10T09:00:00Z', '2025-07-10T10:00:00Z', new Date().toISOString()], (iso) => iso, fmt);
        expect(groups.map((g) => [g.label, g.items.length])).toEqual([['Jul 10, 2025', 2], ['Today', 1]]);
    });
});

describe('Full dates follow the date format a person chose; words stay for today, yesterday and the weekday', () => {
    const chosen = signal(false);
    const dateFormat = signal('dd/MM/yyyy');
    // Friday 2026-11-20, 10:00 in Moscow.
    const now = new Date('2026-11-20T07:00:00Z');

    function service(): DateTimeFormatService {
        TestBed.configureTestingModule({
            providers: [{
                provide: UserCalendarPreferencesService,
                useValue: {
                    tz: () => 'Europe/Moscow', dateFormat, timeFormat: () => '24h', language: () => 'en',
                    dateFormatChosen: chosen, ensureLoaded: () => undefined,
                },
            }],
        });
        return TestBed.inject(DateTimeFormatService);
    }

    beforeEach(() => {
        chosen.set(false);
        dateFormat.set('dd/MM/yyyy');
    });

    it('a chosen format writes the full dates of rows and separators', () => {
        const fmt = service();
        chosen.set(true);
        expect(fmt.row('2026-11-12T09:00:00Z', now)).toBe('12/11/2026');
        expect(fmt.row('2025-07-10T09:00:00Z', now)).toBe('10/07/2025');
        expect(fmt.dayLabel('2026-07-10T09:00:00Z', now)).toBe('10/07/2026');
    });

    it('today, yesterday and the weekday stay words, chosen format or not', () => {
        const fmt = service();
        chosen.set(true);
        expect(fmt.dayLabel('2026-11-20T05:29:00Z', now)).toBe('Today');
        expect(fmt.dayLabel('2026-11-19T20:29:00Z', now)).toBe('Yesterday');
        expect(fmt.row('2026-11-16T09:00:00Z', now)).toBe('Mon');
    });

    it('without a chosen format, a full date is the interface language\'s, never the installation\'s format', () => {
        const fmt = service();
        dateFormat.set('yyyy-MM-dd');
        expect(fmt.row('2026-11-12T09:00:00Z', now)).toBe('Nov 12');
        expect(fmt.dayLabel('2026-07-10T09:00:00Z', now)).toBe('Jul 10');
    });
});

describe('UserCalendarPreferencesService.dateFormatChosen(): the person\'s own date format, from the declared settings', () => {
    function prefs(declared: () => unknown): UserCalendarPreferencesService {
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: IdentityApiClient,
                    useValue: { getSettings: () => of({ region: { dateFormat: 'dd/MM/yyyy' } }), getDeclaredSettings: declared },
                },
                { provide: Store, useValue: { selectSnapshot: () => null } },
            ],
        });
        const service = TestBed.inject(UserCalendarPreferencesService);
        service.ensureLoaded().subscribe();
        return service;
    }

    it('is true when the region section carries the person\'s own date format', () => {
        const service = prefs(() => of([{ section: 'region', keys: [{ key: 'dateFormat', value: 'dd/MM/yyyy', own: 'dd/MM/yyyy', locked: false }] }]));
        expect(service.dateFormatChosen()).toBeTrue();
    });

    it('is false when the format in force is the installation\'s (own is null)', () => {
        const service = prefs(() => of([{ section: 'region', keys: [{ key: 'dateFormat', value: 'yyyy-MM-dd', own: null, locked: false }] }]));
        expect(service.dateFormatChosen()).toBeFalse();
    });

    it('is false when the declared settings cannot be read', () => {
        const service = prefs(() => throwError(() => new Error('offline')));
        expect(service.dateFormatChosen()).toBeFalse();
    });

    it('an answer that arrives after a reset (a sign-out) is the previous person\'s, and is dropped', () => {
        const late = new Subject<unknown>();
        const service = prefs(() => late);
        service.reset();
        late.next([{ section: 'region', keys: [{ key: 'dateFormat', value: 'dd/MM/yyyy', own: 'dd/MM/yyyy', locked: false }] }]);
        expect(service.dateFormatChosen()).toBeFalse();
    });
});
