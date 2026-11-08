import { TestBed } from '@angular/core/testing';
import { Store } from '@ngxs/store';
import { of } from 'rxjs';

import { IdentityApiClient } from '@coolms/core-angular';
import { calendarPrefsFromSettings, UserCalendarPreferencesService } from './user-calendar-preferences.service';

/**
 * `update()` is the seam the Profile page saves through, and fed it a
 * keyless Hydra bag for as long as `updateSettings()` went out without
 * `Accept: application/json`.
 *
 * Both halves of that are worth pinning. `merge()` rebuilds the VO field by
 * field from a whitelist, so the bag could never put `undefined` into
 * FullCalendar's `timeZone` or `firstDay` -- that guard is why the bug was
 * silent instead of loud, and it should stay. The price of the silence is the
 * second spec: an update that carries none of the known fields leaves the
 * cache exactly as it was, so a save the user watched succeed changed nothing
 * on screen. The service cannot do better -- the values are in the bag, but
 * their names are gone -- which is why the fix had to be the request header.
 */
describe('UserCalendarPreferencesService.followDeviceZone()', () => {
    let service: UserCalendarPreferencesService;
    let answer: Record<string, unknown>;

    beforeEach(() => {
        answer = { region: { timezone: 'Europe/Berlin' } };
        TestBed.configureTestingModule({
            providers: [
                { provide: IdentityApiClient, useValue: { getSettings: () => of(answer) } },
                { provide: Store, useValue: { selectSnapshot: () => null } },
            ],
        });
        service = TestBed.inject(UserCalendarPreferencesService);
    });

    it('holds over a write of the whole section', () => {
        service.followDeviceZone('Asia/Tokyo');

        service.update({ tz: 'UTC', weekStart: 'sunday' });

        expect(service.tz()).toBe('Asia/Tokyo');
        expect(service.prefs().weekStart).toBe('sunday');
    });

    it('holds over a read of the section, first or forced', () => {
        service.followDeviceZone('Asia/Tokyo');

        service.ensureLoaded().subscribe();
        expect(service.tz()).toBe('Asia/Tokyo');

        service.refresh().subscribe();
        expect(service.tz()).toBe('Asia/Tokyo');
    });

    it('null puts back the zone the section last answered', () => {
        service.ensureLoaded().subscribe();
        service.followDeviceZone('Asia/Tokyo');

        service.followDeviceZone(null);

        expect(service.tz()).toBe('Europe/Berlin');
    });

    it('null also takes a zone written while following', () => {
        service.followDeviceZone('Asia/Tokyo');
        service.update({ tz: 'Europe/Paris' });

        service.followDeviceZone(null);

        expect(service.tz()).toBe('Europe/Paris');
    });

    it('a sign-out ends it: the next person is not on the last one\'s device zone', () => {
        service.followDeviceZone('Asia/Tokyo');

        service.reset();
        service.update({ tz: 'Europe/Paris' });

        expect(service.tz()).toBe('Europe/Paris');
    });
});

describe('UserCalendarPreferencesService.update()', () => {
    const PLATFORM_DEFAULTS = {
        timezone:   'UTC',
        dateFormat: 'yyyy-MM-dd',
        timeFormat: '24h',
        weekStart:  'monday',
    };

    const STORED = {
        tz:                  'Europe/Berlin',
        dateFormat:          'dd.MM.yyyy',
        timeFormat:          '12h' as const,
        weekStart:           'sunday' as const,
        defaultCalendarSlug: 'team-ops',
    };

    function setup(): UserCalendarPreferencesService {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                UserCalendarPreferencesService,
                // Mock the collaborator the service actually injects. It used to
                // name `ApiService`, whose `getSettings()` was a pass-through to
                // this client -- and once the service stopped asking for it, the
                // stub stood for nothing while the specs stayed green, because
                // `update()` never reaches the wire.
                { provide: IdentityApiClient, useValue: { getSettings: () => of({ calendar: {} }) } },
                {
                    provide: Store,
                    useValue: { selectSnapshot: () => ({ platformDefaults: PLATFORM_DEFAULTS }) },
                },
            ],
        });

        return TestBed.inject(UserCalendarPreferencesService);
    }

    it('applies a keyed section to the live signals', () => {
        const svc = setup();

        svc.update(STORED);

        expect(svc.tz()).toBe('Europe/Berlin');
        expect(svc.dateFormat()).toBe('dd.MM.yyyy');
        expect(svc.timeFormat()).toBe('12h');
        expect(svc.weekStart()).toBe('sunday');
        expect(svc.firstDay()).toBe(0);
        expect(svc.defaultCalendarSlug()).toBe('team-ops');
    });

    it('keeps wire junk out of the VO — a keyless bag stores nothing and changes nothing', () => {
        const svc = setup();
        svc.update(STORED);

        // The ld+json rendering of the very same section: same values, no keys.
        const hydra = { member: Object.values(STORED), totalItems: 5 };
        svc.update(hydra as unknown as Partial<typeof STORED>);

        // Nothing from the bag reached the VO -- not as a stray property, and
        // not as an `undefined` where a widget expects a string.
        expect(Object.keys(svc.prefs()).sort()).toEqual(
            ['dateFormat', 'defaultCalendarSlug', 'timeFormat', 'tz', 'weekStart'],
        );
        // ...and nothing changed, which is the part the user saw: the save
        // succeeded server-side and the calendar kept its previous settings
        // until something re-fetched /auth/me/settings.
        expect(svc.tz()).toBe('Europe/Berlin');
        expect(svc.firstDay()).toBe(0);
    });
});

