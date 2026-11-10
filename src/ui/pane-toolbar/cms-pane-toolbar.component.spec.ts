import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { ErrorHandlerService } from '@coolms/core-angular';

import { ContextMenuComponent } from '../../context-menu/context-menu.component';
import { ContextMenuService } from '../../context-menu/context-menu.service';
import { CmsPaneToolbarComponent } from './cms-pane-toolbar.component';
import { type PaneToolbarAction, type PaneToolbarWidths } from './cms-pane-toolbar.types';
import { actionsWidth, groupsOf, labelSteps, overflowSteps, paneToolbarLayout, rowWidth } from './pane-toolbar-layout';
import { BOOTSTRAP_ICONS, iconForName } from '../icons/bootstrap-icons';

/**
 * Nodes as a server could send them: three groups, the first two with no overflow number (they never go), the third
 * going Star first, then Move, then Mark unread. The row knows nothing of mail; these are only its data.
 */
function nodes(over: Partial<Record<string, Partial<PaneToolbarAction>>> = {}): PaneToolbarAction[] {
    const a = (id: string, label: string, icon: string, group: string, extra: Partial<PaneToolbarAction> = {}): PaneToolbarAction =>
        ({ id, label, icon, group, ...extra, ...(over[id] ?? {}) });

    return [
        a('reply', 'Reply', 'reply', 'respond'),
        a('forward', 'Forward', 'forward', 'respond'),
        a('archive', 'Archive', 'archive', 'remove'),
        a('delete', 'Delete', 'trash', 'remove', { danger: true }),
        a('mark-unread', 'Mark unread', 'envelope', 'mark', { overflow: 3 }),
        a('star', 'Star', 'star', 'mark', { overflow: 1 }),
        a('move', 'Move', 'folder-symlink', 'mark', { overflow: 2 }),
    ];
}
const ORDER = ['reply', 'forward', 'archive', 'delete', 'mark-unread', 'star', 'move'];

