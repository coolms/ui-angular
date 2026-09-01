import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { of } from 'rxjs';
import { PageToolbarComponent, ToolbarAction } from './page-toolbar.component';
import { NaviGraphService, NaviGraphNode, ErrorHandlerService } from '@coolms/core-angular';
/**
 * Pins how a NaviGraph node becomes a ToolbarAction -- specifically the
 * conditions that decide an action's STATE rather than its existence.
 *
 * showWhen (does it exist at all) is covered by the evaluator specs in
 * navi-graph.service.spec.ts; these cover what the toolbar builds on top:
 * activeWhen, disabledWhen, busyWhen and the busyLabel swap. The evaluator runs
 * throughout -- a page that can say when an action applies must not need a
 * second grammar to say when it is busy, and stubbing it here would hide the
 * day the two diverge.
 */
function node(path: string, meta: Record<string, unknown>): NaviGraphNode {
    return {
        id:        path,
        path,
        title:     'Title for ' + path,
        parentId:  null,
        sortOrder: 0,
        isActive:  true,
        isVisible: true,
        meta:      { position: 'header', ...meta },
        children:  [],
    } as NaviGraphNode;
}

describe('PageToolbarComponent state conditions', () => {
    /**
     * Renders the given nodes through the component and returns the actions it
     * emitted to the page header.
     */
    function headerActionsFor(nodes: NaviGraphNode[], context: Record<string, unknown>): ToolbarAction[] {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            imports: [PageToolbarComponent],
            providers: [
                { provide: HttpClient, useValue: {} },
                { provide: Router, useValue: {} },
                { provide: ErrorHandlerService, useValue: {} },
                {
                    provide: Store,
                    useValue: { selectSnapshot: () => ({ navi: { graphBySlug: '/api/v1/navi/graph/{slug}' } }) },
                },
            ],
        });
        // The tree loads through the real service, so the component's manifest
        // lookup and subscription are exercised; only the HTTP hop is replaced.
        spyOn(TestBed.inject(NaviGraphService), 'loadTree').and.returnValue(of(nodes));

        const fixture = TestBed.createComponent(PageToolbarComponent);
        let emitted: ToolbarAction[] = [];
        fixture.componentInstance.headerActionsChanged.subscribe(a => emitted = a);
        fixture.componentRef.setInput('treeSlug', 'navi.toolbar.test');
        fixture.componentRef.setInput('context', context);
        fixture.detectChanges();

        return emitted;
    }

    it('leaves disabled undefined when the node declares no condition', () => {
        const [action] = headerActionsFor([node('/plain', { action: 'plain', label: 'Plain' })], {});

        // Not false: the action keeps ToolbarAction's own default, so a
        // consumer setting disabled itself is not overridden by a node that
        // never spoke about it.
        expect(action.disabled).toBeUndefined();
        expect(action.label).toBe('Plain');
    });

    it('disables an action while its disabledWhen holds, and re-enables it after', () => {
        const nodes = [node('/import', {
            action:       'import',
            label:        'Import',
            disabledWhen: { field: '_importing', op: 'eq', value: true },
        })];

        expect(headerActionsFor(nodes, { _importing: true })[0].disabled).toBe(true);
        expect(headerActionsFor(nodes, { _importing: false })[0].disabled).toBe(false);
    });

    it('swaps in busyLabel only while busy, and disables with it', () => {
        const nodes = [node('/import', {
            action:    'import',
            label:     'Import',
            busyWhen:  { field: '_importing', op: 'eq', value: true },
            busyLabel: 'Importing...',
        })];

        const busy = headerActionsFor(nodes, { _importing: true })[0];
        expect(busy.label).toBe('Importing...');
        expect(busy.disabled).toBe(true);
        expect(headerActionsFor(nodes, { _importing: false })[0].label).toBe('Import');
    });

    it('keeps unavailable and busy apart, so the label speaks only for busy', () => {
        // The bug this split exists for: one condition carrying both reasons
        // had a form that cannot be saved YET announcing "Saving...".
        const nodes = [node('/save', {
            action:       'save',
            label:        'Save',
            disabledWhen: { field: '_canSave', op: 'eq', value: false },
            busyWhen:     { field: '_saving', op: 'eq', value: true },
            busyLabel:    'Saving...',
        })];

        const invalid = headerActionsFor(nodes, { _canSave: false, _saving: false })[0];
        expect(invalid.disabled).toBe(true);
        expect(invalid.label).toBe('Save');

        const saving = headerActionsFor(nodes, { _canSave: true, _saving: true })[0];
        expect(saving.disabled).toBe(true);
        expect(saving.label).toBe('Saving...');

        const ready = headerActionsFor(nodes, { _canSave: true, _saving: false })[0];
        expect(ready.disabled).toBe(false);
        expect(ready.label).toBe('Save');
    });

    it('keeps a disabled action visible, since disabledWhen is not showWhen', () => {
        // The distinction the two conditions exist for: an action in flight
        // stays where the pointer left it instead of the header reflowing.
        const actions = headerActionsFor(
            [node('/import', {
                action:       'import',
                label:        'Import',
                showWhen:     { field: '_hasMailbox', op: 'eq', value: true },
                disabledWhen: { field: '_importing', op: 'eq', value: true },
            })],
            { _hasMailbox: true, _importing: true },
        );

        expect(actions.length).toBe(1);
        expect(actions[0].disabled).toBe(true);
    });

    it('drops the action entirely when showWhen fails, whatever disabledWhen says', () => {
        const actions = headerActionsFor(
            [node('/import', {
                action:       'import',
                showWhen:     { field: '_hasMailbox', op: 'eq', value: true },
                disabledWhen: { field: '_importing', op: 'eq', value: true },
            })],
            { _hasMailbox: false, _importing: false },
        );

        expect(actions).toEqual([]);
    });

    it('evaluates disabledWhen through the shared and/or grammar', () => {
        const nodes = [node('/save', {
            action:       'save',
            label:        'Save',
            disabledWhen: {
                or: [
                    { field: '_saving', op: 'eq', value: true },
                    { field: '_dirty', op: 'eq', value: false },
                ],
            },
        })];

        expect(headerActionsFor(nodes, { _saving: true,  _dirty: true })[0].disabled).toBe(true);
        expect(headerActionsFor(nodes, { _saving: false, _dirty: false })[0].disabled).toBe(true);
        expect(headerActionsFor(nodes, { _saving: false, _dirty: true })[0].disabled).toBe(false);
    });

    it('still resolves activeWhen, which shares the same evaluation path', () => {
        const nodes = [node('/tiles', {
            action:     'tiles',
            label:      'Tiles',
            activeWhen: { field: '_viewMode', op: 'eq', value: 'large' },
        })];

        expect(headerActionsFor(nodes, { _viewMode: 'large' })[0].active).toBe(true);
        expect(headerActionsFor(nodes, { _viewMode: 'details' })[0].active).toBe(false);
        expect(headerActionsFor([node('/plain', { action: 'plain' })], {})[0].active).toBeUndefined();
    });

    it('treats a missing context field strictly, not as a match', () => {
        // A page that forgets to publish _importing does not get a button stuck
        // disabled: the leaf predicate is false, so the action stays enabled,
        // and the page's own context spec is what catches the omission.
        const actions = headerActionsFor(
            [node('/import', { action: 'import', disabledWhen: { field: '_importing', op: 'eq', value: true } })],
            {},
        );

        expect(actions[0].disabled).toBe(false);
    });
});

