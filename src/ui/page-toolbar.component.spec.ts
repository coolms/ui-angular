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

/**
 * A node naming a `capability` (a declared action): its PRESENCE is the graph's, its STATE the
 * page's subjects', published as `_capabilities` -- `denied` disables, `elevate` locks, no answer leaves
 * the node as it was.
 */
describe('PageToolbarComponent capability state', () => {
    function rendered(context: Record<string, unknown>, iconsOnly = false): { action: ToolbarAction; host: HTMLElement } {
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
        spyOn(TestBed.inject(NaviGraphService), 'loadTree').and.returnValue(of([
            // A label, so the bar draws one and the screen-reader phrase's place after it is measurable.
            barNode('/chmod', { action: 'VfsChmod', icon: 'shield-lock', label: 'Permissions', capability: 'vfs.node.chmod' }),
        ]));

        const fixture = TestBed.createComponent(PageToolbarComponent);
        fixture.componentRef.setInput('treeSlug', 'navi.toolbar.test');
        fixture.componentRef.setInput('context', context);
        fixture.componentRef.setInput('iconsOnly', iconsOnly);
        fixture.detectChanges();

        return {
            action: fixture.componentInstance.resolvedLeft()[0],
            host:   fixture.nativeElement as HTMLElement,
        };
    }

    it('keeps an allowed action enabled, unlocked, its title as declared', () => {
        const { action, host } = rendered({ _capabilities: { 'vfs.node.chmod': 'allowed' } });

        expect(action.disabled).toBe(false);
        expect(action.locked).toBeUndefined();
        expect(action.title).toBe('Title for /chmod');
        expect((host.querySelector('.toolbar-btn') as HTMLButtonElement).title).toBe('Title for /chmod');
        expect(host.querySelector('.toolbar-btn__lock')).toBeNull();
        expect(host.querySelector('.toolbar-btn__sr')).toBeNull();
    });

    it('disables a denied action and keeps it in the bar', () => {
        const { action, host } = rendered({ _capabilities: { 'vfs.node.chmod': 'denied' } });

        expect(action.disabled).toBe(true);
        expect(action.locked).toBeUndefined();
        expect((host.querySelector('.toolbar-btn') as HTMLButtonElement).disabled).toBe(true);
    });

    it('locks an action allowed once elevated: enabled, a lock drawn, the title saying why', () => {
        const { action, host } = rendered({ _capabilities: { 'vfs.node.chmod': 'elevate' } });

        expect(action.disabled).toBe(false);
        expect(action.locked).toBe(true);
        const button = host.querySelector('.toolbar-btn') as HTMLButtonElement;
        expect(button.title).toBe('Title for /chmod -- needs an elevated session');
        expect(button.disabled).toBe(false);
        expect(button.classList).toContain('toolbar-btn--locked');
        expect(button.querySelector('.toolbar-btn__lock')).not.toBeNull();
        // Said to a screen reader too, AFTER the label: the title alone is a description some skip.
        expect(button.querySelector('.toolbar-btn__sr')?.textContent?.trim()).toBe('(needs an elevated session)');
        expect(button.lastElementChild?.classList).toContain('toolbar-btn__sr');
        expect(button.textContent?.replace(/\s+/g, ' ').trim()).toBe('Permissions (needs an elevated session)');
    });

    it('names an icon-only locked action in its screen-reader text, which is then the button\'s only text', () => {
        // The VFS bar draws icons only: with no label drawn the phrase is the button's whole name, so it must
        // carry which action this is, not only that it is locked.
        const { host } = rendered({ _capabilities: { 'vfs.node.chmod': 'elevate' } }, true);
        const button = host.querySelector('.toolbar-btn') as HTMLButtonElement;

        expect(button.textContent?.replace(/\s+/g, ' ').trim()).toBe('Title for /chmod (needs an elevated session)');
        expect(button.title).toBe('Title for /chmod -- needs an elevated session');
    });

    it('says on a denied action how many of the selection refuse it: in its title, and to a screen reader', () => {
        const { action, host } = rendered({
            _capabilities:       { 'vfs.node.chmod': 'denied' },
            _capabilityRefusals: { 'vfs.node.chmod': { refused: 2, of: 3 } },
        });
        const button = host.querySelector('.toolbar-btn') as HTMLButtonElement;

        expect(action.refusal).toBe('not allowed for 2 of 3 selected items');
        expect(button.disabled).toBe(true);
        expect(button.title).toBe('Title for /chmod -- not allowed for 2 of 3 selected items');
        expect(button.querySelector('.toolbar-btn__lock')).toBeNull();
        expect(button.textContent?.replace(/\s+/g, ' ').trim()).toBe('Permissions (not allowed for 2 of 3 selected items)');
    });

    it('reads an action the published answer lacks as denied', () => {
        expect(rendered({ _capabilities: { 'vfs.node.delete': 'allowed' } }).action.disabled).toBe(true);
    });

    it('leaves the node as it was when the page published no answer', () => {
        // No answer is not "denied": the refusal decides, as before the server answered at all.
        for (const context of [{}, { _capabilities: [] }]) {
            const { action, host } = rendered(context);

            expect(action.disabled).toBeUndefined();
            expect(action.locked).toBeUndefined();
            expect(host.querySelector('.toolbar-btn__lock')).toBeNull();
        }
    });

    it('keeps a disabledWhen in force on an allowed action', () => {
        const nodes = [barNode('/paste', {
            action:       'VfsPaste',
            capability:   'vfs.node.chmod',
            disabledWhen: { field: '_hasClipboard', op: 'eq', value: false },
        })];

        const { actions } = barFor(nodes, { _hasClipboard: false, _capabilities: { 'vfs.node.chmod': 'allowed' } });

        expect(actions[0].disabled).toBe(true);
    });
});
