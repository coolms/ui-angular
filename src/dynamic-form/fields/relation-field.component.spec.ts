import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { DataSourceOption, FieldItem } from '@coolms/core-angular';
import { RelationFieldComponent } from './relation-field.component';
import { provideFieldWidget } from '../../ui/field-widgets/field-widget-registry';

/**
 * F5.d follow-up — relation field cardinality semantics, RUN.
 *
 * History: every cardinality:one + widget:select form (Navi tree
 * siteSectionId, Calendar Settings parent calendar, Holiday Rule baseRule,
 * F5.d translation domain/locale, …) had a UX bug where picking an option
 * silently set the FormControl but visually reset the <select> back to its
 * placeholder. Operators reported "the dropdown doesn't work" because the
 * field appeared empty even though the underlying control held the value.
 * Root cause: `onSelectChange` ran `select.value = ''` unconditionally. That
 * reset is right for cardinality:many — picked options become tags above the
 * select, so the picker clears to allow another pick — and wrong for
 * cardinality:one, where the picker IS the value display. The fix conditions
 * the reset on `isMany()` and binds `<select [value]>` to `singleValue()` so
 * edit-mode loads render the stored option pre-selected.
 *
 * This file used to assert all of that against a LOCAL COPY of the handler,
 * carrying a comment asking future editors to keep the copy in sync by hand.
 * It could not do otherwise: `RelationFieldComponent` is reachable from
 * `DynamicFormComponent`, whose rich-text field pulls `@coolms/editor-angular`
 * -> `@coolms/document-engine`, and the old webpack karma builder could not
 * follow that package's ESM `'./x.js'` specifiers to its `.ts` sources, so a
 * spec that imported the component killed the WHOLE suite at build time. The
 * copy therefore proved exactly nothing about the shipped code: delete the
 * `isMany()` condition from the real handler and the old file stayed green.
 *
 * moved the `test` target to `@angular/build:karma` (esbuild, sharing
 * the `build` target's resolution), so the component itself can be mounted.
 * Every assertion below drives the real `onSelectChange` through a real
 * `<select>` `change` event over a real `FormControl`.
 */
