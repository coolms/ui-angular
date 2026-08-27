import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SpaceDto } from './space-dto';
import { SpaceSelectionStore } from './space-selection.store';

/**
 * Behaviour spec for the store extracted from the Media / Document / Article
 * space-accordion composers.
 *
 * The class is deliberately dependency-light (HttpClient + DestroyRef) and
 * holds the one piece of logic all three composers share, so it is the part
 * worth pinning: ordering, "which space was I in", and the fallback paths.
 *
 * The `currentPath` getter contract gets the most attention here. It is the
 * bug the extraction was designed to keep fixed, and it is invisible to
 * `ng build` and to a browser smoke-test that happens to load fast enough.
 */

const SPACES_URL = '/api/v1/media/spaces';

function space(overrides: Partial<SpaceDto> & Pick<SpaceDto, 'key' | 'rootPath'>): SpaceDto {
    return {
        label:      overrides.key,
        badge:      null,
        isWritable: true,
        priority:   0,
        ...overrides,
    };
}

const PERSONAL = space({ key: 'personal', rootPath: '/home/u1/media', priority: 10 });
const SHARED   = space({ key: 'shared',   rootPath: '/media',         priority: 20 });
const SITE     = space({ key: 'site:default', rootPath: '/content/default/media', priority: 30 });

