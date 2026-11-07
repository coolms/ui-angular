import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgxsModule } from '@ngxs/store';
import { AppConfigState } from '@coolms/core-angular';
import { DataGridComponent } from './datagrid.component';
import type { DataGridConfig, DataGridData } from './datagrid.types';

/** A heading row each time a named column changes; the headings are not rows, so selection and keys never land on one. */
describe('DataGridComponent — group by a column', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<DataGridComponent>>;

    const data = (items: Record<string, unknown>[]): DataGridData => ({
        items,
        totalItems: items.length,
        page: 1,
        limit: 50,
        totalPages: 1,
        hasMore: false,
    });

    function grid(groupBy: string | null, items: Record<string, unknown>[]): DataGridComponent {
        fixture.componentRef.setInput('groupBy', groupBy);
        fixture.componentRef.setInput('externalData', data(items));
        const component = fixture.componentInstance;
        component.config.set({
            id: 'test:group',
            label: '',
            columns: [{ field: 'person', label: 'Person', type: 'text' }],
            draggable: false,
            perPage: 50,
            rowActions: [],
        } as unknown as DataGridConfig);
        return component;
    }

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule, DataGridComponent, NgxsModule.forRoot([AppConfigState])],
        });
        fixture = TestBed.createComponent(DataGridComponent);
    });

    const ROWS = [
        { id: '1', person: 'Ann' },
        { id: '2', person: 'Ann' },
        { id: '3', person: 'Bob' },
        { id: '4', person: 'Ann' },
    ];

    it('heads each run of the same value, with how many rows it holds', () => {
        const component = grid('person', ROWS);
        fixture.detectChanges();

        expect(component.groupHeading(0)).toEqual({ label: 'Ann', count: 2 });
        expect(component.groupHeading(1)).toBeNull();
        expect(component.groupHeading(2)).toEqual({ label: 'Bob', count: 1 });
        expect(component.groupHeading(3)).toEqual({ label: 'Ann', count: 1 });
    });

    it('heads nothing when no column is named', () => {
        const component = grid(null, ROWS);
        fixture.detectChanges();

        ROWS.forEach((_, index) => expect(component.groupHeading(index)).toBeNull());
    });

    it('draws the headings as rows that are not the grid\'s rows', () => {
        grid('person', ROWS);
        fixture.detectChanges();
        const root: HTMLElement = fixture.nativeElement;

        const headings = Array.from(root.querySelectorAll('[data-test="datagrid-group-row"]'));
        expect(headings.map(h => h.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Ann 2', 'Bob 1', 'Ann 1']);
        expect(root.querySelectorAll('tr[data-row-id]').length).toBe(4);
        expect(headings.some(h => h.hasAttribute('data-row-id'))).toBeFalse();
    });

    it('a heading spans the real columns, and leaves their widths alone at a fixed layout', () => {
        const component = grid('person', ROWS);
        component.config.update(config => ({
            ...(config as DataGridConfig),
            columns: [
                { field: 'person', label: 'Person', type: 'text' },
                { field: 'city', label: 'City', type: 'text' },
                { field: 'phone', label: 'Phone', type: 'text' },
            ],
        } as unknown as DataGridConfig));
        fixture.detectChanges();
        const root: HTMLElement = fixture.nativeElement;
        document.body.appendChild(root);
        const table = root.querySelector('table') as HTMLTableElement;
        table.style.width = '1000px';
        table.style.tableLayout = 'fixed';

        const heading = root.querySelector('[data-test="datagrid-group-row"] th') as HTMLTableCellElement;
        expect(heading.colSpan).toBe(component.colCount(component.config() as DataGridConfig));
        const firstRow = root.querySelector('tr[data-row-id]') as HTMLTableRowElement;
        expect(firstRow.cells.length).toBe(heading.colSpan);
        expect(firstRow.cells[0].getBoundingClientRect().width).toBeGreaterThan(100);
        root.remove();
    });

    it('draws none when no column is named', () => {
        grid(null, ROWS);
        fixture.detectChanges();

        expect((fixture.nativeElement as HTMLElement).querySelector('[data-test="datagrid-group-row"]')).toBeNull();
    });
});
