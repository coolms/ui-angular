import { inject, Injectable, signal } from '@angular/core';
import { NaviGraphService, NaviGraphNode } from '@coolms/core-angular';
export interface ContextMenuItem {
    id:        string;
    label?:    string;
    icon?:     string;
    danger?:   boolean;
    disabled?: boolean;
    divider?:  boolean;
}

@Injectable({ providedIn: 'root' })
export class ContextMenuService {
    private readonly naviGraph = inject(NaviGraphService);

    readonly menu = signal<{
        x:        number;
        y:        number;
        items:    ContextMenuItem[];
        onAction: (id: string) => void;
    } | null>(null);

    /**
     * Open with pre-built items — used by DataGrid for row-action menus.
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
     * Open from NaviGraph nodes — evaluates visibility against the given record
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

        const items = this.buildItems(visible);
        if (items.length === 0) { this.close(); return; }
        this.menu.set({
            x: event.clientX,
            y: event.clientY,
            items,
            onAction,
        });
    }

    close(): void { this.menu.set(null); }

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

    private buildItems(nodes: NaviGraphNode[]): ContextMenuItem[] {
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
            result.push({
                id:       String(n.meta['action'] ?? n.path),
                label:    n.title,
                icon:     n.meta['icon'] ? String(n.meta['icon']) : undefined,
                danger:   Boolean(n.meta['danger']),
                disabled: Boolean(n.meta['disabled']),
            });
        }
        return result;
    }

}
