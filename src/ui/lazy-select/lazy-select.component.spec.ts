import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NgxsModule } from '@ngxs/store';
import { AuthState } from '@coolms/core-angular';
import { LazySelectComponent, LazySelectOption } from './lazy-select.component';

/**
 * Task — behaviour spec for the generic lazy-loading select.
 *
 * Coverage:
 *   1. Client-side mode filters the static `options` by typed query
 *      (case-insensitive substring on label).
 *   2. Server-search mode debounces the typed query (300ms) and then
 *      fires one HTTP call, NOT one per keystroke.
 *   3. RQL search style produces a `filter=field cn "query"` parameter.
 *   4. The `q` search style produces a `q=<query>` parameter instead.
 *   5. ensureSelectedInList fetches the selected row individually when
 *      it isn't in the first page (server mode).
 *   6. valueChange emits the option id when a row is clicked.
 *   7. valueChange emits the empty string when the inline clear button
 *      is invoked.
 */
describe('LazySelectComponent', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<LazySelectComponent>>;
    let component: LazySelectComponent;
    let httpMock: HttpTestingController;

    function makeOptions(...labels: string[]): readonly LazySelectOption[] {
        return labels.map((label, idx) => ({ id: `id-${idx}`, label }));
    }

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [
                HttpClientTestingModule,
                LazySelectComponent,
                // `AuthState` must be registered: `fetchFromApi` reads the
                // bearer token via `selectSnapshot(AuthState.accessToken)`,
                // and an unregistered state yields `undefined` there.
                NgxsModule.forRoot([AuthState]),
            ],
        });
        fixture   = TestBed.createComponent(LazySelectComponent);
        component = fixture.componentInstance;
        httpMock  = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    // --- Client-side mode --------------------------------------------

    it('client-side mode filters static options by case-insensitive substring on label', () => {
        fixture.componentRef.setInput('options', makeOptions('Apple', 'Banana', 'Avocado'));
        fixture.detectChanges();

        // All options visible initially
        expect(component.filteredOptions().length).toBe(3);

        // Type 'a' — Apple + Banana + Avocado all match (they contain 'a')
        component.searchQuery.set('a');
        expect(component.filteredOptions().map(o => o.label)).toEqual(['Apple', 'Banana', 'Avocado']);

        // Type 'av' — only Avocado matches
        component.searchQuery.set('av');
        expect(component.filteredOptions().map(o => o.label)).toEqual(['Avocado']);

        // Type 'XYZ' — empty
        component.searchQuery.set('XYZ');
        expect(component.filteredOptions().length).toBe(0);
    });

    // --- Server-search mode: RQL -------------------------------------

    it('server mode + RQL style builds `filter=field cn "query"` parameter', fakeAsync(() => {
        fixture.componentRef.setInput('apiUrl', '/api/v1/calendar');
        fixture.componentRef.setInput('searchStyle', 'rql');
        fixture.componentRef.setInput('searchField', 'title');
        fixture.detectChanges();

        // Initial cold-load fires with no query
        const init = httpMock.expectOne(r =>
            r.url === '/api/v1/calendar' &&
            r.params.has('limit') &&
            !r.params.has('filter'),
        );
        init.flush({ member: [], totalItems: 0 });

        // Type a query -> debounce -> one request with the RQL filter
        component.searchControl.setValue('ops');
        tick(299);
        // Not yet — debounce window still open
        httpMock.expectNone(r => r.url === '/api/v1/calendar' && r.params.has('filter'));
        tick(1);

        const req = httpMock.expectOne(r =>
            r.url === '/api/v1/calendar' &&
            r.params.get('filter') === 'title cn "ops"',
        );
        req.flush({ member: [{ id: 'cal-1', title: 'Ops' }], totalItems: 1 });
    }));

    // --- Server-search mode: q style ---------------------------------

    it('server mode + q style builds `q=<query>` parameter', fakeAsync(() => {
        fixture.componentRef.setInput('apiUrl', '/api/v1/calendar');
        fixture.componentRef.setInput('searchStyle', 'q');
        fixture.detectChanges();

        httpMock.expectOne(r => r.url === '/api/v1/calendar').flush({ member: [], totalItems: 0 });

        component.searchControl.setValue('engineering');
        tick(300);

        const req = httpMock.expectOne(r =>
            r.url === '/api/v1/calendar' && r.params.get('q') === 'engineering',
        );
        req.flush({ member: [], totalItems: 0 });
    }));

    // --- ensureSelectedInList ----------------------------------------

    it('fetches the selected row individually when it is not in the first page', fakeAsync(() => {
        fixture.componentRef.setInput('apiUrl', '/api/v1/calendar');
        fixture.componentRef.setInput('value', 'missing-id');
        fixture.detectChanges();

        const list = httpMock.expectOne(r => r.url === '/api/v1/calendar');
        list.flush({ member: [{ id: 'visible-id', title: 'Visible' }], totalItems: 1 });

        // The component now sees 'missing-id' isn't in the loaded list and fetches it
        const detail = httpMock.expectOne('/api/v1/calendar/missing-id');
        detail.flush({ id: 'missing-id', title: 'Missing One' });

        expect(component.selectedOption()?.label).toBe('Missing One');
    }));

    // --- valueChange semantics ---------------------------------------

    it('selectOption emits the option id and closes the dropdown', () => {
        const emitted: string[] = [];
        component.valueChange.subscribe(v => emitted.push(v));

        component.isOpen.set(true);
        component.selectOption({ id: 'pick-me', label: 'Pick Me' });

        expect(emitted).toEqual(['pick-me']);
        expect(component.isOpen()).toBe(false);
    });

    it('clear() emits empty string and stops event propagation', () => {
        const emitted: string[] = [];
        component.valueChange.subscribe(v => emitted.push(v));

        const event = { stopPropagation: jasmine.createSpy('stopPropagation') } as unknown as Event;
        component.clear(event);

        expect(emitted).toEqual(['']);
        expect((event.stopPropagation as jasmine.Spy).calls.count()).toBe(1);
    });

    // --- Label fallback chain ----------------------------------------

    it('rowToOption follows the labelKeys fallback chain', fakeAsync(() => {
        fixture.componentRef.setInput('apiUrl', '/api/v1/identity/users');
        fixture.componentRef.setInput('labelKeys', ['name', 'fullName', 'email', 'identifier']);
        fixture.detectChanges();

        const req = httpMock.expectOne(r => r.url === '/api/v1/identity/users');
        req.flush({
            member: [
                { id: 'u1', name: 'Ada Lovelace' },                          // name wins
                { id: 'u2', fullName: 'Grace Hopper' },                      // falls to fullName
                { id: 'u3', email: 'alan@bletchley.org' },                   // falls to email
                { id: 'u4', identifier: 'turing' },                           // falls to identifier
                { id: 'u5' },                                                 // falls to id itself
            ],
            totalItems: 5,
        });

        const labels = component.serverOptions().map(o => o.label);
        expect(labels).toEqual([
            'Ada Lovelace',
            'Grace Hopper',
            'alan@bletchley.org',
            'turing',
            'u5',
        ]);
    }));
});
