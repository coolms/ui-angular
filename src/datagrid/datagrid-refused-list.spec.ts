import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NgxsModule } from '@ngxs/store';
import { Subject } from 'rxjs';
import { AppConfigState, ElevationService } from '@coolms/core-angular';
import { DataGridComponent } from './datagrid.component';
import type { DataGridConfig } from './datagrid.types';

/**
 * What a person sees on a list they may not read, from the page alone (the browser walk of 2026-10-14). Outside the
 * admin group, the Users, Leads and Call history pages showed "The list could not be loaded" with a Retry that can
 * only be refused again. The answer there is "not yours", and the page must say so: "Not available to you", no error
 * banner, no Retry.
 *
 * These read only the rendered page -- no member of the component -- so they run unchanged against the grid as it
 * was before the fix, and fail there on what the walk saw.
 */
describe('DataGridComponent -- a list the caller may not read, as the page shows it', () => {
    const URL = '/api/v1/datagrids/contact%3Acontacts';
    const REFUSED = { status: 403, statusText: 'Forbidden' };
    let http: HttpTestingController;

    function mount(external: boolean): ReturnType<typeof TestBed.createComponent<DataGridComponent>> {
        TestBed.configureTestingModule({
            imports: [DataGridComponent, NgxsModule.forRoot([AppConfigState])],
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: ElevationService, useValue: { changes$: new Subject<unknown>().asObservable() } },
            ],
        });
        http = TestBed.inject(HttpTestingController);
        const fixture = TestBed.createComponent(DataGridComponent);
        fixture.componentRef.setInput('configBaseUrl', '/api/v1/datagrids');
        fixture.componentRef.setInput('gridId', 'contact:contacts');
        if (external) {
            fixture.componentRef.setInput('externalData', { items: [], totalItems: 0, page: 1, limit: 50, totalPages: 1, hasMore: false });
        }
        fixture.detectChanges();

        return fixture;
    }

    function shown(fixture: ReturnType<typeof TestBed.createComponent<DataGridComponent>>): { text: string; retry: boolean; banner: boolean } {
        fixture.detectChanges();
        const host = fixture.nativeElement as HTMLElement;
        const buttons = Array.from(host.querySelectorAll('button')).map(b => (b.textContent ?? '').trim());

        return {
            text: (host.textContent ?? '').replace(/\s+/g, ' '),
            retry: buttons.some(t => /retry/i.test(t)),
            banner: host.querySelector('app-error-banner') !== null,
        };
    }

    it('says "Not available to you" when the list\'s definition is refused -- not "could not be loaded", no Retry', () => {
        const fixture = mount(true);
        http.expectOne(URL).flush({ detail: 'Access denied.' }, REFUSED);

        const page = shown(fixture);
        expect(page.text).toContain('Not available to you');
        expect(page.text).not.toContain('could not be loaded');
        expect(page.retry).withContext('a Retry that can only be refused again').toBe(false);
        expect(page.banner).withContext('an error banner').toBe(false);
    });

    it('says "Not available to you" when the list\'s rows are refused -- not "could not be loaded", no Retry', () => {
        const fixture = mount(false);
        http.expectOne(URL).flush({
            id: 'contact:contacts', label: '', columns: [], rowActions: [], draggable: false, perPage: 50,
            loadingMode: 'lazy',
        } as DataGridConfig);
        // Every ask for rows is refused, the grid's start-up second ask included.
        for (let i = 0; i < 5; i++) {
            const asks = http.match(req => req.url === URL + '/data');
            if (0 === asks.length) break;
            asks.forEach(r => r.flush({ detail: 'Access denied.' }, REFUSED));
            fixture.detectChanges();
        }

        const page = shown(fixture);
        expect(page.text).toContain('Not available to you');
        expect(page.text).not.toContain('could not be loaded');
        expect(page.retry).withContext('a Retry that can only be refused again').toBe(false);
        expect(page.banner).withContext('an error banner').toBe(false);
    });
});
