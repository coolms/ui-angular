import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Store } from '@ngxs/store';
import { ErrorHandlerService } from '@coolms/core-angular';
import { declaredRowsSource, type DeclaredRowsOptions, type DeclaredRowsSource } from './declared-rows.source';
import type { DataGridConfig, DataGridRows } from './datagrid.types';

/**
 * A grid's rows read from where its definition declares they come from: the operation, the query style, the
 * caller's state. The HTTP layer is Angular's own testing backend -- every request a case makes is asserted, and
 * `verify()` fails a case that made one it did not expect.
 */
describe('declaredRowsSource', () => {
    let http: HttpTestingController;

    function sourceWith(
        apiBase = '/api/v1',
        extra: ReadonlyArray<string> = [],
        more: Omit<DeclaredRowsOptions, 'pageSize' | 'extraFilters'> = {},
    ): DeclaredRowsSource {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: Store, useValue: { selectSnapshot: () => ({ apiBase }) } },
                { provide: ErrorHandlerService, useValue: { humanize: (): string => 'Refused: not yours.' } },
            ],
        });
        http = TestBed.inject(HttpTestingController);

        return TestBed.runInInjectionContext(() => declaredRowsSource({ pageSize: 2, extraFilters: () => extra, ...more }));
    }

    function config(rows: Partial<DataGridRows> | null): DataGridConfig {
        return {
            id: 'contact:contacts', label: '', columns: [], rowActions: [], draggable: false, perPage: 2,
            rows: null === rows ? null : {
                action: 'contact.contact.list', operation: 'GET /api/v1/contacts', state: 'allowed', query: 'rql', ...rows,
            },
        } as DataGridConfig;
    }

    afterEach(() => http.verify());

    it('asks the declared operation with the grid paging, sort and every filter, and maps the Hydra answer', () => {
        const source = sourceWith('/api/v1', ['kind eq "person"']);
        source.use(config({}));
        source.load({ offset: 0, sort: '-createdAt', reset: true, columnFilters: ['name cn "ada"', 'isActive eq true'] });

        const req = http.expectOne(r => r.url === '/api/v1/contacts');
        expect(req.request.method).toBe('GET');
        expect(req.request.headers.get('Accept')).toBe('application/ld+json');
        expect(req.request.params.get('page')).toBe('1');
        expect(req.request.params.get('limit')).toBe('2');
        expect(req.request.params.get('sort')).toBe('-createdAt');
        expect(req.request.params.getAll('filter')).toEqual(['name cn "ada"', 'isActive eq true', 'kind eq "person"']);
        req.flush({ member: [{ id: 'a' }, { id: 'b' }], totalItems: 5 });

        expect(source.data().items).toEqual([{ id: 'a' }, { id: 'b' }]);
        expect(source.data().totalItems).toBe(5);
        expect(source.data().hasMore).toBe(true);
        expect(source.availability()).toBe('allowed');
    });

    it('appends the next page, and replaces on a reset', () => {
        const source = sourceWith();
        source.use(config({}));
        source.load({ offset: 0, sort: null, reset: true, columnFilters: [] });
        http.expectOne(r => r.params.get('page') === '1').flush({ member: [{ id: 'a' }, { id: 'b' }], totalItems: 3 });

        source.load({ offset: 2, sort: null, reset: false, columnFilters: [] });
        http.expectOne(r => r.params.get('page') === '2').flush({ member: [{ id: 'c' }], totalItems: 3 });
        expect(source.data().items.map(r => r['id'])).toEqual(['a', 'b', 'c']);
        expect(source.data().hasMore).toBe(false);

        source.load({ offset: 0, sort: 'name', reset: true, columnFilters: [] });
        http.expectOne(r => r.params.get('page') === '1').flush({ member: [{ id: 'z' }], totalItems: 1 });
        expect(source.data().items.map(r => r['id'])).toEqual(['z']);
    });

    it('drops an answer a later request has superseded', () => {
        const source = sourceWith();
        source.use(config({}));
        source.load({ offset: 0, sort: null, reset: true, columnFilters: ['name cn "a"'] });
        source.load({ offset: 0, sort: null, reset: true, columnFilters: ['name cn "ab"'] });
        const [first, second] = http.match(r => r.url === '/api/v1/contacts');

        second.flush({ member: [{ id: 'ab' }], totalItems: 1 });
        first.flush({ member: [{ id: 'a' }], totalItems: 1 });

        expect(source.data().items.map(r => r['id'])).toEqual(['ab']);
    });

    it('reads every row in one parameterless GET for `query: none`, and asks nothing more', () => {
        const source = sourceWith();
        source.use(config({ query: 'none', operation: 'GET /api/v1/auth/groups' }));

        const req = http.expectOne(r => r.url === '/api/v1/auth/groups');
        expect(req.request.params.keys()).toEqual([]);
        req.flush({ member: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }] });
        expect(source.data().totalItems).toBe(3);
        expect(source.data().hasMore).toBe(false);

        source.load({ offset: 3, sort: null, reset: false, columnFilters: [] });
        http.expectNone(() => true);
    });

    it('keeps a request that came before the definition, and runs it once the definition says allowed', () => {
        const source = sourceWith();
        source.load({ offset: 0, sort: 'name', reset: true, columnFilters: [] });
        http.expectNone(() => true);

        source.use(config({}));
        http.expectOne(r => r.url === '/api/v1/contacts' && r.params.get('sort') === 'name').flush({ member: [], totalItems: 0 });
    });

    it('fetches nothing for `denied` or `elevate`, and says which', () => {
        for (const state of ['denied', 'elevate'] as const) {
            const source = sourceWith();
            source.use(config({ state }));
            source.load({ offset: 0, sort: null, reset: true, columnFilters: [] });

            http.expectNone(() => true);
            expect(source.availability()).toBe(state);
            expect(source.data().items).toEqual([]);
            expect(source.data().hasMore).toBe(false);
        }
    });

    it('starts over when the definition read again says allowed (after an elevation)', () => {
        const source = sourceWith();
        source.use(config({ state: 'elevate' }));
        source.load({ offset: 0, sort: null, reset: true, columnFilters: [] });
        http.expectNone(() => true);

        source.use(config({ state: 'allowed' }));
        http.expectOne(r => r.url === '/api/v1/contacts').flush({ member: [{ id: 'a' }], totalItems: 1 });
        expect(source.availability()).toBe('allowed');
        expect(source.data().items.map(r => r['id'])).toEqual(['a']);
    });

    it('says so, and fetches nothing, when the definition names no source', () => {
        const source = sourceWith();
        source.use(config(null));
        source.load({ offset: 0, sort: null, reset: true, columnFilters: [] });

        http.expectNone(() => true);
        expect(source.availability()).toBe('undeclared');
        expect(source.error()).toBe('This list does not say where its rows come from.');
    });

    it('shows the server\'s refusal and stops asking for more', () => {
        const source = sourceWith();
        source.use(config({}));
        source.load({ offset: 0, sort: null, reset: true, columnFilters: [] });
        http.expectOne(r => r.url === '/api/v1/contacts').flush({ title: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });

        expect(source.error()).toBe('Refused: not yours.');
        expect(source.data().hasMore).toBe(false);
    });

    it('says when its first answer is in, and whether the grid body should be drawn', () => {
        const source = sourceWith();
        expect(source.loaded()).toBe(false);
        expect(source.showsRows()).toBe(true); // before the definition: the grid's own loading state

        source.use(config({}));
        source.load({ offset: 0, sort: null, reset: true, columnFilters: [] });
        expect(source.loaded()).toBe(false);
        http.expectOne(r => r.url === '/api/v1/contacts').flush({ member: [], totalItems: 0 });
        expect(source.loaded()).toBe(true);
        expect(source.showsRows()).toBe(true);

        for (const state of ['denied', 'elevate'] as const) {
            source.use(config({ state }));
            expect(source.showsRows()).toBe(false);
        }
        source.use(config(null));
        expect(source.showsRows()).toBe(false);
    });

    it('sends the page\'s named scope beside the RQL, and shapes each row as the grid draws it', () => {
        const source = sourceWith('/api/v1', [], {
            extraParams: () => ({ status: 'handled' }),
            mapRow: row => ({ ...row, label: String(row['first']) + ' ' + String(row['last']) }),
        });
        source.use(config({ operation: 'GET /api/v1/leads' }));
        source.load({ offset: 0, sort: null, reset: true, columnFilters: ['channel eq "web"'] });

        const req = http.expectOne(r => r.url === '/api/v1/leads');
        expect(req.request.params.get('status')).toBe('handled');
        expect(req.request.params.getAll('filter')).toEqual(['channel eq "web"']);
        req.flush({ member: [{ id: 'l1', first: 'Ada', last: 'Lovelace' }], totalItems: 1 });

        expect(source.data().items[0]['label']).toBe('Ada Lovelace');
    });

    it('changes the loaded rows in place for a live event, and the count with them', () => {
        const source = sourceWith();
        source.use(config({}));
        source.load({ offset: 0, sort: null, reset: true, columnFilters: [] });
        http.expectOne(r => r.url === '/api/v1/contacts').flush({ member: [{ id: 'a' }, { id: 'b' }], totalItems: 7 });

        source.update(items => items.map(r => (r['id'] === 'a' ? { ...r, name: 'renamed' } : r)));
        expect(source.data().items[0]['name']).toBe('renamed');
        expect(source.data().totalItems).toBe(7);

        source.update(items => items.filter(r => r['id'] !== 'b'));
        expect(source.data().items.map(r => r['id'])).toEqual(['a']);
        expect(source.data().totalItems).toBe(6);
    });

    it('asks the API\'s own origin when the manifest names an absolute API base', () => {
        const source = sourceWith('https://api.example.test/api/v1');
        source.use(config({}));
        source.load({ offset: 0, sort: null, reset: true, columnFilters: [] });

        http.expectOne(r => r.url === 'https://api.example.test/api/v1/contacts').flush({ member: [], totalItems: 0 });
    });
});