@Component({
    standalone: true,
    imports: [CmsPaneToolbarComponent, ContextMenuComponent],
    template: `
        <div [style.width.px]="width()">
            <cms-pane-toolbar [actions]="actions()" label="Message actions" [status]="status()" (action)="chosen.push($event)" />
        </div>
        <coolms-context-menu />
    `,
})
class HostComponent {
    readonly width = signal(1400);
    readonly actions = signal<readonly PaneToolbarAction[]>(nodes());
    readonly status = signal<string | null>(null);
    readonly chosen: string[] = [];
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('CmsPaneToolbarComponent', () => {
    let f: ComponentFixture<HostComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HostComponent],
            providers: [
                { provide: HttpClient, useValue: {} },
                { provide: Router, useValue: {} },
                { provide: ErrorHandlerService, useValue: {} },
                { provide: Store, useValue: { selectSnapshot: () => null } },
            ],
        });
        f = TestBed.createComponent(HostComponent);
        document.body.appendChild(f.nativeElement);
    });
    afterEach(() => {
        TestBed.inject(ContextMenuService).close();
        (f.nativeElement as HTMLElement).remove();
    });

    /** Lets the ResizeObserver answer and the row redraw. */
    async function settle(): Promise<void> {
        for (let i = 0; i < 4; i++) {
            f.detectChanges();
            await frame();
        }
        await f.whenStable();
        f.detectChanges();
    }
    async function at(width: number): Promise<void> {
        f.componentInstance.width.set(width);
        await settle();
    }
    const root = () => f.nativeElement as HTMLElement;
    const row = () => root().querySelector<HTMLElement>('.cms-pane-toolbar')!;
    const actions = () => Array.from(root().querySelectorAll<HTMLButtonElement>('.cms-pane-toolbar .cms-pane-toolbar__action'));
    const button = (id: string) => root().querySelector<HTMLButtonElement>(`.cms-pane-toolbar [data-action="${id}"]`)!;
    /** What is behind More actions, in the order it went; checked against the buttons that say so. */
    const overflowed = () => {
        const order = [...toolbar().layout().overflowed];
        const marked = actions().filter((b) => b.hasAttribute('data-overflowed')).map((b) => b.dataset['action']);
        expect([...marked].sort()).withContext('data-overflowed').toEqual([...order].sort());
        return order;
    };
    const more = () => root().querySelector<HTMLButtonElement>('.cms-pane-toolbar .cms-pane-toolbar__more');
    const toolbar = () => f.debugElement.children[0].children[0].componentInstance as CmsPaneToolbarComponent;
    /** The widths the toolbar measured: what the thresholds below are computed from, so no pixel is guessed. */
    const widths = () => (toolbar() as unknown as { widths: () => PaneToolbarWidths }).widths();
    const key = (el: HTMLElement, k: string) => {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
        f.detectChanges();
    };
    const menuItems = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.ctx-menu .ctx-item'));

    it('draws the actions in the order given, in three groups with a separator between two', async () => {
        await settle();
        expect(actions().map((b) => b.dataset['action'])).toEqual(ORDER);
        const groups = Array.from(root().querySelectorAll('.cms-pane-toolbar .cms-pane-toolbar__group'));
        expect(groups.map((g) => Array.from(g.querySelectorAll('[data-action]')).map((b) => b.getAttribute('data-action'))))
            .toEqual([['reply', 'forward'], ['archive', 'delete'], ['mark-unread', 'star', 'move']]);
        const kids = Array.from(root().querySelector('.cms-pane-toolbar .cms-pane-toolbar__actions')!.children);
        expect(kids.map((k) => k.className.includes('separator') ? '|' : 'g')).toEqual(['g', '|', 'g', '|', 'g']);
        expect(row().getAttribute('role')).toBe('toolbar');
        expect(row().getAttribute('aria-label')).toBe('Message actions');
    });

    it('groups follow the order of their first action, and a group with nothing in it draws no separator', async () => {
        f.componentInstance.actions.set(nodes().filter((a) => a.id !== 'forward' && a.id !== 'archive' && a.id !== 'delete'));
        await settle();
        expect(actions().map((b) => b.dataset['action'])).toEqual(['reply', 'mark-unread', 'star', 'move']);
        expect(root().querySelectorAll('.cms-pane-toolbar .cms-pane-toolbar__separator').length).toBe(1);
    });

    it('carries data-action on every action, data-pinned on those with no overflow number only, and data-overflowed on none while all fit', async () => {
        await settle();
        expect(actions().every((b) => b.hasAttribute('data-action'))).toBeTrue();
        expect(actions().filter((b) => b.hasAttribute('data-pinned')).map((b) => b.dataset['action']))
            .toEqual(['reply', 'forward', 'archive', 'delete']);
        expect(overflowed()).toEqual([]);
        expect(more()).toBeNull();
        expect(row().classList).not.toContain('cms-pane-toolbar--labels-hidden');
    });

    it('hides every label before anything goes behind More actions, keeping each name', async () => {
        await settle();
        const labelled = actionsWidth(nodes(), widths(), true, new Set());
        const icons = actionsWidth(nodes(), widths(), false, new Set());
        expect(icons).toBeLessThan(labelled - 1);
        await at(Math.ceil(icons));
        expect(row().classList).toContain('cms-pane-toolbar--labels-hidden');
        expect(row().classList).not.toContain('cms-pane-toolbar--labels-partly-hidden');
        expect(overflowed()).toEqual([]);
        expect(more()).toBeNull();
        expect(actions().map((b) => b.getAttribute('aria-label'))).toEqual(['Reply', 'Forward', 'Archive', 'Delete', 'Mark unread', 'Star', 'Move']);
    });

    /** The ids whose label is drawn, in the row's order. */
    const labelsShown = () => actions()
        .filter((b) => getComputedStyle(b.querySelector('.cms-pane-toolbar__label')!).display !== 'none')
        .map((b) => b.dataset['action']);
    /** The order labels hide in for nodes(): Star (1), Move (2), Mark unread (3), then the pinned from the end back. */
    const HIDE_ORDER = ['star', 'move', 'mark-unread', 'delete', 'archive', 'forward', 'reply'];
    /** The narrowest whole width at which the row fits with these labels hidden and nothing behind More actions. */
    const fitting = (hidden: readonly string[]) => Math.ceil(rowWidth(f.componentInstance.actions(), widths(), new Set(hidden), new Set()));

    it('hides labels one by one: by overflow number, the lowest first, then the pinned from the end of the row back', async () => {
        expect(labelSteps(nodes())).toEqual(HIDE_ORDER.map((id) => [id]));
        await settle();
        for (let k = 1; k <= HIDE_ORDER.length; k++) {
            const hidden = HIDE_ORDER.slice(0, k);
            await at(fitting(hidden));
            expect(toolbar().layout().bare).withContext(`step ${k}`).toEqual(hidden);
            expect(labelsShown()).withContext(`step ${k}`).toEqual(ORDER.filter((id) => !hidden.includes(id)));
            expect(overflowed()).withContext(`step ${k}`).toEqual([]);
        }
    });

    it('hides the labels of actions sharing an overflow number together, the fewest steps that fit', () => {
        const pair: PaneToolbarAction[] = [
            { id: 'p', label: 'P', icon: 'p', group: 1 }, { id: 'q', label: 'Q', icon: 'q', group: 1 },
            { id: 'on', label: 'On', icon: 'on', group: 2, overflow: 1 }, { id: 'off', label: 'Off', icon: 'off', group: 2, overflow: 1 },
            { id: 'x', label: 'X', icon: 'x', group: 2, overflow: 2 }];
        const w: PaneToolbarWidths = {
            labelled: new Map(pair.map((a) => [a.id, 80])), icon: new Map(pair.map((a) => [a.id, 36])), more: 36, separator: 9, gap: 4,
        };
        expect(labelSteps(pair)).toEqual([['on', 'off'], ['x'], ['q'], ['p']]);
        // All labelled: 5 * 80 + 9 + 5 * 4 = 429. One pixel less, and the pair hides its labels together, nothing else.
        expect(paneToolbarLayout(428, pair, w)).toEqual({ labelsHidden: false, bare: ['on', 'off'], overflowed: [] });
        expect(paneToolbarLayout(429 - 88, pair, w)).toEqual({ labelsHidden: false, bare: ['on', 'off'], overflowed: [] });
        expect(paneToolbarLayout(429 - 88 - 1, pair, w)).toEqual({ labelsHidden: false, bare: ['on', 'off', 'x'], overflowed: [] });
    });

    it('marks the row labels-partly-hidden while some labels show, and labels-hidden only once none does', async () => {
        await settle();
        expect(row().classList).not.toContain('cms-pane-toolbar--labels-partly-hidden');
        expect(row().classList).not.toContain('cms-pane-toolbar--labels-hidden');
        await at(fitting(['star']));
        expect(row().classList).toContain('cms-pane-toolbar--labels-partly-hidden');
        expect(row().classList).not.toContain('cms-pane-toolbar--labels-hidden');
        expect(button('star').classList).toContain('cms-pane-toolbar__action--bare');
        expect(button('reply').classList).not.toContain('cms-pane-toolbar__action--bare');
        expect(button('star').querySelector('.cms-pane-toolbar__tip')!.textContent!.trim()).toBe('Star');
        expect(actions().map((b) => b.getAttribute('aria-label'))).toEqual(['Reply', 'Forward', 'Archive', 'Delete', 'Mark unread', 'Star', 'Move']);
        await at(fitting(HIDE_ORDER));
        expect(row().classList).not.toContain('cms-pane-toolbar--labels-partly-hidden');
        expect(row().classList).toContain('cms-pane-toolbar--labels-hidden');
        expect(actions().map((b) => b.getAttribute('aria-label'))).toEqual(['Reply', 'Forward', 'Archive', 'Delete', 'Mark unread', 'Star', 'Move']);
    });

    it('sends nothing behind More actions while any label shows, at any width', async () => {
        await settle();
        const acts = nodes();
        const full = Math.ceil(actionsWidth(acts, widths(), true, new Set()));
        let checked = 0;
        for (let w = full + 1; w >= 0; w--) {
            const layout = paneToolbarLayout(w, acts, widths());
            if (layout.overflowed.length > 0) {
                expect(layout.bare.length).withContext(`at ${w}`).toBe(acts.length);
                expect(layout.labelsHidden).withContext(`at ${w}`).toBeTrue();
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(0);
        await at(Math.floor(actionsWidth(acts, widths(), false, new Set())) - 1);
        expect(overflowed()).toEqual(['star', 'move']);
        expect(labelsShown()).toEqual([]);
    });

    it('brings everything back in the reverse order as the row widens: actions from More actions, then labels, the last hidden first', async () => {
        await settle();
        const acts = nodes();
        const full = Math.ceil(actionsWidth(acts, widths(), true, new Set()));
        // Over every width, each pixel wider undoes at most what the pixel narrower did, last first.
        const key = (w: number) => {
            const l = paneToolbarLayout(w, acts, widths());
            return [...l.bare.map((id) => 'label:' + id), ...l.overflowed.map((id) => 'more:' + id)];
        };
        for (let w = 0; w < full + 1; w++) {
            const narrow = key(w);
            const wide = key(w + 1);
            expect(narrow.slice(0, wide.length)).withContext(`${w} -> ${w + 1}`).toEqual(wide);
        }
        // And in the page: narrowing through every step, then widening through them back.
        const steps = [...HIDE_ORDER.map((_, k) => fitting(HIDE_ORDER.slice(0, k + 1))),
            Math.floor(actionsWidth(acts, widths(), false, new Set())) - 1,
            Math.floor(actionsWidth(acts, widths(), false, new Set(['star', 'move']))) - 1];
        const seen: string[] = [];
        for (const w of steps) {
            await at(w);
            seen.push(JSON.stringify(toolbar().layout()));
        }
        expect(JSON.parse(seen[seen.length - 1]).overflowed).toEqual(['star', 'move', 'mark-unread']);
        for (let i = steps.length - 1; i >= 0; i--) {
            await at(steps[i]);
            expect(JSON.stringify(toolbar().layout())).withContext(`back at ${steps[i]}`).toBe(seen[i]);
        }
        await at(fitting(['star', 'move']));
        expect(labelsShown()).toEqual(['reply', 'forward', 'archive', 'delete', 'mark-unread']);
        await at(full);
        expect(labelsShown()).toEqual(ORDER);
        expect(toolbar().layout().bare).toEqual([]);
    });

    it('an icon the kit does not have keeps its label while the labels around it hide one by one', async () => {
        f.componentInstance.actions.set(nodes({ move: { icon: 'no-such-icon' } }));
        await settle();
        await at(fitting(['star', 'move', 'mark-unread']));
        expect(toolbar().layout().bare).toEqual(['star', 'move', 'mark-unread']);
        expect(labelsShown()).toEqual(['reply', 'forward', 'archive', 'delete', 'move']);
        expect(button('move').classList).not.toContain('cms-pane-toolbar__action--bare');
        expect(button('move').classList).toContain('cms-pane-toolbar__action--text');
        expect(row().classList).toContain('cms-pane-toolbar--labels-partly-hidden');
    });

    it('then sends Star and Move behind More actions together, then Mark unread: never one alone', async () => {
        await settle();
        const icons = actionsWidth(nodes(), widths(), false, new Set());
        await at(Math.floor(icons) - 1);
        expect(overflowed()).toEqual(['star', 'move']);
        expect(more()).not.toBeNull();
        const two = actionsWidth(nodes(), widths(), false, new Set(['star', 'move']));
        await at(Math.floor(two) - 1);
        expect(overflowed()).toEqual(['star', 'move', 'mark-unread']);
    });

    it('never sends an action with no overflow number behind More actions, however narrow', async () => {
        await at(40);
        expect(overflowed()).toEqual(['star', 'move', 'mark-unread']);
        for (const id of ['reply', 'forward', 'archive', 'delete']) {
            expect(button(id).hasAttribute('data-overflowed')).withContext(id).toBeFalse();
            expect(button(id).hidden).withContext(id).toBeFalse();
        }
    });

    it('goes by overflow number, not by place in the row; actions sharing a number go together; none means never', () => {
        const groups: PaneToolbarAction[] = [
            { id: 'a', label: 'A', icon: 'a', group: 1, overflow: 2 }, { id: 'b', label: 'B', icon: 'b', group: 1, overflow: 1 },
            { id: 'p', label: 'P', icon: 'p', group: 1 }, { id: 's', label: 'S', icon: 's', group: 1 }, { id: 'c', label: 'C', icon: 'c', group: 1, overflow: 3 }];
        expect(overflowSteps(groups)).toEqual([['b'], ['a'], ['c']]);
        expect(overflowSteps([...groups, { id: 'd', label: 'D', icon: 'd', group: 1, overflow: 1 }])).toEqual([['b', 'd'], ['a'], ['c']]);
        const w: PaneToolbarWidths = {
            labelled: new Map([['a', 80], ['b', 80], ['p', 80], ['s', 80], ['c', 80]]),
            icon: new Map([['a', 36], ['b', 36], ['p', 36], ['s', 36], ['c', 36]]),
            more: 36, separator: 9, gap: 4,
        };
        const all = ['b', 'a', 'c', 's', 'p'];
        expect(paneToolbarLayout(null, groups, w)).toEqual({ labelsHidden: false, bare: [], overflowed: [] });
        expect(paneToolbarLayout(5 * 80 + 4 * 4, groups, w)).toEqual({ labelsHidden: false, bare: [], overflowed: [] });
        expect(paneToolbarLayout(5 * 36 + 4 * 4, groups, w)).toEqual({ labelsHidden: true, bare: all, overflowed: [] });
        expect(paneToolbarLayout(5 * 36 + 4 * 4 - 1, groups, w)).toEqual({ labelsHidden: true, bare: all, overflowed: ['b', 'a'] });
        expect(paneToolbarLayout(10, groups, w)).toEqual({ labelsHidden: true, bare: all, overflowed: ['b', 'a', 'c'] });
    });

    it('takes a toggle pair, two actions sharing a number, behind More actions in one step', () => {
        const pair: PaneToolbarAction[] = [
            { id: 'p', label: 'P', icon: 'p', group: 1 }, { id: 'q', label: 'Q', icon: 'q', group: 1 },
            { id: 'on', label: 'On', icon: 'on', group: 2, overflow: 1 }, { id: 'off', label: 'Off', icon: 'off', group: 2, overflow: 1 },
            { id: 'x', label: 'X', icon: 'x', group: 2, overflow: 2 }];
        const w: PaneToolbarWidths = {
            labelled: new Map(pair.map((a) => [a.id, 80])), icon: new Map(pair.map((a) => [a.id, 36])), more: 36, separator: 9, gap: 4,
        };
        // Five icons, one separator: 5 * 36 + 9 + 5 * 4. One pixel less, and the pair goes together, nothing else.
        expect(paneToolbarLayout(5 * 36 + 9 + 5 * 4 - 1, pair, w))
            .toEqual({ labelsHidden: true, bare: ['on', 'off', 'x', 'q', 'p'], overflowed: ['on', 'off'] });
    });

    it('groups follow the order of their first action, each keeping its actions in order', () => {
        const mixed: PaneToolbarAction[] = [
            { id: 'a', label: 'A', icon: 'a', group: 'x' }, { id: 'b', label: 'B', icon: 'b', group: 'y' }, { id: 'c', label: 'C', icon: 'c', group: 'x' }];
        expect(groupsOf(mixed).map((g) => g.map((a) => a.id))).toEqual([['a', 'c'], ['b']]);
    });

    it('lists what is behind More actions by overflow number, with icons and labels, and danger on Delete alone', async () => {
        await at(40);
        expect(row().querySelectorAll('.cms-pane-toolbar__action--danger').length).toBe(1);
        expect(button('delete').classList).toContain('cms-pane-toolbar__action--danger');
        more()!.click();
        await settle();
        expect(menuItems().map((i) => i.textContent!.trim())).toEqual(['Star', 'Move', 'Mark unread']);
        expect(menuItems().every((i) => i.querySelector('.bi') !== null)).toBeTrue();
        expect(menuItems().some((i) => i.classList.contains('ctx-item--danger'))).toBeFalse();
    });

    it('draws a destructive action as danger in the menu too, were it ever behind More actions', async () => {
        f.componentInstance.actions.set(nodes({ delete: { overflow: 0 } }));
        await at(40);
        more()!.click();
        await settle();
        expect(menuItems().map((i) => i.textContent!.trim())).toEqual(['Delete', 'Star', 'Move', 'Mark unread']);
        expect(menuItems().filter((i) => i.classList.contains('ctx-item--danger')).map((i) => i.textContent!.trim())).toEqual(['Delete']);
    });

    it('names More actions and makes it a menu button', async () => {
        await at(40);
        expect(more()!.getAttribute('aria-label')).toBe('More actions');
        expect(more()!.getAttribute('aria-haspopup')).toBe('menu');
        expect(more()!.getAttribute('aria-expanded')).toBe('false');
        more()!.click();
        await settle();
        expect(more()!.getAttribute('aria-expanded')).toBe('true');
    });

    it('has one Tab stop; Left, Right, Home and End move inside, and Down on More actions opens its menu on the first item', async () => {
        await at(40);
        expect(actions().concat(more()!).filter((b) => b.getAttribute('tabindex') === '0').map((b) => b.dataset['action'])).toEqual(['reply']);
        button('reply').focus();
        key(button('reply'), 'ArrowRight');
        expect(document.activeElement).toBe(button('forward'));
        expect(button('forward').getAttribute('tabindex')).toBe('0');
        expect(button('reply').getAttribute('tabindex')).toBe('-1');
        key(button('forward'), 'ArrowLeft');
        key(button('reply'), 'ArrowLeft');
        expect(document.activeElement).toBe(button('reply'));
        key(button('reply'), 'End');
        expect(document.activeElement).toBe(more());
        key(more()!, 'Home');
        expect(document.activeElement).toBe(button('reply'));
        key(button('reply'), 'End');
        key(more()!, 'ArrowDown');
        await settle();
        expect(document.activeElement).toBe(menuItems()[0]);
        key(menuItems()[0], 'ArrowDown');
        expect(document.activeElement).toBe(menuItems()[1]);
        key(menuItems()[1], 'Tab');
        await settle();
        expect(menuItems().length).toBe(0);
        expect(document.activeElement).toBe(more());
    });

    it('Up on More actions opens its menu on the last item; choosing one emits it once the menu has closed', async () => {
        await at(40);
        more()!.focus();
        key(more()!, 'ArrowUp');
        await settle();
        expect(document.activeElement).toBe(menuItems()[2]);
        menuItems()[2].click();
        await settle();
        expect(f.componentInstance.chosen).toEqual(['mark-unread']);
        expect(document.activeElement).toBe(more());
    });

    it("emits a chosen action's id, and nothing for a disabled or a busy one, which stay reachable", async () => {
        f.componentInstance.actions.set(nodes({ forward: { disabled: true, reason: 'Not for drafts' }, star: { busy: true } }));
        await settle();
        button('reply').click();
        button('forward').click();
        button('star').click();
        expect(f.componentInstance.chosen).toEqual(['reply']);
        expect(button('forward').getAttribute('aria-disabled')).toBe('true');
        expect(button('forward').disabled).toBeFalse();
        const reason = document.getElementById(button('forward').getAttribute('aria-describedby')!);
        expect(reason?.textContent).toBe('Not for drafts');
        expect(button('star').getAttribute('aria-busy')).toBe('true');
        expect(button('star').querySelector('.cms-pane-toolbar__spinner')).not.toBeNull();
    });

    it('shows the status at the end of the row, its whole text as its title', async () => {
        f.componentInstance.status.set('Synced at 14:32');
        await settle();
        const status = root().querySelector<HTMLElement>('.cms-pane-toolbar__status')!;
        expect(status.textContent!.trim()).toBe('Synced at 14:32');
        expect(status.title).toBe('Synced at 14:32');
        expect(row().lastElementChild).toBe(status);
    });

    it('is one height whatever it holds, the same with labels and without', async () => {
        await settle();
        const tall = row().getBoundingClientRect().height;
        f.componentInstance.status.set('Synced at 14:32');
        await at(40);
        expect(row().getBoundingClientRect().height).toBe(tall);
        expect(tall).toBeGreaterThan(0);
    });

    /** The separators drawn, as the row reads left to right: '|' a separator, 'g' a group that shows an action. */
    const reading = () => Array.from(root().querySelector('.cms-pane-toolbar .cms-pane-toolbar__actions')!.children)
        .filter((k) => !k.classList.contains('cms-pane-toolbar__more'))
        .map((k) => (k.classList.contains('cms-pane-toolbar__separator') ? '|'
            : (Array.from(k.querySelectorAll('[data-action]')).some((b) => !(b as HTMLElement).hidden) ? 'g' : '-')))
        .filter((k) => k !== '-')
        .join('');

    it('leaves no stray separator when a whole group goes behind More actions: not between, leading or trailing', async () => {
        const g = (id: string, group: string, overflow?: number): PaneToolbarAction =>
            ({ id, label: id, icon: 'star', group, ...(overflow === undefined ? {} : { overflow }) });
        f.componentInstance.actions.set([g('a', 'one'), g('b1', 'two', 1), g('b2', 'two', 1), g('c', 'three')]);
        await at(40);
        expect(overflowed()).toEqual(['b1', 'b2']);
        expect(reading()).toBe('g|g');
        f.componentInstance.actions.set([g('b1', 'two', 1), g('b2', 'two', 1), g('a', 'one'), g('c', 'three')]);
        await settle();
        expect(reading()).toBe('g|g');
        f.componentInstance.actions.set([g('a', 'one'), g('c', 'three'), g('b1', 'two', 1), g('b2', 'two', 1)]);
        await settle();
        expect(reading()).toBe('g|g');
    });

    it('draws no separator in the More actions menu, leading, trailing or between', async () => {
        await at(40);
        more()!.click();
        await settle();
        expect(menuItems().length).toBe(3);
        expect(document.querySelectorAll('.ctx-menu .ctx-sep').length).toBe(0);
    });

    it('an icon the kit does not have shows the label alone, even while the others hide theirs', async () => {
        f.componentInstance.actions.set(nodes({ star: { icon: 'no-such-icon', overflow: undefined } }));
        await settle();
        const star = button('star');
        expect(star.querySelector('.bi')).toBeNull();
        expect(star.querySelector('.cms-pane-toolbar__mark')).toBeNull();
        expect(star.classList).toContain('cms-pane-toolbar__action--text');
        const icons = actionsWidth(f.componentInstance.actions(), widths(), false, new Set());
        await at(Math.ceil(icons));
        expect(row().classList).toContain('cms-pane-toolbar--labels-hidden');
        const label = star.querySelector<HTMLElement>('.cms-pane-toolbar__label')!;
        expect(getComputedStyle(label).display).not.toBe('none');
        expect(getComputedStyle(button('reply').querySelector('.cms-pane-toolbar__label')!).display).toBe('none');
        expect(star.getAttribute('aria-label')).toBe('Star');
    });

    it('keeps a lone action in the row when it is the only one that could go: no More actions, nothing marked', async () => {
        const g = (id: string, overflow?: number): PaneToolbarAction =>
            ({ id, label: id, icon: 'star', group: 'one', ...(overflow === undefined ? {} : { overflow }) });
        f.componentInstance.actions.set([g('a'), g('b'), g('c'), g('x', 1)]);
        await at(40);
        expect(row().classList).toContain('cms-pane-toolbar--labels-hidden');
        expect(toolbar().layout().overflowed).toEqual([]);
        expect(root().querySelectorAll('[data-overflowed]').length).toBe(0);
        expect(more()).toBeNull();
        expect(button('x').hidden).toBeFalse();
    });

    it('puts data-action on the drawn controls only, never on the measuring copies', async () => {
        await at(40);
        const all = Array.from(root().querySelectorAll('[data-action]'));
        expect(all.every((el) => el.closest('.cms-pane-toolbar') !== null)).toBeTrue();
        expect(root().querySelectorAll('[data-action="reply"]').length).toBe(1);
        expect(root().querySelectorAll('[data-measure-action="reply"]').length).toBe(2);
    });

    it('maps the Bootstrap Icons names to the kit icons by one table, and an unknown name to none', () => {
        expect(iconForName('arrow-clockwise')).toBe('arrow-clockwise');
        expect(iconForName('three-dots')).toBe('three-dots');
        expect(Object.keys(BOOTSTRAP_ICONS).length).toBe(15);
        expect(iconForName('no-such-icon')).toBeNull();
        expect(iconForName('toString')).toBeNull();
        expect(iconForName(undefined)).toBeNull();
    });
});
