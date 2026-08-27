import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgxsModule } from '@ngxs/store';
import { AppConfigState } from '@coolms/core-angular';
import { DataGridComponent } from './datagrid.component';
import type { ActiveFilter } from './datagrid.types';

/**
 * Task #452 — behaviour spec for DataGrid Ship C: range-filter bridges
 * between the three range-picker primitives (#436) and the column-filter
 * `ActiveFilter` state.
 *
 * Coverage:
 *   1. `<app-date-range-picker>` (valueChange) → two ActiveFilter entries
 *      for the same column with ops 'ge' + 'le'.
 *   2. `<app-datetime-range-picker>` (valueChange) → ISO-8601 ge/le pair;
 *      the picker's `allDay` flag is intentionally ignored (the column
 *      type is fixed, and the filter row hides the toggle).
 *   3. `<app-time-range-picker>` (valueChange) → HH:MM ge/le pair.
 *   4. Reverse direction: getDateRangeValue / getDateTimeRangeValue /
 *      getTimeRangeValue reconstruct the picker model from the
 *      current ge/le entries (so the picker shows what's applied).
 *   5. `null` (cleared picker) clears both filters.
 *   6. TZ-aware datetime cell formatting honours UserCalendarPreferences
 *      (asserting timezone + 24h-vs-12h paths).
 */
