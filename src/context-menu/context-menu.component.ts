import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    ViewChild,
    effect,
    inject,
    signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ContextMenuService, type ContextMenuItem } from './context-menu.service';
import { EscCoordinatorService } from '../ui/esc-coordinator/esc-coordinator.service';
import { KeyboardScopeService } from '../ui/keyboard-scope/keyboard-scope.service';

/**
 * Generic right-click context menu rendered at a fixed screen position.
 *
 * Included once in AdminLayoutComponent so it floats above all content.
 * Populated via ContextMenuService.open() or ContextMenuService.openFromNodes().
 *
 * Touch devices: the action column is restored via @media (hover: none) CSS
 * in the datagrid, so this menu is not needed there.
 */
@Component({
    selector: 'coolms-context-menu',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgTemplateOutlet],
    template: `
        @if (svc.menu(); as ctx) {
            <!-- Invisible backdrop: click or right-click outside closes the menu -->
            <div class="ctx-backdrop"
                 (click)="svc.close()"
                 (contextmenu)="$event.preventDefault(); svc.close()"></div>

            <div #menuEl class="ctx-menu"
                 role="menu"
                 [style.left.px]="ctx.x"
                 [style.top.px]="ctx.y"
                 (click)="$event.stopPropagation()"
                 (keydown)="onKeydown($event)">

                @for (item of ctx.items; track item.id) {
                    @if (item.divider) {
                        <hr class="ctx-sep" role="separator">
                    } @else {
                        <div class="ctx-row" (mouseenter)="hover(item)">
                            <ng-container [ngTemplateOutlet]="entry" [ngTemplateOutletContext]="{ $implicit: item, top: true }" />
                            @if (item.children && openSub() === item.id) {
                                <div class="ctx-menu ctx-submenu" role="menu" [attr.aria-label]="item.label">
                                    @for (child of item.children; track child.id) {
                                        @if (child.divider) {
                                            <hr class="ctx-sep" role="separator">
                                        } @else {
                                            <ng-container [ngTemplateOutlet]="entry" [ngTemplateOutletContext]="{ $implicit: child, top: false }" />
                                        }
                                    }
                                </div>
                            }
                        </div>
                    }
                }

                <ng-template #entry let-item let-top="top">
                    <button class="ctx-item"
                            role="menuitem"
                            tabindex="-1"
                            [class.ctx-item--danger]="item.danger"
                            [class.ctx-item--locked]="item.locked"
                            [class.ctx-item--parent]="item.children"
                            [attr.aria-haspopup]="item.children ? 'menu' : null"
                            [attr.aria-expanded]="item.children ? openSub() === item.id : null"
                            [disabled]="item.disabled ?? false"
                            [attr.title]="item.locked ? item.label + ' \u2014 needs an elevated session'
                                : (item.refusal ? item.label + ' \u2014 ' + item.refusal : null)"
                            (click)="choose(item, top)">
                        @if (item.icon) {
                            <i class="bi ctx-icon" [class]="'bi-' + item.icon"></i>
                        }
                        {{ item.label }}
                        @if (item.locked) {
                            <i class="bi bi-lock-fill ctx-lock" aria-hidden="true"></i>
                            <span class="ctx-sr"> (needs an elevated session)</span>
                        } @else if (item.refusal) {
                            <span class="ctx-sr"> ({{ item.refusal }})</span>
                        }
                        @if (item.children) {
                            <i class="bi bi-chevron-right ctx-caret" aria-hidden="true"></i>
                        }
                    </button>
                </ng-template>

                @if (ctx.items.length === 0) {
                    <div class="ctx-empty">No actions available</div>
                }
            </div>
        }
    `,
    styles: [`
        .ctx-backdrop {
            position: fixed;
            inset: 0;
            z-index: 9998;
        }
        .ctx-menu {
            position: fixed;
            z-index: 9999;
            background: var(--cms-surface);
            border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius-lg, 10px);
            box-shadow: 0 8px 24px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.06);
            min-width: 160px;
            padding: 4px 0;
            animation: ctx-appear 80ms ease;
        }
        @keyframes ctx-appear {
            from { opacity: 0; transform: scale(.97) translateY(-4px); }
            to   { opacity: 1; transform: scale(1)  translateY(0); }
        }
        .ctx-sep {
            margin: 4px 0;
            border-color: var(--cms-border, #e5e7eb);
        }
        .ctx-item {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            padding: 8px 16px;
            background: none;
            border: none;
            text-align: left;
            font-size: .875rem;
            cursor: pointer;
            color: var(--cms-text, #111827);
            transition: background 80ms;
            white-space: nowrap;
        }
        .ctx-item:hover { background: var(--cms-border-light, #f0f2f5); }
        .ctx-item:disabled { opacity: .45; cursor: default; }
        .ctx-item--danger { color: var(--cms-danger, #b91c1c); }
        .ctx-item--danger:hover { background: var(--cms-danger-light); }
        .ctx-icon {
            width: 16px;
            text-align: center;
            font-size: .875rem;
            flex-shrink: 0;
            color: var(--cms-text-muted, #4b5563);
        }
        .ctx-item--danger .ctx-icon { color: inherit; }
        /* Allowed once elevated: the lock sits at the item's far end. */
        .ctx-lock {
            margin-left: auto;
            font-size: .75rem;
            color: var(--cms-text-muted, #4b5563);
        }
        /* The lock's meaning, for a screen reader only. */
        .ctx-sr {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }
        /* A submenu opens beside its item, at the item's top. */
        .ctx-row { position: relative; }
        .ctx-submenu { position: absolute; left: 100%; top: -5px; margin-left: 2px; }
        .ctx-caret { margin-left: auto; font-size: .625rem; color: var(--cms-text-muted, #4b5563); }
        .ctx-empty {
            padding: 10px 16px;
            font-size: .8125rem;
            color: var(--cms-text-muted, #4b5563);
        }
    `],
})
export class ContextMenuComponent {
    protected readonly svc = inject(ContextMenuService);
    private readonly esc = inject(EscCoordinatorService);
    private readonly keyboardScope = inject(KeyboardScopeService);
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

