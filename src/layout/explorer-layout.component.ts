import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    input,
    OnInit,
    output,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, Subject } from 'rxjs';
import { ConfigService, LayoutConfig, UserPreferencesService } from '@coolms/core-angular';
import { SlotComponent } from '../ui/slot.component';
import { CmsPageFooterComponent } from '../ui/cms-page-footer.component';
import { CmsPageHeaderComponent } from '../ui/cms-page-header.component';
import { ToolbarAction } from '../ui/page-toolbar.component';
import { ExplorerViewMode, toExplorerViewMode } from './explorer-view-mode';

interface PanelSlotConfig {
    component:     string;
    resizable?:    boolean;
    collapsible?:  boolean;
    defaultWidth?: number;
    minWidth?:     number;
    maxWidth?:     number;
    persistKey?:   string;
    openOnSelect?: boolean;
    inputs?:       Record<string, unknown>;
}

/**
 * Generic "explorer" layout: toolbar (ng-content) + resizable left panel +
 * scrollable main area + optional right detail panel + footer status bar.
 *
 * Panel widths and collapse state are restored from / persisted to
 * UserPreferencesService using the `persistKey` from each slot config entry.
 *
 * Right panel visibility: if `openOnSelect: true` in slot config it is only
 * shown when `context()['activeAsset']` is truthy.
 *
 * Usage:
 *   <app-explorer-layout layoutId="media:library" [context]="pageContext()">
 *       <!-- Toolbar projected here -->
 *       <app-page-toolbar ... />
 *   </app-explorer-layout>
 */
@Component({
    selector: 'app-explorer-layout',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SlotComponent, CmsPageFooterComponent, CmsPageHeaderComponent],
    template: `
        <div class="explorer-layout">

            <!-- Page header — rendered from YAML config when title is present,
                 otherwise falls back to projected [explorer-header] content -->
            <div class="explorer-header">
                @if (headerTitle()) {
                    <cms-page-header
                        [title]="headerTitle()!"
                        [icon]="headerIcon() ?? ''"
                        [actions]="headerActions()"
                        (actionClick)="headerActionClick.emit($event)" />
                } @else {
                    <ng-content select="[explorer-header]" />
                }
            </div>

            <!-- Toolbar — projected from the host page -->
            <div class="explorer-toolbar">
                <ng-content />
            </div>

            <!-- Body: left panel | resize | main | resize | right panel -->
            <div class="explorer-body">

                @if (leftSlot(); as cfg) {
                    <!-- Left panel -->
                    <div class="explorer-panel explorer-panel--left"
                         [class.explorer-panel--collapsed]="leftCollapsed()"
                         [style.width.px]="leftCollapsed() ? 0 : leftWidth()">
                        <app-slot [key]="cfg.component" [inputs]="cfg.inputs ?? {}" />
                    </div>

                    @if (cfg.resizable !== false) {
                        <!-- Left resize handle (drag to resize, double-click to collapse) -->
                        <div class="resize-handle"
                             (mousedown)="startResize($event, 'left')"
                             (dblclick)="toggleLeftCollapsed()"
                             [title]="leftCollapsed()
                                 ? 'Double-click to expand'
                                 : 'Drag to resize · Double-click to collapse'">
                        </div>
                    }
                }

                @if (mainSlot(); as cfg) {
                    <div class="explorer-main" (click)="onMainAreaClick($event)">
                        <app-slot [key]="cfg.component" [inputs]="cfg.inputs ?? {}" />
                    </div>
                }

                @if (showRightPanel()) {
                    @if (rightSlot(); as cfg) {
                        @if (cfg.resizable !== false) {
                            <!-- Right resize handle (drag to resize) -->
                            <div class="resize-handle resize-handle--right"
                                 (mousedown)="startResize($event, 'right')"
                                 title="Drag to resize">
                            </div>
                        }

                        <!-- Right detail panel -->
                        <div class="explorer-panel explorer-panel--right"
                             [style.width.px]="rightWidth()">
                            <app-slot [key]="cfg.component" [inputs]="cfg.inputs ?? {}" />
                        </div>
                    }
                }

            </div>

            <div class="explorer-footer">
                <cms-page-footer />
            </div>

        </div>
    `,
    styles: [`
        :host {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }

        .explorer-layout {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }

        .explorer-header {
            flex-shrink: 0;
        }

        .explorer-toolbar {
            flex-shrink: 0;
            padding-top: 8px;
        }

        .explorer-body {
            flex: 1;
            display: flex;
            overflow: hidden;
            min-height: 0;
            border-top: 1px solid var(--cms-border);
        }

        /* -- Panels ------------------------------------------------------- */

        .explorer-panel {
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .explorer-panel--left {
            border-right: 1px solid var(--cms-border);
            transition: width 150ms ease;
        }

        .explorer-panel--collapsed {
            width: 0 !important;
            border-right-width: 0;
        }

        .explorer-panel--right {
            border-left: 1px solid var(--cms-border);
        }

        .explorer-main {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            min-width: 0;
        }

        /* -- Resize handles ----------------------------------------------- */

        .resize-handle {
            width: 5px;
            flex-shrink: 0;
            cursor: col-resize;
            background: transparent;
            position: relative;
            transition: background 0.15s;
            z-index: 2;
        }

        .resize-handle::after {
            content: '';
            position: absolute;
            inset: 0;
            background: var(--cms-accent);
            opacity: 0;
            transition: opacity 0.15s;
        }

        .resize-handle:hover::after { opacity: 0.25; }
        .resize-handle:active::after { opacity: 0.45; }

        /* Right handle sits between main and right panel */
        .resize-handle--right {
            cursor: col-resize;
        }

        .explorer-footer {
            flex-shrink: 0;
        }
    `],
})
export class ExplorerLayoutComponent implements OnInit {
    readonly layoutId      = input.required<string>();
    readonly context       = input<Record<string, unknown>>({});
    readonly headerActions = input<ToolbarAction[]>([]);
    /** Emitted when the user clicks the main content area outside any [data-selectable] element. */
    readonly backgroundClick   = output<void>();
    /** Forwarded from the YAML-driven cms-page-header action clicks. */
    readonly headerActionClick = output<string>();

