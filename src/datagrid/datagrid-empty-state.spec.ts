import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgxsModule } from '@ngxs/store';
import { AppConfigState } from '@coolms/core-angular';
import { DataGridComponent } from './datagrid.component';
import type { ActiveFilter, DataGridConfig } from './datagrid.types';

/**
 * The empty state must distinguish "nothing exists yet" from "your filter
 * matched nothing".
 *
 * The grid said "No data found" for both, which left a first-time user with no
 * orientation and — worse — gave no hint that a filter was the reason a
 * populated list had gone blank. The filter row stays on screen either way, so
 * the fix for the second case is one click away; the words just have to point
 * at it.
 */
describe('DataGridComponent — empty state', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<DataGridComponent>>;
    let component: DataGridComponent;

    const FILTER = { column: 'name', op: 'cn', value: 'zzz' } as ActiveFilter;

    function configure(emptyLabel?: string): void {
        component.config.set({
            id: 'contact:contacts',
            label: '',
            emptyLabel,
            columns: [{ field: 'name', label: 'Name', type: 'text', filterable: true, filterOp: 'cn' }],
            draggable: false,
            perPage: 50,
            rowActions: [],
        } as unknown as DataGridConfig);
    }

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [
                HttpClientTestingModule,
                DataGridComponent,
                NgxsModule.forRoot([AppConfigState]),
            ],
        });
        fixture   = TestBed.createComponent(DataGridComponent);
        component = fixture.componentInstance;
    });

    it('names the collection when the grid is empty and unfiltered', () => {
        configure('contacts');

        expect(component.emptyStateTitle()).toBe('No contacts yet');
        expect(component.emptyStateHint()).toBe('');
        expect(component.emptyStateIcon()).toBe('inbox');
    });

    it('falls back to generic wording when the grid declares no emptyLabel', () => {
        // Most grids ship without one; the message must still read sensibly
        // rather than rendering "No undefined yet".
        configure(undefined);

        expect(component.emptyStateTitle()).toBe('Nothing here yet');
    });

    it('points at the filter when one is what emptied the grid', () => {
        configure('contacts');
        component['filtersS'].set([FILTER]);

        expect(component.emptyStateTitle()).toBe('No matches');
        expect(component.emptyStateHint()).toContain('filters');
        expect(component.emptyStateIcon()).toBe('funnel');
    });

    it('prefers the filtered wording over the collection name', () => {
        // The bug in miniature: with a filter active, "No contacts yet" would
        // tell the operator their data is gone when it is merely hidden.
        configure('contacts');
        component['filtersS'].set([FILTER]);

        expect(component.emptyStateTitle()).not.toBe('No contacts yet');
    });

    it('returns to the unfiltered wording once the filter is cleared', () => {
        configure('contacts');
        component['filtersS'].set([FILTER]);
        component['filtersS'].set([]);

        expect(component.emptyStateTitle()).toBe('No contacts yet');
        expect(component.emptyStateIcon()).toBe('inbox');
    });

    /**
     * A `loadingMode: lazy` grid does not fetch — it emits `(loadMore)` and waits
     * for the parent to feed `externalData` back. Its own `loading()` signal is
     * false for that whole window, so with no rows yet the body fell through to
     * the empty state: every lazy page asserted "No <things> yet" for a beat
     * before its first page landed. Harmless while the wording was a neutral
     * "No data found"; a statement of fact once the message names the collection.
     */
    describe('while a parent-owned page is in flight', () => {
        it('suppresses the empty state and shows the skeleton instead', () => {
            configure('contacts');
            component['loadingMore'].set(true);

            expect(component.awaitingRows()).toBe(true);
            expect(component.showSkeleton()).toBe(true);
        });

        it('releases once the rows arrive', () => {
            configure('contacts');
            component['loadingMore'].set(true);
            component['loadingMore'].set(false);

            expect(component.awaitingRows()).toBe(false);
            // A genuinely empty result must still reach its empty state — the
            // suppression is a "not yet", never a "never".
            expect(component.showSkeleton()).toBe(false);
            expect(component.emptyStateTitle()).toBe('No contacts yet');
        });
    });
});