    @ViewChild('menuEl') menuElRef?: ElementRef<HTMLElement>;

    /** The item whose submenu is open, if one is. */
    protected readonly openSub = signal<string | null>(null);

    /** A press: an item with children opens its submenu (focus on its first enabled entry); any other acts and closes. */
    protected choose(item: ContextMenuItem, top: boolean): void {
        if (top && item.children) {
            this.open(item.id);
            return;
        }
        this.svc.menu()?.onAction(item.id);
        this.svc.close();
    }

    /** The pointer on a row: its submenu opens, another row's closes. */
    protected hover(item: ContextMenuItem): void {
        this.openSub.set(item.children && !item.disabled ? item.id : null);
    }

    private open(id: string): void {
        this.openSub.set(id);
        setTimeout(() => this.subItems()[0]?.focus());
    }

    constructor() {
        // Post-render edge-clamp: measure the actual menu rect and shift
        // it back inside the viewport if either edge overflows. Replaces
        // the prior pre-render heuristic (180x38px guess) which under-
        // reported height for menus with many items.
        effect(() => {
            if (!this.svc.menu()) {
                this.openSub.set(null);
                return;
            }
            setTimeout(() => {
                const el = this.menuElRef?.nativeElement;
                const m = this.svc.menu();
                if (!el || !m) return;
                const rect = el.getBoundingClientRect();
                const margin = 8;
                const newX = rect.right + margin > window.innerWidth
                    ? Math.max(0, window.innerWidth - rect.width - margin)
                    : m.x;
                const newY = rect.bottom + margin > window.innerHeight
                    ? Math.max(0, window.innerHeight - rect.height - margin)
                    : m.y;
                this.svc.setPosition(newX, newY);
                if (m.focus) this.items()[m.focus === 'first' ? 0 : this.items().length - 1]?.focus();
            });
        });

        // Phase E3 ( section 3): register the menu-close ESC handler
        // only while a menu is actually open. Pushes onto the
        // EscCoordinator stack on open; pops on close. When the
        // Document Properties panel is also open, the menu's handler
        // registers LATER (open is user-driven, panel is already
        // open) -> LIFO fires it first -> menu closes, panel stays.
        // Fixes #4.8 double-close.
        effect((onCleanup) => {
            if (!this.svc.menu()) {
                return;
            }
            const unregister = this.esc.register(() => {
                this.svc.close();
                return true;
            });
            // While the menu is open it is the topmost surface: no shortcut of the view under it fires (Del on the
            // file manager's selection, 2026-10-14). ESC above still reaches it.
            const dropLayer = this.keyboardScope.pushLayer(this.host.nativeElement);
            onCleanup(() => {
                unregister();
                dropLayer();
            });
        });
    }

    /** The menu's own enabled items, in order (a submenu's not among them): what Up, Down, Home and End move between. */
    private items(): HTMLButtonElement[] {
        const el = this.menuElRef?.nativeElement;

        return el ? Array.from(el.querySelectorAll<HTMLButtonElement>(':scope > .ctx-row > .ctx-item:not(:disabled)')) : [];
    }

    /** The open submenu's enabled items, in order. */
    private subItems(): HTMLButtonElement[] {
        const el = this.menuElRef?.nativeElement;

        return el ? Array.from(el.querySelectorAll<HTMLButtonElement>('.ctx-submenu .ctx-item:not(:disabled)')) : [];
    }

    /**
     * Up and Down move between the items of the level the focus is in, Home and End to its first and last; Right or
     * Enter on an item with a submenu opens it, Left closes it back to its item; Tab closes the menu.
     */
    protected onKeydown(event: KeyboardEvent): void {
        if (event.key === 'Tab') {
            this.svc.close();
            return;
        }
        const active = document.activeElement as HTMLButtonElement | null;
        const inSub = !!active?.closest('.ctx-submenu');
        if (inSub && event.key === 'ArrowLeft') {
            event.preventDefault();
            const parent = active?.closest('.ctx-row')?.querySelector<HTMLButtonElement>(':scope > .ctx-item');
            this.openSub.set(null);
            parent?.focus();
            return;
        }
        if (!inSub && (event.key === 'ArrowRight' || event.key === 'Enter') && active?.getAttribute('aria-haspopup') === 'menu') {
            event.preventDefault();
            // The rows are the menu's items without its separators, in order.
            const row = active.closest('.ctx-row');
            const index = row ? Array.from(this.menuElRef?.nativeElement.querySelectorAll(':scope > .ctx-row') ?? []).indexOf(row) : -1;
            const target = index >= 0 ? (this.svc.menu()?.items ?? []).filter(i => !i.divider)[index] : undefined;
            if (target?.children) this.open(target.id);
            return;
        }
        const items = inSub ? this.subItems() : this.items();
        if (items.length === 0) return;
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown' ? (at + 1) % items.length
            : event.key === 'ArrowUp' ? (at <= 0 ? items.length - 1 : at - 1)
            : event.key === 'Home' ? 0
            : event.key === 'End' ? items.length - 1
            : null;
        if (next === null) return;
        event.preventDefault();
        items[next].focus();
    }
}
