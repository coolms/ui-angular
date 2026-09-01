import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    ViewChild,
    effect,
    inject,
} from '@angular/core';
import { ContextMenuService } from './context-menu.service';
import { EscCoordinatorService } from '../ui/esc-coordinator/esc-coordinator.service';

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
    template: `
        @if (svc.menu(); as ctx) {
            <!-- Invisible backdrop: click or right-click outside closes the menu -->
            <div class="ctx-backdrop"
                 (click)="svc.close()"
                 (contextmenu)="$event.preventDefault(); svc.close()"></div>

            <div #menuEl class="ctx-menu"
                 [style.left.px]="ctx.x"
                 [style.top.px]="ctx.y"
                 (click)="$event.stopPropagation()">

                @for (item of ctx.items; track item.id) {
                    @if (item.divider) {
                        <hr class="ctx-sep">
                    } @else {
                        <button class="ctx-item"
                                [class.ctx-item--danger]="item.danger"
                                [disabled]="item.disabled ?? false"
                                (click)="ctx.onAction(item.id); svc.close()">
                            @if (item.icon) {
                                <i class="bi ctx-icon" [class]="'bi-' + item.icon"></i>
                            }
                            {{ item.label }}
                        </button>
                    }
                }

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
        .ctx-item--danger { color: var(--cms-danger, #dc2626); }
        .ctx-item--danger:hover { background: var(--cms-danger-light); }
        .ctx-icon {
            width: 16px;
            text-align: center;
            font-size: .875rem;
            flex-shrink: 0;
            color: var(--cms-text-muted, #848b96);
        }
        .ctx-item--danger .ctx-icon { color: inherit; }
        .ctx-empty {
            padding: 10px 16px;
            font-size: .8125rem;
            color: var(--cms-text-muted, #848b96);
        }
    `],
})
export class ContextMenuComponent {
    protected readonly svc = inject(ContextMenuService);
    private readonly esc = inject(EscCoordinatorService);

    @ViewChild('menuEl') menuElRef?: ElementRef<HTMLElement>;

    constructor() {
        // Post-render edge-clamp: measure the actual menu rect and shift
        // it back inside the viewport if either edge overflows. Replaces
        // the prior pre-render heuristic (180×38px guess) which under-
        // reported height for menus with many items.
        effect(() => {
            if (!this.svc.menu()) return;
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
            });
        });

        // Phase E3 ( §3): register the menu-close ESC handler
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
            onCleanup(unregister);
        });
    }
}
