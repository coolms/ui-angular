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

    function mount(): { events: string[]; fixture: ReturnType<typeof TestBed.createComponent<DataGridComponent>> } {
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
        fixture.componentRef.setInput('externalData', EMPTY);
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
});