    private readonly configSvc  = inject(ConfigService);
    private readonly prefsSvc   = inject(UserPreferencesService);
    private readonly destroyRef = inject(DestroyRef);

    // Header metadata (populated from YAML; null = fall back to ng-content projection)
    readonly headerTitle = signal<string | null>(null);
    readonly headerIcon  = signal<string | null>(null);

    /**
     * View modes this explorer offers, from the layout YAML. Empty =
     * no switcher. The host reads these to render the control; the layout does
     * not render it itself, because the mode belongs to whatever draws the
     * items and only the host knows what that is.
     */
    readonly viewModes       = signal<readonly ExplorerViewMode[]>([]);
    readonly defaultViewMode = signal<ExplorerViewMode | null>(null);

    // Slot configs (populated after layout YAML loads)
    readonly leftSlot  = signal<PanelSlotConfig | null>(null);
    readonly mainSlot  = signal<PanelSlotConfig | null>(null);
    readonly rightSlot = signal<PanelSlotConfig | null>(null);

    // Panel size / collapse state
    readonly leftWidth     = signal(220);
    readonly rightWidth    = signal(320);
    readonly leftCollapsed = signal(false);

    /**
     * Right panel is shown when its slot is configured AND (either openOnSelect
     * is false, or context contains a truthy activeAsset).
     */
    readonly showRightPanel = computed(() => {
        const cfg = this.rightSlot();
        if (!cfg) return false;
        if (cfg.openOnSelect) return !!this.context()['activeItem'];
        return true;
    });

    // Persistence subjects (debounced to avoid hammering localStorage on drag)
    private readonly leftSave$  = new Subject<void>();
    private readonly rightSave$ = new Subject<void>();

    // Resize drag state
    private resizing:     'left' | 'right' | null = null;
    private resizeStartX  = 0;
    private resizeStartW  = 0;

    /**
     * Fires backgroundClick when the click lands on the main area but NOT inside
     * any [data-selectable] element.  Consumed by host pages to clear selection.
     */
    onMainAreaClick(event: MouseEvent): void {
        if (!(event.target as HTMLElement).closest('[data-selectable]')) {
            this.backgroundClick.emit();
        }
    }

