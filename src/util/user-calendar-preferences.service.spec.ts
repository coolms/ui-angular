import { TestBed } from '@angular/core/testing';
import { Store } from '@ngxs/store';
import { of } from 'rxjs';

import { IdentityApiClient } from '@coolms/core-angular';
import { UserCalendarPreferencesService } from './user-calendar-preferences.service';

/**
 * `update()` is the seam the Profile page saves through, and fed it a
 * keyless Hydra bag for as long as `updateSettings()` went out without
 * `Accept: application/json`.
 *
 * Both halves of that are worth pinning. `merge()` rebuilds the VO field by
 * field from a whitelist, so the bag could never put `undefined` into
 * FullCalendar's `timeZone` or `firstDay` — that guard is why the bug was
 * silent instead of loud, and it should stay. The price of the silence is the
 * second spec: an update that carries none of the known fields leaves the
 * cache exactly as it was, so a save the user watched succeed changed nothing
 * on screen. The service cannot do better — the values are in the bag, but
 * their names are gone — which is why the fix had to be the request header.
 */
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

        // Nothing from the bag reached the VO — not as a stray property, and
        // not as an `undefined` where a widget expects a string.
        expect(Object.keys(svc.prefs()).sort()).toEqual(
            ['dateFormat', 'defaultCalendarSlug', 'timeFormat', 'tz', 'weekStart'],
        );
        // …and nothing changed, which is the part the user saw: the save
        // succeeded server-side and the calendar kept its previous settings
        // until something re-fetched /auth/me/settings.
        expect(svc.tz()).toBe('Europe/Berlin');
        expect(svc.firstDay()).toBe(0);
    });
});