describe('RelationFieldComponent — select cardinality semantics (F5.d)', () => {
    const ALPHA = '/api/v1/tags/alpha';
    const BETA  = '/api/v1/tags/beta';
    const GAMMA = '/api/v1/tags/gamma';

    /** Three options: at most six, so the field renders no search box above the select. */
    const OPTIONS: readonly DataSourceOption[] = [
        { value: ALPHA, label: 'Alpha' },
        { value: BETA,  label: 'Beta'  },
        { value: GAMMA, label: 'Gamma' },
    ];

    /**
     * A `static` data source, so `ngOnInit` seeds the options synchronously and
     * the first change-detection pass already renders them. `type: 'api'` would
     * put an HTTP round trip between mount and first paint, which is a
     * different field's contract; here it would only add noise.
     */
    function field(cardinality: 'one' | 'many'): FieldItem {
        return {
            alias:      'tags',
            type:       'relation',
            label:      'Tags',
            required:   false,
            readonly:   false,
            locked:     false,
            private:    false,
            validators: [],
            relation:   {
                cardinality,
                dataSource: {
                    type:      'static',
                    bindValue: 'value',
                    bindLabel: 'label',
                    multiple:  cardinality === 'many',
                    options:   OPTIONS,
                    widget:    'select',
                    loading:   'eager',
                },
            },
        };
    }

    const TAGS_URL = '/api/v1/tags';

    /**
     * The same field over an eager `api` data source: options land a round trip
     * AFTER the first change-detection pass, which is how nearly every relation
     * in the admin actually loads.
     */
    function apiField(): FieldItem {
        const base = field('one');
        return {
            ...base,
            relation: {
                cardinality: 'one',
                dataSource: {
                    type:      'api',
                    url:       TAGS_URL,
                    bindValue: 'id',
                    bindLabel: 'name',
                    multiple:  false,
                    widget:    'select',
                    loading:   'eager',
                },
            },
        };
    }

    let fixture: ComponentFixture<RelationFieldComponent>;
    let control: FormControl<unknown>;
    let select:  HTMLSelectElement;
    let http:    HttpTestingController;

    /** Render the real field over a real control, and grab the <select> it painted. */
    function mount(cardinality: 'one' | 'many', initial: unknown = null): void {
        control = new FormControl<unknown>(initial);

        fixture = TestBed.createComponent(RelationFieldComponent);
        fixture.componentRef.setInput('item', field(cardinality));
        fixture.componentRef.setInput('formGroup', new FormGroup({ tags: control }));
        fixture.detectChanges();

        select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
        expect(select).withContext('the default widget renders a native <select>').not.toBeNull();
    }

    /**
     * What the operator does: choose an option and let the DOM fire `change`,
     * which is what invokes the component's own `(change)="onSelectChange($event)"`.
     * The interim expectation pins the setter: `select.value = x` is a no-op that
     * leaves `''` behind when no option carries `x`, and a pick that never
     * happened would sail through every assertion downstream.
     */
    function pick(value: string): void {
        select.value = value;
        expect(select.value).withContext(`the <select> offers an option for "${value}"`).toBe(value);
        select.dispatchEvent(new Event('change'));
    }

    /** The option the browser currently shows, by its visible label. */
    function displayedLabel(): string {
        return select.selectedOptions[0]?.textContent?.trim() ?? '';
    }

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports:   [RelationFieldComponent],
            providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
        });

        http = TestBed.inject(HttpTestingController);
    });

    // A `static` data source must resolve locally; a stray fetch here would mean
    // the field is round-tripping options the backend already inlined.
    afterEach(() => http.verify());

    // -- cardinality: one — the picker IS the display -------------------------

    it('writes the picked value into the FormControl and dirties it', () => {
        mount('one');
        expect(control.value).toBeNull();
        expect(control.dirty).withContext('untouched on mount').toBeFalse();

        pick(ALPHA);

        expect(control.value).toBe(ALPHA);
        // The dirty flag is what enables Save on every form that hosts this field.
        expect(control.dirty).toBeTrue();
    });

    it('does NOT reset the select after a pick — the original F5.d bug', () => {
        mount('one');

        pick(ALPHA);

        // Read BEFORE change detection, ON PURPOSE. `[value]="singleValue()"`
        // re-writes the element on the next pass with the value the handler
        // just stored, so a handler that cleared `select.value` here would be
        // papered over by the very next `detectChanges()` and this guard —
        // the whole reason the file exists — would go blind.
        expect(select.value).withContext('immediately after the handler ran').toBe(ALPHA);
        expect(displayedLabel()).toBe('Alpha');

        // …and it survives the pass, i.e. the binding agrees with the handler
        // rather than fighting it.
        fixture.detectChanges();
        expect(select.value).toBe(ALPHA);
        expect(displayedLabel()).toBe('Alpha');
    });

    it('replaces the stored value when the operator re-picks', () => {
        mount('one', ALPHA);

        pick(BETA);

        // cardinality:one appends nothing — a second pick is a correction.
        expect(control.value).toBe(BETA);
        expect(select.value).toBe(BETA);
    });

    it('ignores the placeholder row', () => {
        mount('one', ALPHA);

        pick('');

        // Writing '' would blank a stored relation and make a `required`
        // validator fail on a field the operator never meant to clear.
        expect(control.value).toBe(ALPHA);
        expect(control.dirty).toBeFalse();
    });

    it('renders the stored value as the selected option on an edit-mode load', () => {
        // The other half of the fix: `singleValue()` drives which option renders
        // selected, so a form opened on an existing record shows what it holds
        // instead of "— Select —" over a populated control.
        mount('one', BETA);

        expect(select.value).toBe(BETA);
        expect(displayedLabel()).toBe('Beta');
        expect(select.selectedIndex).withContext('placeholder, Alpha, Beta').toBe(2);
    });

    it('renders the stored value when api options arrive after the first pass', () => {
        // The production shape of the test above, and the one that says WHY the
        // selection is bound per option: with `<select [value]="singleValue()">`
        // the write is evaluated before the `@for` has created any option, so it
        // resolves to '' — and since the binding recorded the value it meant to
        // write, it is never re-applied once the options land. Most relation
        // fields are api-backed, so under that binding every one of them opened
        // on the placeholder no matter what the record held.
        control = new FormControl<unknown>(BETA);

        fixture = TestBed.createComponent(RelationFieldComponent);
        fixture.componentRef.setInput('item', apiField());
        fixture.componentRef.setInput('formGroup', new FormGroup({ tags: control }));
        fixture.detectChanges();

        // Nothing to select yet — the field is on its loading branch.
        expect(fixture.nativeElement.querySelector('select')).toBeNull();

        http.expectOne(TAGS_URL).flush({
            member: [
                { id: ALPHA, name: 'Alpha' },
                { id: BETA,  name: 'Beta'  },
                { id: GAMMA, name: 'Gamma' },
            ],
        });
        fixture.detectChanges();

        select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
        expect(select).not.toBeNull();
        expect(select.value).toBe(BETA);
        expect(displayedLabel()).toBe('Beta');
    });

    it('follows a programmatic patchValue', () => {
        mount('one');
        expect(select.value).withContext('empty control shows the placeholder').toBe('');

        control.setValue(GAMMA);
        fixture.detectChanges();

        // `ngOnInit` bridges `valueChanges` into the `controlValue` signal;
        // without that bridge `singleValue()` never recomputes and a parent
        // form patching this field leaves the select showing the placeholder.
        expect(select.value).toBe(GAMMA);
        expect(displayedLabel()).toBe('Gamma');
    });

    // -- cardinality: many — the picker is a queue, tags are the display ------

    it('appends the first pick and DOES reset the select', () => {
        mount('many');

        pick(ALPHA);

        expect(control.value).toEqual([ALPHA]);
        // Companion guard to the one above, and the reason the reset is
        // conditional rather than deleted: here the picked value moves into a
        // tag, so a select still displaying it could not be used to add a
        // second value.
        expect(select.value).withContext('immediately after the handler ran').toBe('');

        fixture.detectChanges();
        expect(select.value).toBe('');
        expect(fixture.nativeElement.querySelector('.relation-tag')?.textContent).toContain('Alpha');
    });

    it('appends to an existing array on a later pick', () => {
        mount('many', [ALPHA]);

        pick(BETA);

        expect(control.value).toEqual([ALPHA, BETA]);
        expect(control.dirty).toBeTrue();

        fixture.detectChanges();
        const tags = Array.from(
            fixture.nativeElement.querySelectorAll('.relation-tag') as NodeListOf<HTMLElement>,
        ).map(t => t.textContent?.trim().replace(/\s*✕$/, ''));
        expect(tags).toEqual(['Alpha', 'Beta']);
    });

    it('does not duplicate an already-picked value', () => {
        mount('many', [ALPHA]);

        // In the UI an already-picked option is rendered `[disabled]`, so this
        // is the second lock: a value that reaches the handler twice — because
        // the option list was refetched, or because that disabled binding is
        // ever loosened — must not land in the array twice.
        pick(ALPHA);

        expect(control.value).toEqual([ALPHA]);
        expect(control.dirty).withContext('a no-op pick is not an edit').toBeFalse();
    });
});