describe('SpaceSelectionStore', () => {
    let store: SpaceSelectionStore;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(withXhr()),
                provideHttpClientTesting(),
                SpaceSelectionStore,
            ],
        });
        store    = TestBed.inject(SpaceSelectionStore);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    /** Flush a spaces response in the API-Platform JSON-LD shape. */
    function flushHydra(members: readonly SpaceDto[]): void {
        httpMock.expectOne(SPACES_URL).flush({ 'hydra:member': members });
    }

    describe('response shapes', () => {
        it('reads the JSON-LD `hydra:member` collection', () => {
            store.load({ url: SPACES_URL, fallback: () => [], currentPath: () => '/media' });
            flushHydra([SHARED]);

            expect(store.spaces().map(s => s.key)).toEqual(['shared']);
        });

        it('reads the JSON-LD-less `member` collection', () => {
            store.load({ url: SPACES_URL, fallback: () => [], currentPath: () => '/media' });
            httpMock.expectOne(SPACES_URL).flush({ member: [SHARED] });

            expect(store.spaces().map(s => s.key)).toEqual(['shared']);
        });
    });

    describe('ordering', () => {
        it('sorts by priority ascending', () => {
            store.load({ url: SPACES_URL, fallback: () => [], currentPath: () => '/nowhere' });
            flushHydra([SITE, PERSONAL, SHARED]);

            expect(store.spaces().map(s => s.key)).toEqual(['personal', 'shared', 'site:default']);
        });

        it('breaks a priority tie on key, so the order is stable across reloads', () => {
            const b = space({ key: 'b', rootPath: '/b', priority: 5 });
            const a = space({ key: 'a', rootPath: '/a', priority: 5 });

            store.load({ url: SPACES_URL, fallback: () => [], currentPath: () => '/nowhere' });
            flushHydra([b, a]);

            expect(store.spaces().map(s => s.key)).toEqual(['a', 'b']);
        });
    });

    describe('active-space restoration', () => {
        it('re-selects the space whose rootPath exactly matches currentPath', () => {
            store.load({ url: SPACES_URL, fallback: () => [], currentPath: () => '/media' });
            flushHydra([PERSONAL, SHARED]);

            expect(store.activeKey()).toBe('shared');
        });

        it('re-selects the space that contains currentPath', () => {
            store.load({
                url:         SPACES_URL,
                fallback:    () => [],
                currentPath: () => '/home/u1/media/invoices/2026',
            });
            flushHydra([PERSONAL, SHARED]);

            expect(store.activeKey()).toBe('personal');
        });

        it('does not match a sibling directory that merely shares a prefix', () => {
            // '/media-archive' starts with '/media' as a STRING but is not
            // inside it; the match has to land on a path-segment boundary.
            //
            // PERSONAL sorts first, so a plain `startsWith(rootPath)` would
            // wrongly select SHARED while the correct no-match answer is
            // PERSONAL. Ordering the fixtures this way is what makes the two
            // outcomes distinguishable -- with SHARED first the assertion
            // holds either way and the test proves nothing.
            store.load({ url: SPACES_URL, fallback: () => [], currentPath: () => '/media-archive/x' });
            flushHydra([SHARED, PERSONAL]);

            expect(store.activeKey()).toBe('personal');
        });

        it('falls back to the lowest-priority space when currentPath is outside every space', () => {
            store.load({ url: SPACES_URL, fallback: () => [], currentPath: () => '/somewhere/else' });
            flushHydra([SITE, SHARED, PERSONAL]);

            expect(store.activeKey()).toBe('personal');
        });

        /**
         * The regression this store exists to prevent.
         *
         * The page state service restores its persisted `lastDir` from user
         * prefs asynchronously, so at `load()` time the composer still reports
         * its default path. Reading `currentPath` eagerly captures that default
         * and silently drops the user back into the first space on every
         * reload. `load()` therefore takes a GETTER and calls it only once the
         * response lands.
         */
        it('reads currentPath when the response lands, not when load() is called', () => {
            let currentPath = '/media'; // composer default, before prefs restore

            store.load({
                url:         SPACES_URL,
                fallback:    () => [],
                currentPath: () => currentPath,
            });

            // Prefs restore resolves while the spaces request is still in flight.
            currentPath = '/home/u1/media/invoices';

            flushHydra([PERSONAL, SHARED]);

            expect(store.activeKey()).toBe('personal');
        });
    });

    describe('fallback paths', () => {
        it('applies the fallback without issuing a request when url is missing', () => {
            store.load({ url: null, fallback: () => [SHARED], currentPath: () => '/media' });

            httpMock.expectNone(SPACES_URL);
            expect(store.spaces().map(s => s.key)).toEqual(['shared']);
            expect(store.activeKey()).toBe('shared');
        });

        it('applies the fallback when the request fails', () => {
            store.load({ url: SPACES_URL, fallback: () => [SHARED], currentPath: () => '/media' });
            httpMock.expectOne(SPACES_URL).flush('boom', { status: 500, statusText: 'Server Error' });

            expect(store.spaces().map(s => s.key)).toEqual(['shared']);
        });

        it('applies the fallback when the response carries an empty collection', () => {
            store.load({ url: SPACES_URL, fallback: () => [SHARED], currentPath: () => '/media' });
            flushHydra([]);

            expect(store.spaces().map(s => s.key)).toEqual(['shared']);
        });

        it('leaves activeKey empty when there are no spaces at all', () => {
            store.load({ url: SPACES_URL, fallback: () => [], currentPath: () => '/media' });
            flushHydra([]);

            expect(store.spaces()).toEqual([]);
            expect(store.activeKey()).toBe('');
            expect(store.activeRootPath()).toBeNull();
        });
    });

    describe('activeRootPath', () => {
        it('resolves the active space rootPath', () => {
            store.load({ url: SPACES_URL, fallback: () => [], currentPath: () => '/media' });
            flushHydra([PERSONAL, SHARED]);

            expect(store.activeRootPath()).toBe('/media');
        });

        it('is null before anything is loaded, so callers apply their own default', () => {
            expect(store.activeRootPath()).toBeNull();
        });
    });

    describe('select()', () => {
        beforeEach(() => {
            store.load({ url: SPACES_URL, fallback: () => [], currentPath: () => '/media' });
            flushHydra([PERSONAL, SHARED]);
        });

        it('sets the active key and returns the chosen space', () => {
            const chosen = store.select('personal');

            expect(chosen?.key).toBe('personal');
            expect(store.activeKey()).toBe('personal');
            expect(store.activeRootPath()).toBe('/home/u1/media');
        });

        it('returns null and leaves the selection untouched for an unknown key', () => {
            const chosen = store.select('does-not-exist');

            expect(chosen).toBeNull();
            expect(store.activeKey()).toBe('shared');
        });
    });
});