    ngOnInit(): void {
        this.leftSave$.pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                const cfg = this.leftSlot();
                if (cfg?.persistKey) {
                    this.prefsSvc.setPanelState(cfg.persistKey, this.leftWidth(), this.leftCollapsed());
                }
            });

        this.rightSave$.pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                const cfg = this.rightSlot();
                if (cfg?.persistKey) {
                    this.prefsSvc.setPanelState(cfg.persistKey, this.rightWidth(), false);
                }
            });

        this.configSvc.layout(this.layoutId()).pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(cfg => this.applyConfig(cfg));
    }

    toggleLeftCollapsed(): void {
        this.leftCollapsed.update(v => !v);
        this.leftSave$.next();
    }

    startResize(event: MouseEvent, side: 'left' | 'right'): void {
        event.preventDefault();
        this.resizing     = side;
        this.resizeStartX = event.clientX;
        this.resizeStartW = side === 'left' ? this.leftWidth() : this.rightWidth();

        document.body.classList.add('cms-resizing');

        const onMove = (e: MouseEvent) => this.onResizeMove(e);
        const onUp   = () => {
            this.resizing = null;
            document.body.classList.remove('cms-resizing');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    }

    private applyConfig(cfg: LayoutConfig): void {
        this.headerTitle.set((cfg.title as string) ?? null);
        this.headerIcon.set((cfg.icon  as string) ?? null);

 // — which view modes this explorer offers, declared in YAML.
        // Unknown tokens are DROPPED rather than defaulted: a typo should cost
        // that one button, not silently add a mode the host cannot render.
        // An empty/absent list means "this explorer has no switcher", which is
        // the right answer for a single-rendering pane.
        const declared = Array.isArray(cfg['viewModes']) ? cfg['viewModes'] as unknown[] : [];
        const modes = declared
            .map(toExplorerViewMode)
            .filter((m): m is ExplorerViewMode => null !== m);
        this.viewModes.set(modes);
        this.defaultViewMode.set(
            toExplorerViewMode(cfg['defaultViewMode']) ?? modes[0] ?? null,
        );

        const slots    = (cfg['slots'] ?? {}) as Record<string, PanelSlotConfig>;
        const leftCfg  = slots['content.panel.left']  ?? null;
        const mainCfg  = slots['content.main']        ?? null;
        const rightCfg = slots['content.panel.right'] ?? null;

        this.leftSlot.set(leftCfg);
        this.mainSlot.set(mainCfg);
        this.rightSlot.set(rightCfg);

        if (leftCfg) {
            // A non-resizable panel ignores any persisted width because
            // its width is owned by the layout config, not the user.
            // Otherwise a previously dragged-out width would override
            // the new fixed default the moment we land on the page.
            const saved = leftCfg.persistKey && leftCfg.resizable !== false
                ? this.prefsSvc.getPanelState(leftCfg.persistKey)
                : null;
            this.leftWidth.set(saved?.width       ?? leftCfg.defaultWidth ?? 220);
            this.leftCollapsed.set(saved?.collapsed ?? false);
        }

        if (rightCfg) {
            const saved = rightCfg.persistKey && rightCfg.resizable !== false
                ? this.prefsSvc.getPanelState(rightCfg.persistKey)
                : null;
            this.rightWidth.set(saved?.width ?? rightCfg.defaultWidth ?? 320);
        }
    }

    private onResizeMove(event: MouseEvent): void {
        const delta = event.clientX - this.resizeStartX;

        if (this.resizing === 'left') {
            const cfg = this.leftSlot();
            const min = cfg?.minWidth ?? 140;
            const max = cfg?.maxWidth ?? 400;
            const w   = Math.max(min, Math.min(max, this.resizeStartW + delta));
            this.leftWidth.set(w);
            if (this.leftCollapsed() && w > min + 20) this.leftCollapsed.set(false);
            this.leftSave$.next();
        } else if (this.resizing === 'right') {
            const cfg = this.rightSlot();
            const min = cfg?.minWidth ?? 240;
            const max = cfg?.maxWidth ?? 560;
            // Dragging LEFT grows the right panel (negative delta)
            this.rightWidth.set(Math.max(min, Math.min(max, this.resizeStartW - delta)));
            this.rightSave$.next();
        }
    }
}