/** A bar node -- no `position`, so it lands in the bar rather than the header. */
function barNode(path: string, meta: Record<string, unknown>): NaviGraphNode {
    const built = node(path, meta);
    const { position: _dropped, ...barMeta } = built.meta as Record<string, unknown>;

    return { ...built, meta: barMeta } as NaviGraphNode;
}

/**
 * The bar's own contents, as opposed to the header slot: separator trimming and
 * the label-rendering rule live there.
 */
function barFor(
    nodes: NaviGraphNode[],
    context: Record<string, unknown> = {},
    iconsOnly = false,
): { actions: ToolbarAction[]; labels: string[] } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
        imports: [PageToolbarComponent],
        providers: [
            { provide: HttpClient, useValue: {} },
            { provide: Router, useValue: {} },
            { provide: ErrorHandlerService, useValue: {} },
            {
                provide: Store,
                useValue: { selectSnapshot: () => ({ navi: { graphBySlug: '/api/v1/navi/graph/{slug}' } }) },
            },
        ],
    });
    spyOn(TestBed.inject(NaviGraphService), 'loadTree').and.returnValue(of(nodes));

    const fixture = TestBed.createComponent(PageToolbarComponent);
    fixture.componentRef.setInput('treeSlug', 'navi.toolbar.test');
    fixture.componentRef.setInput('context', context);
    fixture.componentRef.setInput('iconsOnly', iconsOnly);
    fixture.detectChanges();

    const spans: HTMLElement[] = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.toolbar-btn span'),
    );

    return {
        actions: fixture.componentInstance.resolvedLeft(),
        labels: spans.map(el => el.textContent?.trim() ?? ''),
    };
}

describe('PageToolbarComponent bar rendering', () => {
    it('drops a divider left leading, trailing or doubled by its conditions', () => {
        // A separator groups the actions AROUND it; once conditions have removed
        // those actions the line points at nothing. The VFS bar trimmed these by
        // hand, which is how the rule got lost on every other tree-driven bar.
        const nodes = [
            barNode('/sep-a', { type: 'separator', showWhen: { field: '_never', op: 'eq', value: true } }),
            barNode('/sep-b', { type: 'separator' }),
            barNode('/edit', { action: 'edit' }),
            barNode('/sep-c', { type: 'separator' }),
            barNode('/sep-d', { type: 'separator' }),
            barNode('/delete', { action: 'delete' }),
            barNode('/sep-e', { type: 'separator' }),
        ];

        const { actions } = barFor(nodes, { _never: false });

        expect(actions.map(a => (true === a.divider ? '|' : a.id))).toEqual(['edit', '|', 'delete']);
    });

    it('keeps a bar of only separators empty rather than drawing stray lines', () => {
        const { actions } = barFor([barNode('/sep', { type: 'separator' })]);

        expect(actions).toEqual([]);
    });

    it('renders labels by default and suppresses them when the host asks for icons only', () => {
        // The label stays on the NODE either way -- the same node shows its text
        // in a context menu; only this surface declines to draw it.
        const nodes = [barNode('/rename', { action: 'rename', label: 'Rename' })];

        expect(barFor(nodes).labels).toEqual(['Rename']);
        expect(barFor(nodes, {}, true).labels).toEqual([]);
        expect(barFor(nodes, {}, true).actions[0].label).toBe('Rename');
    });
});
