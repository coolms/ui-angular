import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NgxsModule } from '@ngxs/store';
import { Subject } from 'rxjs';
import { AppConfigState, ElevationService } from '@coolms/core-angular';
import { DataGridComponent } from './datagrid.component';
import type { DataGridConfig, DataGridData } from './datagrid.types';

/**
 * What the grid gives a parent that reads its rows from the definition's declared source: the definition, before
 * the grid first asks for rows, and the definition read again when elevation changes -- its `rows.state` is a
 * snapshot of the session's elevation.
 */
describe('DataGridComponent -- a definition that declares its rows', () => {
    let http: HttpTestingController;
    let elevationChanges: Subject<unknown>;

    const EMPTY: DataGridData = { items: [], totalItems: 0, page: 1, limit: 50, totalPages: 1, hasMore: true };

    function definition(withRows: boolean): DataGridConfig {
        return {
            id: 'contact:contacts', label: '', columns: [], rowActions: [], draggable: false, perPage: 50,
            loadingMode: 'lazy',
            ...(withRows ? { rows: {
                action: 'contact.contact.list', operation: 'GET /api/v1/contacts', state: 'allowed', query: 'rql',
            } } : {}),
        } as DataGridConfig;
    }

    function mount(external = true): { events: string[]; fixture: ReturnType<typeof TestBed.createComponent<DataGridComponent>> } {
        elevationChanges = new Subject<unknown>();
        TestBed.configureTestingModule({
            imports: [DataGridComponent, NgxsModule.forRoot([AppConfigState])],
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: ElevationService, useValue: { changes$: elevationChanges.asObservable() } },
            ],
        });
        http = TestBed.inject(HttpTestingController);
        const fixture = TestBed.createComponent(DataGridComponent);
        const events: string[] = [];
        fixture.componentInstance.configLoaded.subscribe(cfg => events.push('configLoaded:' + (cfg.rows ? 'rows' : 'none')));
        fixture.componentInstance.loadMore.subscribe(e => events.push('loadMore:' + String(e.offset)));
        fixture.componentRef.setInput('configBaseUrl', '/api/v1/datagrids');
        fixture.componentRef.setInput('gridId', 'contact:contacts');
        if (external) {
            fixture.componentRef.setInput('externalData', EMPTY);
        }
        fixture.detectChanges();

        return { events, fixture };
    }

    it('hands the parent the definition BEFORE it first asks for rows', () => {
        const { events } = mount();
        http.expectOne('/api/v1/datagrids/contact%3Acontacts').flush(definition(true));

        // The lazy grid kicks its first page off itself once the definition is in; the parent must already know
        // where rows come from by then.
        const loaded = events.indexOf('configLoaded:rows');
        const firstLoad = events.findIndex(e => e.startsWith('loadMore'));
        expect(loaded).toBe(0);
        expect(firstLoad).withContext(events.join(' | ')).toBeGreaterThan(loaded);
        http.verify();
    });

    it('reads the definition again when elevation changes, when it declares its rows', () => {
        const { events } = mount();
        http.expectOne('/api/v1/datagrids/contact%3Acontacts').flush(definition(true));

        elevationChanges.next({ kind: 'granted' });

        http.expectOne('/api/v1/datagrids/contact%3Acontacts').flush(definition(true));
        expect(events.filter(e => e.startsWith('configLoaded')).length).toBe(2);
        http.verify();
    });

    it('does not read again a definition that declares no rows', () => {
        mount();
        http.expectOne('/api/v1/datagrids/contact%3Acontacts').flush(definition(false));

        elevationChanges.next({ kind: 'granted' });

        http.expectNone('/api/v1/datagrids/contact%3Acontacts');
        http.verify();
    });

    // A list the caller may not read says so (2026-10-14): for an account outside the admin group the Users, Leads
    // and Call history definitions answer 403, and each page showed "The list could not be loaded" with a Retry
    // that can only be refused again -- an error, where the answer is "not yours".
    describe('when the definition is refused', () => {
        const URL = '/api/v1/datagrids/contact%3Acontacts';

        it('says "Not available to you" for a 403 that elevation would not change -- no error banner, no retry', () => {
            const { fixture } = mount();
            http.expectOne(URL).flush({ detail: 'Access denied.' }, { status: 403, statusText: 'Forbidden' });
            fixture.detectChanges();
            const host = fixture.nativeElement as HTMLElement;

            expect(fixture.componentInstance.accessDenied()).toBe(true);
            expect(host.querySelector('[data-test="datagrid-denied"]')?.textContent).toContain('Not available to you');
            expect(host.querySelector('app-error-banner')).toBeNull();
            expect(fixture.componentInstance.error()).toBeNull();
            http.verify();
        });

        it('says "Not available to you" when the grid\'s own rows are refused the same way, with no empty table beside it', () => {
            const { fixture } = mount(false);
            http.expectOne(URL).flush(definition(false));
            const refuse = { status: 403, statusText: 'Forbidden' };
            http.expectOne(req => req.url === URL + '/data').flush({ detail: 'Access denied.' }, refuse);
            fixture.detectChanges();
            // The grid's first render may ask once more (its start-up); every ask is refused, and it must stop.
            let asked = 1;
            for (let i = 0; i < 5; i++) {
                const more = http.match(req => req.url === URL + '/data');
                if (0 === more.length) break;
                asked += more.length;
                more.forEach(r => r.flush({ detail: 'Access denied.' }, refuse));
                fixture.detectChanges();
            }
            const host = fixture.nativeElement as HTMLElement;

            expect(asked).withContext('a refused list is not asked again and again').toBeLessThanOrEqual(2);
            expect(fixture.componentInstance.accessDenied()).toBe(true);
            expect(host.querySelector('[data-test="datagrid-denied"]')?.textContent).toContain('Not available to you');
            expect(host.querySelector('[data-test="datagrid-denied"]')?.getAttribute('role')).toBe('status');
            expect(host.querySelectorAll('app-empty-state').length).toBe(1);
            // Nothing of the list beside it: no table (its header, its empty row) and no "Loading more" sentinel.
            expect(host.querySelector('table')).toBeNull();
            expect(host.textContent ?? '').not.toContain('Loading more');
            expect(host.querySelector('app-error-banner')).toBeNull();
            http.verify();
        });

        it('offers elevation, not "Not available", for a 403 stamped as needing elevation', () => {
            const { fixture } = mount();
            http.expectOne(URL).flush({}, { status: 403, statusText: 'Forbidden', headers: { 'X-Elevation-Required': 'password' } });

            expect(fixture.componentInstance.elevationRequired()).toBe(true);
            expect(fixture.componentInstance.accessDenied()).toBe(false);
            http.verify();
        });

        it('keeps the error banner for a failure that is not a refusal', () => {
            const { fixture } = mount();
            http.expectOne(URL).flush({}, { status: 500, statusText: 'Server Error' });
            fixture.detectChanges();

            expect(fixture.componentInstance.accessDenied()).toBe(false);
            expect(fixture.componentInstance.error()).toContain('The list could not be loaded');
            expect((fixture.nativeElement as HTMLElement).querySelector('[data-test="datagrid-denied"]')).toBeNull();
            http.verify();
        });
    });
});
