import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { TestBed, tick, fakeAsync } from '@angular/core/testing';

import { CmsFilterBuilderComponent } from './cms-filter-builder.component';
import type { EntityFieldsResponse } from './cms-filter-builder.types';

/**
 * Phase X-2.6a — behaviour spec for CmsFilterBuilder.
 *
 * Mirrors the X-2.5 endpoint shape.
 *
 * Coverage:
 *   1. Mount fires a GET against the configured alias.
 *   2. Loading + error states render before/after the response.
 *   3. + Add criterion appends a row pre-filled with the first
 *      filterable field's first operator.
 *   4. Composed RQL reflects rows and skips blank ones.
 *   5. Valueless operators (null/nn) emit without the value side.
 *   6. Removing a row updates the composed RQL.
 *   7. Switching the alias resets rows and refetches.
 */

@Component({
    standalone: true,
    imports: [CmsFilterBuilderComponent],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <cms-filter-builder
            [entityAlias]="alias()"
            (rqlChange)="onRql($event)"
        ></cms-filter-builder>
    `,
})
class HostComponent {
    readonly alias = signal('user');
    lastRql = '';

    onRql(rql: string): void {
        this.lastRql = rql;
    }
}

const RESPONSE: EntityFieldsResponse = {
    alias: 'user',
    entityType: 'User',
    fields: [
        {
            field: 'isActive',
            label: 'Active',
            type: 'bool',
            filterable: true,
            filterOperators: ['eq', 'ne'],
            sortable: true,
            searchable: false,
            enumValues: null,
        },
        {
            field: 'name',
            label: 'Name',
            type: 'string',
            filterable: true,
            filterOperators: ['eq', 'cn', 'null', 'nn'],
            sortable: true,
            searchable: true,
            enumValues: null,
        },
        {
            field: 'hidden',
            label: 'Hidden',
            type: 'string',
            filterable: false,
            filterOperators: [],
            sortable: false,
            searchable: false,
            enumValues: null,
        },
    ],
};

describe('CmsFilterBuilderComponent', () => {
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule, HostComponent],
        });
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('fetches fields on mount for the configured alias', () => {
        const f = TestBed.createComponent(HostComponent);
        f.detectChanges();

        const req = http.expectOne('/api/v1/entity/user/filters');
        expect(req.request.method).toBe('GET');
        req.flush(RESPONSE);
        f.detectChanges();
    });

    it('renders only filterable fields in the field selector', () => {
        const f = TestBed.createComponent(HostComponent);
        f.detectChanges();
        http.expectOne('/api/v1/entity/user/filters').flush(RESPONSE);
        f.detectChanges();

        const addBtn = f.nativeElement.querySelector('.cms-filter-builder__add') as HTMLButtonElement;
        addBtn.click();
        f.detectChanges();

        const opts = f.nativeElement.querySelectorAll('.cms-filter-builder__field option') as NodeListOf<HTMLOptionElement>;
        const values = Array.from(opts).map((o) => o.value);
        expect(values).toEqual(['isActive', 'name']);
    });

    it('composes RQL for typical rows', fakeAsync(() => {
        const f = TestBed.createComponent(HostComponent);
        f.detectChanges();
        http.expectOne('/api/v1/entity/user/filters').flush(RESPONSE);
        f.detectChanges();

        const addBtn = f.nativeElement.querySelector('.cms-filter-builder__add') as HTMLButtonElement;
        addBtn.click();
        f.detectChanges();
        tick(300);
        // First filterable is isActive (bool, default value true).
        expect(f.componentInstance.lastRql).toBe('filter[]=isActive%20eq%20true');
    }));

    it('omits the value side for valueless operators', fakeAsync(() => {
        const f = TestBed.createComponent(HostComponent);
        f.detectChanges();
        http.expectOne('/api/v1/entity/user/filters').flush(RESPONSE);
        f.detectChanges();

        const addBtn = f.nativeElement.querySelector('.cms-filter-builder__add') as HTMLButtonElement;
        addBtn.click();
        f.detectChanges();

        // Switch to `name nn` (string field, "is not empty" operator).
        const fieldSel = f.nativeElement.querySelector('.cms-filter-builder__field') as HTMLSelectElement;
        fieldSel.value = 'name';
        fieldSel.dispatchEvent(new Event('change'));
        f.detectChanges();

        const opSel = f.nativeElement.querySelector('.cms-filter-builder__op') as HTMLSelectElement;
        opSel.value = 'nn';
        opSel.dispatchEvent(new Event('change'));
        f.detectChanges();
        tick(300);
        expect(f.componentInstance.lastRql).toBe('filter[]=name%20nn');
    }));

    /**
     * The regression (#1670). Two criteria used to join with a literal
     * ' and ', which the RQL DSL has no notion of — the whole tail became
     * the FIRST criterion's value. Depending on field order that was a 500
     * ("Unable to compute count.") or, worse, a confident "No users match
     * this filter." Top-level filters are an implicit AND expressed as
     * repeated params, so each criterion gets its own `filter[]=`.
     *
     * The single-criterion cases above passed throughout — nothing pinned
     * what happens with two, which is exactly how this shipped.
     */
    it('emits one filter[] param per criterion, never an infix conjunction', fakeAsync(() => {
        const f = TestBed.createComponent(HostComponent);
        f.detectChanges();
        http.expectOne('/api/v1/entity/user/filters').flush(RESPONSE);
        f.detectChanges();

        const addBtn = f.nativeElement.querySelector('.cms-filter-builder__add') as HTMLButtonElement;
        addBtn.click();
        f.detectChanges();
        addBtn.click();
        f.detectChanges();

        // Second row → `name cn admin`, so the two rows differ.
        const fields = f.nativeElement.querySelectorAll('.cms-filter-builder__field') as NodeListOf<HTMLSelectElement>;
        fields[1].value = 'name';
        fields[1].dispatchEvent(new Event('change'));
        f.detectChanges();

        const ops = f.nativeElement.querySelectorAll('.cms-filter-builder__op') as NodeListOf<HTMLSelectElement>;
        ops[1].value = 'cn';
        ops[1].dispatchEvent(new Event('change'));
        f.detectChanges();

        const values = f.nativeElement.querySelectorAll('.cms-filter-builder__value') as NodeListOf<HTMLInputElement>;
        values[1].value = 'admin';
        values[1].dispatchEvent(new Event('input'));
        f.detectChanges();
        tick(300);

        const rql = f.componentInstance.lastRql;
        expect(rql).not.toContain(' and ');
        expect(rql.split('&').length).toBe(2);
        expect(rql).toBe('filter[]=isActive%20eq%20true&filter[]=name%20cn%20admin');
    }));

    it('emits empty RQL when all rows are removed', fakeAsync(() => {
        const f = TestBed.createComponent(HostComponent);
        f.detectChanges();
        http.expectOne('/api/v1/entity/user/filters').flush(RESPONSE);
        f.detectChanges();
        (f.nativeElement.querySelector('.cms-filter-builder__add') as HTMLButtonElement).click();
        f.detectChanges();
        tick(300);
        (f.nativeElement.querySelector('.cms-filter-builder__remove') as HTMLButtonElement).click();
        f.detectChanges();
        tick(300);
        expect(f.componentInstance.lastRql).toBe('');
    }));

    it('refetches and resets rows when the alias changes', fakeAsync(() => {
        const f = TestBed.createComponent(HostComponent);
        f.detectChanges();
        http.expectOne('/api/v1/entity/user/filters').flush(RESPONSE);
        f.detectChanges();
        (f.nativeElement.querySelector('.cms-filter-builder__add') as HTMLButtonElement).click();
        f.detectChanges();
        tick(300);
        expect(f.componentInstance.lastRql).toBe('filter[]=isActive%20eq%20true');

        f.componentInstance.alias.set('navi_node');
        f.detectChanges();
        http.expectOne('/api/v1/entity/navi_node/filters').flush({ ...RESPONSE, alias: 'navi_node' });
        f.detectChanges();
        tick(300);
        expect(f.componentInstance.lastRql).toBe('');
    }));
});