describe('calendarPrefsFromSettings()', () => {
    it('reads the zone, the formats and the week start from region, and the default calendar from calendar', () => {
        expect(calendarPrefsFromSettings({
            region: { timezone: 'Europe/Kyiv', dateFormat: 'dd/MM/yyyy', timeFormat: '12h', weekStart: 'sunday' },
            calendar: { defaultCalendarSlug: 'team' },
        })).toEqual({
            tz: 'Europe/Kyiv', dateFormat: 'dd/MM/yyyy', timeFormat: '12h', weekStart: 'sunday', defaultCalendarSlug: 'team',
        });
    });

    it('reads automatic as no zone of the person\'s: null, so a reader leaves the zone it had', () => {
        expect(calendarPrefsFromSettings({ region: { timezone: 'automatic' } }).tz).toBeNull();
    });

    it('reads nothing from the keys the calendar section held before region', () => {
        expect(calendarPrefsFromSettings({
            calendar: { tz: 'Europe/Berlin', dateFormat: 'dd/MM/yyyy', timeFormat: '12h', weekStart: 'sunday' },
        })).toEqual({});
    });

    it('keeps out a value of the wrong kind, and an answer with no sections', () => {
        expect(calendarPrefsFromSettings({ region: { timeFormat: 'noon', weekStart: 'friday', timezone: 3 } })).toEqual({});
        expect(calendarPrefsFromSettings(null)).toEqual({});
    });
});

describe('UserCalendarPreferencesService.ensureLoaded()', () => {
    it('takes the zone from region, and a person following their device keeps the default until the device says', () => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: IdentityApiClient,
                    useValue: { getSettings: () => of({ region: { timezone: 'automatic', weekStart: 'sunday' } }) },
                },
                { provide: Store, useValue: { selectSnapshot: () => null } },
            ],
        });
        const service = TestBed.inject(UserCalendarPreferencesService);

        service.ensureLoaded().subscribe();

        expect(service.tz()).toBe('UTC');
        expect(service.weekStart()).toBe('sunday');
    });
});

describe('UserCalendarPreferencesService: a zone set back to automatic', () => {
    let service: UserCalendarPreferencesService;

    beforeEach(() => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                { provide: IdentityApiClient, useValue: { getSettings: () => of({}) } },
                { provide: Store, useValue: { selectSnapshot: () => null } },
            ],
        });
        service = TestBed.inject(UserCalendarPreferencesService);
    });

    it('leaves the explicit zone behind: the default applies, and stays when device following ends', () => {
        service.update({ tz: 'Europe/Kyiv' });

        service.update(calendarPrefsFromSettings({ region: { timezone: 'automatic' } }));

        expect(service.tz()).toBe('UTC');
        service.followDeviceZone(null);
        expect(service.tz()).toBe('UTC');
    });

    it('update({ tz: null }) clears the explicit zone: the device zone if one is followed, else the default', () => {
        service.update({ tz: 'Europe/Kyiv' });
        service.update({ tz: null });
        expect(service.tz()).toBe('UTC');

        service.update({ tz: 'Europe/Kyiv' });
        service.followDeviceZone('Asia/Tokyo');
        service.update({ tz: null });
        expect(service.tz()).toBe('Asia/Tokyo');
    });

    it('takes the device zone while one is followed, and the default after, never the explicit zone', () => {
        service.update({ tz: 'Europe/Kyiv' });
        service.followDeviceZone('Asia/Tokyo');

        service.update(calendarPrefsFromSettings({ region: { timezone: 'automatic' } }));

        expect(service.tz()).toBe('Asia/Tokyo');
        service.followDeviceZone(null);
        expect(service.tz()).toBe('UTC');
    });
});
