import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { LayoutActionsService } from './layout-actions.service';
import { LayoutHeaderAction, ErrorHandlerService } from '@coolms/core-angular';
/**
 * Pins the layout-config half of the action vocabulary.
 *
 * The words are the same ones a NaviGraph toolbar node uses and they run
 * through the same evaluator, so the specs worth writing are the ones about
 * the SEAM: that a condition beats the static flag, that `requires` still
 * gates, and that the cockpit steering policy this replaced still resolves to
 * the same buttons per state -- that last one being a behaviour that used to
 * live in a six-case switch in a component.
 */
describe('LayoutActionsService', () => {
    let svc: LayoutActionsService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                // The evaluator is pure; nothing here touches the network.
                { provide: HttpClient, useValue: {} },
                { provide: Router, useValue: {} },
                { provide: Store, useValue: {} },
                { provide: ErrorHandlerService, useValue: {} },
            ],
        });
        svc = TestBed.inject(LayoutActionsService);
    });

    it('maps the static descriptor fields and defaults a missing icon', () => {
        const [action] = svc.resolve([{ id: 'back', label: 'Schedules', title: 'Back', primary: true }]);

        expect(action).toEqual({ id: 'back', icon: '', label: 'Schedules', title: 'Back', primary: true });
    });

    it('returns an empty list for a layout that declares no actions', () => {
        // A layout fetch that failed leaves the page with undefined chrome; it
        // must degrade to no actions rather than throwing.
        expect(svc.resolve(undefined)).toEqual([]);
        expect(svc.resolve([])).toEqual([]);
    });

    it('drops an action whose showWhen fails and keeps one with no condition', () => {
        const actions: LayoutHeaderAction[] = [
            { id: 'always' },
            { id: 'gated', showWhen: { field: '_state', op: 'eq', value: 'running' } },
        ];

        expect(svc.resolve(actions, { _state: 'completed' }).map(a => a.id)).toEqual(['always']);
        expect(svc.resolve(actions, { _state: 'running' }).map(a => a.id)).toEqual(['always', 'gated']);
    });

    it('disables rather than drops while busy, and swaps busyLabel in', () => {
        const actions: LayoutHeaderAction[] = [{
            id:        'trigger',
            label:     'Trigger Now',
            busyWhen:  { field: '_triggering', op: 'eq', value: true },
            busyLabel: 'Dispatching...',
        }];

        const busy = svc.resolve(actions, { _triggering: true })[0];
        expect(busy.disabled).toBe(true);
        expect(busy.label).toBe('Dispatching...');

        const idle = svc.resolve(actions, { _triggering: false })[0];
        expect(idle.disabled).toBe(false);
        expect(idle.label).toBe('Trigger Now');
    });

    it('keeps unavailable and busy apart, so the label speaks only for busy', () => {
        // A save refused because the draft is invalid must not claim to be
        // saving; that is why these are two conditions and not one `or`.
        const actions: LayoutHeaderAction[] = [{
            id:           'save',
            label:        'Save',
            disabledWhen: { field: '_canSave', op: 'eq', value: false },
            busyWhen:     { field: '_saving', op: 'eq', value: true },
            busyLabel:    'Saving...',
        }];

        const invalid = svc.resolve(actions, { _canSave: false, _saving: false })[0];
        expect(invalid.disabled).toBe(true);
        expect(invalid.label).toBe('Save');

        const saving = svc.resolve(actions, { _canSave: true, _saving: true })[0];
        expect(saving.disabled).toBe(true);
        expect(saving.label).toBe('Saving...');

        expect(svc.resolve(actions, { _canSave: true, _saving: false })[0].disabled).toBe(false);
    });

    it('lets a condition override the static disabled flag', () => {
        // Otherwise a config could only ever disable, never re-enable.
        const actions: LayoutHeaderAction[] = [{
            id:           'save',
            disabled:     true,
            disabledWhen: { field: '_saving', op: 'eq', value: true },
        }];

        expect(svc.resolve(actions, { _saving: false })[0].disabled).toBe(false);
    });

    it('keeps the static disabled flag when no condition is declared', () => {
        expect(svc.resolve([{ id: 'save', disabled: true }])[0].disabled).toBe(true);
        expect(svc.resolve([{ id: 'save' }])[0].disabled).toBeUndefined();
    });

    it('gates on requires only when the caller supplies a predicate', () => {
        const actions: LayoutHeaderAction[] = [{ id: 'delete-site', requires: 'delete' }];

        // No predicate: a page that does not implement gating must not have its
        // action silently removed by a token it never agreed to interpret.
        expect(svc.resolve(actions).map(a => a.id)).toEqual(['delete-site']);
        expect(svc.resolve(actions, {}, r => r === 'administer').map(a => a.id)).toEqual([]);
        expect(svc.resolve(actions, {}, r => r === 'delete').map(a => a.id)).toEqual(['delete-site']);
    });

    it('resolves activeWhen for pressed styling', () => {
        const actions: LayoutHeaderAction[] = [{ id: 'tiles', activeWhen: { field: '_view', op: 'eq', value: 'tiles' } }];

        expect(svc.resolve(actions, { _view: 'tiles' })[0].active).toBe(true);
        expect(svc.resolve(actions, { _view: 'grid' })[0].active).toBe(false);
        expect(svc.resolve([{ id: 'tiles' }])[0].active).toBeUndefined();
    });

    describe('cockpit steering policy, now declared instead of switched on', () => {
        // The six gates the component used to decode from `requires: state:*`.
        const STEERING: LayoutHeaderAction[] = [
            { id: 'suspend',      showWhen: { field: '_state', op: 'eq', value: 'running' } },
            { id: 'resume',       showWhen: { field: '_state', op: 'eq', value: 'suspended' } },
            {
                id: 'migrate',
                showWhen: {
                    and: [
                        { field: '_state', op: 'eq', value: 'suspended' },
                        { field: '_hasOtherVersions', op: 'eq', value: true },
                    ],
                },
            },
            { id: 'set-variable', showWhen: { field: '_state', op: 'in', value: ['running', 'suspended'] } },
            { id: 'cancel',       showWhen: { field: '_state', op: 'in', value: ['running', 'suspended'] } },
            { id: 'retry',        showWhen: { field: '_state', op: 'eq', value: 'failed' } },
        ];

        function ids(state: string, hasOtherVersions = false): string[] {
            return svc.resolve(STEERING, { _state: state, _hasOtherVersions: hasOtherVersions }).map(a => a.id);
        }

        it('offers suspend, set-variable and cancel while running', () => {
            expect(ids('running')).toEqual(['suspend', 'set-variable', 'cancel']);
        });

        it('offers migrate only when another deployed version exists', () => {
            expect(ids('suspended', false)).toEqual(['resume', 'set-variable', 'cancel']);
            expect(ids('suspended', true)).toEqual(['resume', 'migrate', 'set-variable', 'cancel']);
        });

        it('offers retry alone on a failed instance', () => {
            expect(ids('failed')).toEqual(['retry']);
        });

        it('offers nothing on a terminal instance, so no footer renders', () => {
            expect(ids('completed')).toEqual([]);
            expect(ids('cancelled')).toEqual([]);
        });

        it('offers nothing before the instance has loaded', () => {
            // The page publishes an empty state until the fetch resolves; a
            // steering button that appears for an instance nobody has read yet
            // would be pressable against nothing.
            expect(ids('')).toEqual([]);
        });
    });
});