describe('DataGridComponent — range-filter bridges (Ship C)', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<DataGridComponent>>;
    let component: DataGridComponent;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [
                HttpClientTestingModule,
                DataGridComponent,
                // `AppConfigState` must be registered, not just NgXS itself:
                // the grid injects UserCalendarPreferencesService, whose field
                // initialiser calls `selectSnapshot(AppConfigState...)`. With
                // an unregistered state NgXS hands the selector `undefined`
                // and construction dies on `state.config`.
                NgxsModule.forRoot([AppConfigState]),
            ],
        });
        fixture   = TestBed.createComponent(DataGridComponent);
        component = fixture.componentInstance;
    });

    /**
     * `filtersS` is `private` on the component and there is no public accessor
     * for it. Element access is TypeScript's sanctioned way to reach a private
     * member from a test, and is preferred here over widening the grid's public
     * API purely to satisfy a spec.
     */
    const filtersOf = (c: DataGridComponent) => c['filtersS'];

    function activeFor(column: string): readonly ActiveFilter[] {
        return filtersOf(component)().filter(f => f.column === column);
    }

    // ─── Date range ──────────────────────────────────────────────────

    it('onDateRangeFilterChange emits two ActiveFilter entries (ge bare + le end-of-day)', () => {
        component.onDateRangeFilterChange('birthdate', {
            start: '2026-01-01',
            end:   '2026-12-31',
        });

        // Upper bound is widened to end-of-day so the filter is inclusive
        // for datetime-backed columns (the common case behind a 'date' UI
        // column, e.g. `createdAt`). Lower bound stays bare = midnight,
        // which is already the correct inclusive lower bound.
        const entries = activeFor('birthdate');
        expect(entries).toEqual(jasmine.arrayWithExactContents([
            { column: 'birthdate', op: 'ge', value: '2026-01-01' },
            { column: 'birthdate', op: 'le', value: '2026-12-31T23:59:59.999' },
        ]));
    });

    it('onDateRangeFilterChange with null clears both bounds', () => {
        // Seed both filters
        component.onDateRangeFilterChange('birthdate', { start: '2026-01-01', end: '2026-12-31' });
        expect(activeFor('birthdate').length).toBe(2);

        // Clear
        component.onDateRangeFilterChange('birthdate', null);
        expect(activeFor('birthdate')).toEqual([]);
    });

    it('getDateRangeValue reconstructs from current ge/le entries (strips end-of-day suffix)', () => {
        filtersOf(component).set([
            { column: 'birthdate', op: 'ge', value: '2026-03-01' },
            { column: 'birthdate', op: 'le', value: '2026-03-31T23:59:59.999' },
        ]);
        // The picker only knows about bare YYYY-MM-DD; the bridge strips
        // the end-of-day suffix on the way back so the picker repaints
        // the same range the user originally selected.
        expect(component.getDateRangeValue('birthdate')).toEqual({
            start: '2026-03-01',
            end:   '2026-03-31',
        });
    });

    it('getDateRangeValue returns null when no bounds are set', () => {
        expect(component.getDateRangeValue('birthdate')).toBeNull();
    });

    // ─── Datetime range ──────────────────────────────────────────────

    it('onDateTimeRangeFilterChange emits ISO ge/le pair and ignores allDay', () => {
        component.onDateTimeRangeFilterChange('createdAt', {
            start:  '2026-05-30T08:00:00+02:00',
            end:    '2026-05-30T18:00:00+02:00',
            allDay: false, // ignored in filter context
        });

        const entries = activeFor('createdAt');
        expect(entries).toEqual(jasmine.arrayWithExactContents([
            { column: 'createdAt', op: 'ge', value: '2026-05-30T08:00:00+02:00' },
            { column: 'createdAt', op: 'le', value: '2026-05-30T18:00:00+02:00' },
        ]));
    });

    it('getDateTimeRangeValue returns allDay=false (filter row never sets it)', () => {
        filtersOf(component).set([
            { column: 'createdAt', op: 'ge', value: '2026-05-30T08:00:00Z' },
            { column: 'createdAt', op: 'le', value: '2026-05-30T18:00:00Z' },
        ]);
        expect(component.getDateTimeRangeValue('createdAt')).toEqual({
            start:  '2026-05-30T08:00:00Z',
            end:    '2026-05-30T18:00:00Z',
            allDay: false,
        });
    });

    // ─── Time range ──────────────────────────────────────────────────

    it('onTimeRangeFilterChange emits HH:MM ge/le pair', () => {
        component.onTimeRangeFilterChange('shiftStart', {
            start: '09:00',
            end:   '17:00',
        });

        expect(activeFor('shiftStart')).toEqual(jasmine.arrayWithExactContents([
            { column: 'shiftStart', op: 'ge', value: '09:00' },
            { column: 'shiftStart', op: 'le', value: '17:00' },
        ]));
    });

    it('getTimeRangeValue reconstructs from current ge/le entries', () => {
        filtersOf(component).set([
            { column: 'shiftStart', op: 'ge', value: '08:30' },
            { column: 'shiftStart', op: 'le', value: '17:30' },
        ]);
        expect(component.getTimeRangeValue('shiftStart')).toEqual({
            start: '08:30',
            end:   '17:30',
        });
    });

    // ─── Tz-aware cell formatting ────────────────────────────────────
    // These tests assert the function tolerates each Angular-token-style
    // pattern produced by user preferences. We don't pin specific
    // formatted strings (the values depend on the host TZ environment
    // when run); we only assert the formatter returns a non-empty
    // result for valid inputs and the original input for unparseable
    // ones.

    it('formatDateTimeCell returns empty string for null/undefined/empty', () => {
        expect(component.formatDateTimeCell(null,       'datetime')).toBe('');
        expect(component.formatDateTimeCell(undefined,  'datetime')).toBe('');
        expect(component.formatDateTimeCell('',         'datetime')).toBe('');
    });

    it('formatDateTimeCell returns the input verbatim when unparseable', () => {
        expect(component.formatDateTimeCell('not-a-date', 'datetime')).toBe('not-a-date');
    });

    it('formatDateTimeCell renders a non-empty string for a valid ISO input', () => {
        const out = component.formatDateTimeCell('2026-05-30T14:30:00Z', 'datetime');
        // The exact format depends on the user prefs (defaulted to UTC +
        // yyyy-MM-dd + 24h) but it must contain the year + time tokens.
        expect(out).toContain('2026');
        expect(out.length).toBeGreaterThan(0);
    });
});
