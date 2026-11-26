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
    /** One choice of a single choice: drawn with a check on the current one, and said (menuitemradio, aria-checked). */
    checked?:  boolean;
    /** A submenu: the item opens these instead of acting (a node with children, New with its kinds). */
    children?: ContextMenuItem[];
}

/** The item a menu button's menu focuses on opening; `checked` is the current choice, else the first. */
export type ContextMenuFocus = 'first' | 'last' | 'checked';

/** What an item disabled by its node says when the node gives no sentence for it (a server older than the field). */
export const UNWORDED_REASON = 'Not available right now';

const conditionOf = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;

@Injectable({ providedIn: 'root' })
export class ContextMenuService {
    private readonly naviGraph = inject(NaviGraphService);

    readonly menu = signal<{
        x:        number;
        y:        number;
        items:    ContextMenuItem[];
        onAction: (id: string) => void;
        /** Opened from a menu button (openFrom): the item focused on opening, and the button focus returns to. */
        focus?:   ContextMenuFocus;
        opener?:  HTMLElement;
        /** Who opened it, so a menu button can say whether the open menu is its own (aria-expanded). */
        owner?:   unknown;
        /** The menu's accessible name, when it has one. */
        label?:   string;
    } | null>(null);

    /**
     * Open as a menu button's menu: under the button, with focus on the first or the last enabled
     * item, or on the current choice; closing it returns focus to the button.
     */
    openFrom(
        opener:   HTMLElement,
        items:    ContextMenuItem[],
        onAction: (id: string) => void,
        options:  { focus?: ContextMenuFocus; owner?: unknown; label?: string } = {},
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
            ...(options.label === undefined ? {} : { label: options.label }),
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
     *
     * A node whose `disabledWhen` holds for the record is drawn disabled and kept, as on the toolbar, and says the
     * server's sentence for it (`disabledReasonText`) as given; a node that gives none says UNWORDED_REASON. The
     * reason's code (`disabledReason`) is never turned into words here.
     */
    openFromNodes(
        event:    MouseEvent,
        nodes:    NaviGraphNode[],
        record:   Record<string, unknown>,
        onAction: (id: string) => void,
    ): void {
        event.preventDefault();
        event.stopPropagation();

        const visible = this.shown(nodes, record);

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
    /** The nodes a context menu shows: those whose showWhen holds and whose surface includes the menu. */
    private shown(nodes: readonly NaviGraphNode[], record: Record<string, unknown>): NaviGraphNode[] {
        const surface = (n: NaviGraphNode): boolean => {
            const s = n.meta['surface'];
            return s === 'context' || s === 'both' || s === undefined || s === null || s === '';
        };
        return nodes.filter(n => this.naviGraph.isVisible(n, record) && surface(n));
    }

    /**
     * The items for these nodes. A submenu's entries are named by their node's path, which is theirs alone: the
     * entries of one menu share an action (New's kinds are each `new-file`), and the host finds the node by its path.
     */
    private buildItems(nodes: NaviGraphNode[], record: Record<string, unknown>, entries = false): ContextMenuItem[] {
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
            // A node with children is a submenu of its shown children; with none shown it is left out, never empty.
            const children = (n.children ?? []).length === 0 ? null : this.buildItems(this.shown(n.children, record), record, true);
            if (children !== null && children.filter(c => !c.divider).length === 0) continue;
            const capability = capabilityStateOf(n.meta, record);
            const unavailable = conditionOf(n.meta['disabledWhen']);
            const off = unavailable !== null && this.naviGraph.matchesShowWhen(unavailable, record);
            const sentence = n.meta['disabledReasonText'];
            const why = off ? (typeof sentence === 'string' && sentence.trim() !== '' ? sentence : UNWORDED_REASON) : null;
            result.push({
                id:       entries ? n.path : String(n.meta['action'] ?? n.path),
                label:    n.title,
                icon:     n.meta['icon'] ? String(n.meta['icon']) : undefined,
                danger:   Boolean(n.meta['danger']),
                disabled: Boolean(n.meta['disabled']) || 'denied' === capability || off,
                ...('elevate' === capability ? { locked: true } : {}),
                ...('denied' === capability ? { refusal: refusalPhraseOf(n.meta, record) } : why !== null ? { refusal: why } : {}),
                ...(children === null ? {} : { children }),
            });
        }
        return result;
    }

}
