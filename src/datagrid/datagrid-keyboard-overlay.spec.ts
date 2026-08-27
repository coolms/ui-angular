import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgxsModule } from '@ngxs/store';
import { AppConfigState } from '@coolms/core-angular';
import { DataGridComponent } from './datagrid.component';
import type { DataGridConfig, DataGridRowAction } from './datagrid.types';

/**
 * Regression spec — the grid's `document:keydown` listener must not fire
 * destructive row actions while a modal surface is open above it.
 *
 * The reported bug: with the BPMN designer open in a CDK dialog over the
 * Definitions list, pressing `Delete` to remove an element from the
 * designer canvas ALSO fired the grid's `delete` row action on the row
 * selected behind the dialog. The designer canvas is an `<svg>`, so the
 * pre-existing INPUT/TEXTAREA/SELECT/contenteditable guard let it
 * through, and `document:keydown` fires regardless of where in the page
 * the event originated — a CDK overlay renders outside the grid's own
 * DOM subtree entirely. Only the backend's delete guard (409 on a
 * deployed definition) stopped real data loss.
 *
 * Both directions are covered: the keys must still work when no overlay
 * is open, or this "fix" would silently kill keyboard navigation.
 */
describe('DataGridComponent — keyboard vs. overlays', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<DataGridComponent>>;
    let component: DataGridComponent;

    const ROW = { id: 'wf-1', name: 'order-approval' };

    const DELETE_ACTION: DataGridRowAction = {
        id: 'delete', label: 'Delete', confirm: true,
    } as DataGridRowAction;

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

        component.config.set({
            id:        'definition_catalog',
            label:     'Definitions',
            columns:   [],
            draggable: false,
            perPage:   25,
            rowActions: [DELETE_ACTION],
        } as unknown as DataGridConfig);
        // `selectableRows` is a private accessor over the tree/flat row
        // pipeline; stubbing it keeps this spec on the keydown guard
        // rather than on data loading. Same element-access convention the
        // range-filter spec uses to reach private members.
        component['selectableRows'] = () => [ROW];
        component.selectedRowIds.set(new Set([ROW.id]));
    });

    /** Dispatches Delete as if it came from `target`, and reports whether the action fired. */
    function pressDeleteFrom(target: HTMLElement): { fired: boolean; defaultPrevented: boolean } {
        let fired = false;
        const sub = component.rowActionTriggered.subscribe(e => {
            if (e.action === 'delete') fired = true;
        });

        const event = new KeyboardEvent('keydown', { key: 'Delete', cancelable: true });
        // KeyboardEvent.target is read-only and only set by dispatch; the
        // handler reads `event.target`, so define it explicitly rather
        // than dispatching through a detached element.
        Object.defineProperty(event, 'target', { value: target });
        component.onKeyDown(event);

        sub.unsubscribe();
        return { fired, defaultPrevented: event.defaultPrevented };
    }

    afterEach(() => {
        document.querySelectorAll('.cdk-overlay-container, .cdk-overlay-backdrop')
            .forEach(n => n.remove());
    });

    it('fires the delete row action for a keystroke on the page itself', () => {
        const { fired, defaultPrevented } = pressDeleteFrom(document.body);

        expect(fired).toBeTrue();
        expect(defaultPrevented).toBeTrue();
    });

    it('ignores Delete dispatched from inside a CDK overlay (the designer canvas)', () => {
        // Reproduce the reported DOM: an overlay container holding an
        // <svg> canvas, exactly as the designer dialog renders.
        const container = document.createElement('div');
        container.className = 'cdk-overlay-container';
        const canvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        container.appendChild(canvas);
        document.body.appendChild(container);

        const { fired, defaultPrevented } = pressDeleteFrom(canvas as unknown as HTMLElement);

        expect(fired).toBeFalse();
        // Must not swallow the key either — the designer's own Delete
        // binding needs it to reach the canvas controller.
        expect(defaultPrevented).toBeFalse();
    });

    it('ignores Delete while a modal backdrop is up, wherever it originated', () => {
        // A backdrop-less overlay is covered above; this covers the
        // converse — a modal owns the page even if the event target is
        // outside the overlay container (e.g. focus still on <body>).
        const backdrop = document.createElement('div');
        backdrop.className = 'cdk-overlay-backdrop';
        document.body.appendChild(backdrop);

        expect(pressDeleteFrom(document.body).fired).toBeFalse();
    });

    it('still moves the focused row with ArrowDown when no overlay is open', () => {
        // Guards against over-blocking: the overlay checks sit above
        // every key branch, so a bad predicate would kill navigation too.
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
        Object.defineProperty(event, 'target', { value: document.body });
        component.onKeyDown(event);

        expect(component.focusedRowId()).toBe(ROW.id);
    });
});
