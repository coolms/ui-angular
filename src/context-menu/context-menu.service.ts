import { inject, Injectable, signal } from '@angular/core';
import { NaviGraphService, NaviGraphNode } from '@coolms/core-angular';
import { capabilityStateOf, refusalPhraseOf } from '../ui/capability-state';
export interface ContextMenuItem {
    id:        string;
    label?:    string;
    icon?:     string;
    danger?:   boolean;
    disabled?: boolean;
    divider?:  boolean;
    /** Allowed once the session is elevated: drawn with a lock; what choosing it does is the caller's. */
    locked?:   boolean;
    /** Why a denied item is disabled, in words ("not allowed for 2 of 5 selected items"): its title, and said. */
    refusal?:  string;
}

@Injectable({ providedIn: 'root' })
export class ContextMenuService {
    private readonly naviGraph = inject(NaviGraphService);

    readonly menu = signal<{
        x:        number;
        y:        number;
        items:    ContextMenuItem[];
        onAction: (id: string) => void;
        /** Opened from a menu button (openFrom): the item focused on opening, and the button focus returns to. */
        focus?:   'first' | 'last';
        opener?:  HTMLElement;
        /** Who opened it, so a menu button can say whether the open menu is its own (aria-expanded). */
        owner?:   unknown;
    } | null>(null);

    /**
     * Open as a menu button's menu: under the button, with focus on the first or the last enabled
     * item; closing it returns focus to the button.
     */
    openFrom(
        opener:   HTMLElement,
        items:    ContextMenuItem[],
        onAction: (id: string) => void,
        options:  { focus?: 'first' | 'last'; owner?: unknown } = {},
    ): void {
        if (items.length === 0) { this.close(); return; }
        const rect = opener.getBoundingClientRect();
        this.menu.set({
            x: rect.left,
            y: rect.bottom + 4,
            items,
            onAction,
            focus: options.focus ?? 'first',
            opener,
            owner: options.owner,
        });
    }

    /**
     * Open with pre-built items -- used by DataGrid for row-action menus.
     * Caller is responsible for building the ContextMenuItem[] list.
     */
    open(
        event:    MouseEvent,
        items:    ContextMenuItem[],
        onAction: (id: string) => void,
    ): void {
        event.preventDefault();
        event.stopPropagation();
        if (items.length === 0) { this.close(); return; }
        this.menu.set({
            x: event.clientX,
            y: event.clientY,
            items,
            onAction,
        });
    }

    /**
     * Open from NaviGraph nodes -- evaluates visibility against the given record
     * and builds the item list automatically.
     *
     * Nodes shown in context menus:
     *   - meta.surface === 'context' or 'both'
     *   - meta.surface absent (backwards compat: show by default)
     *
     * Closes without showing if no items remain after filtering.
     */
    openFromNodes(
        event:    MouseEvent,
        nodes:    NaviGraphNode[],
        record:   Record<string, unknown>,
        onAction: (id: string) => void,
    ): void {
        event.preventDefault();
        event.stopPropagation();

        const surface = (n: NaviGraphNode): boolean => {
            const s = n.meta['surface'];
            return s === 'context' || s === 'both' || s === undefined || s === null || s === '';
        };

        const visible = nodes.filter(
            n => this.naviGraph.isVisible(n, record) && surface(n),
        );

        if (visible.length === 0) { this.close(); return; }

        const items = this.buildItems(visible, record);
        if (items.length === 0) { this.close(); return; }
        this.menu.set({
            x: event.clientX,
            y: event.clientY,
            items,
            onAction,
        });
    }

    close(): void {
        const opener = this.menu()?.opener;
        this.menu.set(null);
        if (opener?.isConnected) opener.focus();
    }

    /**
     * Update only the menu's screen position. Used by the component's
     * post-render edge-clamp effect once the real menu rect is known.
     */
    setPosition(x: number, y: number): void {
        const m = this.menu();
        if (!m) return;
        if (m.x === x && m.y === y) return;
        this.menu.set({ ...m, x, y });
    }

    /**
     * A node naming a `capability` takes its state from the record's subjects, as on the toolbar
     * (capability-state.ts): `denied` disables the item, `elevate` locks it, no answer leaves it as it was.
     */
    private buildItems(nodes: NaviGraphNode[], record: Record<string, unknown>): ContextMenuItem[] {
        const result: ContextMenuItem[] = [];
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (n.meta['type'] === 'separator') {
                // Skip leading, trailing, and consecutive separators
                if (i === 0 || i === nodes.length - 1) continue;
                if (nodes[i - 1].meta['type'] === 'separator') continue;
                result.push({ id: n.path, divider: true });
                continue;
            }
            const capability = capabilityStateOf(n.meta, record);
            result.push({
                id:       String(n.meta['action'] ?? n.path),
                label:    n.title,
                icon:     n.meta['icon'] ? String(n.meta['icon']) : undefined,
                danger:   Boolean(n.meta['danger']),
                disabled: Boolean(n.meta['disabled']) || 'denied' === capability,
                ...('elevate' === capability ? { locked: true } : {}),
                ...('denied' === capability ? { refusal: refusalPhraseOf(n.meta, record) } : {}),
            });
        }
        return result;
    }

}
