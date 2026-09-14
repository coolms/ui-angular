import { TestBed } from '@angular/core/testing';

import { LayoutTreeEditorComponent, type LayoutNode } from './layout-tree-editor.component';

/**
 * Two things an operator saw on the Form Builder's Layout tab, 2026-09-11:
 *
 *  1. Placing a field on a tab that already held four chips and five option
 *     GROUPs put the new chip BELOW the fifth group, out of sight of the
 *     picker that placed it. `addField` was a plain push().
 *  2. The "+ field..." picker kept showing the alias it had just placed --
 *     sometimes. It was `[ngModel]="''"`, and a constant input never changes,
 *     so NgModel never wrote '' back to the DOM.
 *
 * Both are asserted on what leaves the component -- the emitted tree, which
 * is what the host saves -- and on the select element's own value.
 *
 * !! The `nodes` setter CLONES what it is given. The first version of this
 * file mutated its own fixture object and read it back, and five of seven
 * tests passed without the component doing anything. Every read here goes
 * through `cmp.model` (the clone the component acts on) or the emission.
 */
describe('LayoutTreeEditorComponent', () => {
    function tab(children: unknown[]): LayoutNode {
        return { type: 'tab', name: 'Basic', children };
    }

    function group(name: string): LayoutNode {
        return { type: 'group', name, children: [] };
    }

    /** Leaves as their alias, containers as `[type]` -- the order the chips render in. */
    function shape(children: unknown[]): string[] {
        return children.map(c => (typeof c === 'string' ? c : `[${(c as LayoutNode)['type']}]`));
    }

    function build(nodes: LayoutNode[], availableFields: string[]) {
        TestBed.configureTestingModule({ imports: [LayoutTreeEditorComponent] });
        const fixture = TestBed.createComponent(LayoutTreeEditorComponent);
        const cmp = fixture.componentInstance;
        cmp.nodes = nodes;
        cmp.availableFields = availableFields;
        cmp.allFields = availableFields;
        const emitted: LayoutNode[][] = [];
        cmp.nodesChange.subscribe((n: LayoutNode[]) => emitted.push(n));
        fixture.detectChanges();
        // The node the component will act on is its clone, not the fixture's.
        const node = cmp.model[0];
        const lastEmittedChildren = (): unknown[] => (emitted[emitted.length - 1][0]['children'] as unknown[]);
        return { fixture, cmp, node, emitted, lastEmittedChildren };
    }

    // -- placement -------------------------------------------------------------

    it('places a new field after the last existing leaf, not after the last sub-container', () => {
        const { cmp, node, emitted, lastEmittedChildren } =
            build([tab(['name', 'label', 'type', 'isRequired', group('Text Options'), group('Date Options')])], ['text_1']);
        const before = emitted.length;

        cmp.addField(node, 'text_1');

        expect(emitted.length).withContext('one emission').toBe(before + 1);
        expect(shape(lastEmittedChildren()))
            .toEqual(['name', 'label', 'type', 'isRequired', 'text_1', '[group]', '[group]']);
    });

    it('places a field at the FRONT of a container that holds only sub-containers', () => {
        const { cmp, node, lastEmittedChildren } = build([tab([group('A'), group('B')])], ['x']);

        cmp.addField(node, 'x');

        expect(shape(lastEmittedChildren())).toEqual(['x', '[group]', '[group]']);
    });

    it('appends to an empty container', () => {
        const { cmp, node, lastEmittedChildren } = build([tab([])], ['x']);

        cmp.addField(node, 'x');

        expect(lastEmittedChildren()).toEqual(['x']);
    });

    it('keeps following the chips when a leaf already sits after a container', () => {
        // An operator who placed a field after a group (possible before this
        // rule, via push) gets the next one beside it, not teleported above.
        const { cmp, node, lastEmittedChildren } = build([tab(['name', group('A'), 'late'])], ['x']);

        cmp.addField(node, 'x');

        expect(shape(lastEmittedChildren())).toEqual(['name', '[group]', 'late', 'x']);
    });

    it('ignores an empty pick', () => {
        const { cmp, node, emitted } = build([tab(['name'])], ['x']);
        const before = emitted.length;

        cmp.addField(node, '');
        cmp.addField(node, '   ');

        expect(cmp.children(node)).toEqual(['name']);
        expect(emitted.length).withContext('nothing emitted').toBe(before);
    });

    // -- the picker resets ------------------------------------------------------

    it('resets the "+ field" select to the placeholder after a pick', () => {
        const { fixture, lastEmittedChildren } = build([tab(['name'])], ['text_1']);

        const select = fixture.nativeElement.querySelector('select.lte__fieldpick') as HTMLSelectElement;
        expect(select).withContext('the picker renders').not.toBeNull();
        expect(select.value).toBe('');

        select.value = 'text_1';
        select.dispatchEvent(new Event('change'));
        fixture.detectChanges();

        expect(lastEmittedChildren()).withContext('the pick was placed').toEqual(['name', 'text_1']);
        expect(select.value).withContext('the DOM select itself, after the pick').toBe('');
    });

    it('resets the select even when the host has not yet removed the picked alias from availableFields', () => {
        // The host recomputes availableFields from the emitted tree, one change
        // detection later. Until then the option for the picked alias still
        // exists -- the exact window in which the old binding left the select
        // showing it. The reset must not depend on the option vanishing.
        const { fixture } = build([tab([])], ['a', 'b']);
        const select = fixture.nativeElement.querySelector('select.lte__fieldpick') as HTMLSelectElement;

        select.value = 'a';
        select.dispatchEvent(new Event('change'));
        // No detectChanges: the option list is unchanged, 'a' is still an option.

        expect([...select.options].map(o => o.value)).toContain('a');
        expect(select.value).toBe('');
    });
});