/**
 * The media branch used to import `MediaPickerComponent` straight from the
 * Media feature, which is what pinned the whole generic dynamic-form kit to a
 * feature module. It now resolves through the field-widget registry -- the
 * seam this app already uses for `tags`, `taxonomy` and `image`.
 *
 * What matters architecturally is that the field names a KIND and nothing
 * else, so these tests register a stub under that kind. If someone re-imports
 * the real picker to "simplify", the config assertion below still passes but
 * the first one stops proving anything -- so it asserts the stub specifically.
 */
describe('RelationFieldComponent -- the media picker resolves through the registry', () => {
    @Component({
        selector: 'app-stub-media-widget',
        standalone: true,
        template: '<span class="stub-media"></span>',
    })
    class StubMediaWidget {
        static last: StubMediaWidget | null = null;

        readonly value = input<unknown>();
        readonly config = input<Record<string, unknown>>({});
        readonly disabled = input(false);
        readonly valueChange = input<(value: unknown) => void>(() => { /* replaced by the host */ });

        constructor() {
            StubMediaWidget.last = this;
        }
    }

    /** A relation whose data source asks for the media picker, with a backend blob. */
    function mediaField(cardinality: 'one' | 'many'): FieldItem {
        return {
            alias:      'cover',
            type:       'relation',
            label:      'Cover',
            required:   false,
            readonly:   false,
            locked:     false,
            private:    false,
            validators: [],
            relation:   {
                cardinality,
                dataSource: {
                    type:      'static',
                    bindValue: 'value',
                    bindLabel: 'label',
                    multiple:  cardinality === 'many',
                    options:   [],
                    widget:    'media-picker',
                    loading:   'eager',
                    widgetOptions: { bindTarget: 'either', accept: 'image/*' },
                },
            },
        };
    }

    let mediaFixture: ComponentFixture<RelationFieldComponent>;
    let mediaControl: FormControl<unknown>;

    function mountMedia(cardinality: 'one' | 'many' = 'one', initial: unknown = null): void {
        mediaControl = new FormControl<unknown>(initial);
        mediaFixture = TestBed.createComponent(RelationFieldComponent);
        mediaFixture.componentRef.setInput('item', mediaField(cardinality));
        mediaFixture.componentRef.setInput('formGroup', new FormGroup({ cover: mediaControl }));
        mediaFixture.detectChanges();
    }

    beforeEach(() => StubMediaWidget.last = null);

    describe('with the module installed', () => {
        beforeEach(() => {
            TestBed.configureTestingModule({
                imports:   [RelationFieldComponent],
                providers: [
                    provideHttpClient(withXhr()),
                    provideHttpClientTesting(),
                    provideFieldWidget('media-picker', StubMediaWidget),
                ],
            });
        });

        afterEach(() => TestBed.inject(HttpTestingController).verify());

        it('renders whatever is registered for the kind, not a component it imported', () => {
            mountMedia();

            expect(mediaFixture.nativeElement.querySelector('.stub-media'))
                .withContext('the registered widget painted')
                .not.toBeNull();
        });

        it('hands the backend blob through untouched, plus the cardinality only it knows', () => {
            mountMedia('many');

            expect(StubMediaWidget.last!.config()).toEqual({
                bindTarget:  'either',
                accept:      'image/*',
                cardinality: 'many',
            });
        });

        it('passes the raw control value, leaving interpretation to the widget', () => {
            mountMedia('one', 'uuid-7');

            expect(StubMediaWidget.last!.value()).toBe('uuid-7');
        });

        it('stores what the widget calls back with, and marks the control edited', () => {
            mountMedia();
            expect(mediaControl.dirty).toBeFalse();

            StubMediaWidget.last!.valueChange()('{"kind":"asset","value":"uuid-9"}');

            expect(mediaControl.value).toBe('{"kind":"asset","value":"uuid-9"}');
            expect(mediaControl.dirty).withContext('a pick is an edit').toBeTrue();
            expect(mediaControl.touched).toBeTrue();
        });
    });

    describe('without the module installed', () => {
        beforeEach(() => {
            TestBed.configureTestingModule({
                imports:   [RelationFieldComponent],
                providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
            });
        });

        afterEach(() => TestBed.inject(HttpTestingController).verify());

        // The kit has to survive being packaged without this app's feature set.
        it('renders nothing rather than failing when no widget is registered', () => {
            expect(() => mountMedia()).not.toThrow();
            expect(mediaFixture.nativeElement.querySelector('.stub-media')).toBeNull();
        });
    });
});
