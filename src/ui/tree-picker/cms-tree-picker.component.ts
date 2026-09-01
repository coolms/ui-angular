
import {
    ConnectedPosition,
    Overlay,
    OverlayConfig,
    OverlayRef,
} from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    TemplateRef,
    ViewContainerRef,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs/operators';

import {
    CmsTreePickerNode,
    CmsTreePickerSelection,
    CmsTreePickerSource,
} from './cms-tree-picker.types';

interface PickerEntry<T> {
    readonly kind: 'leaf' | 'group';
    readonly node: CmsTreePickerNode<T>;
    readonly depth: number;
    readonly breadcrumb: ReadonlyArray<string>;
}

const INDENT_BASE_PX = 12;

const INDENT_PER_DEPTH_PX = 16;

const OVERLAY_OFFSET_Y_PX = 2;

const OVERLAY_MAX_HEIGHT_PX = 360;

/**
 * Ship B.X.1 -- generic hierarchical-select primitive.
 *
 * Accepts a `CmsTreePickerSource<T>` adapter and renders an overlay
 * dropdown anchored to a trigger button. The dropdown shows a flat
 * DFS list of group headers (non-clickable, depth-indented) and
 * selectable leaves (clickable). Search filters the entries by
 * label substring; when `pruneEmptyGroups` is true (default),
 * groups without any selectable descendants are skipped.
 *
 * The component is **uncontrolled**: the parent owns the selected
 * value and listens to `valueChange`. The initial `value` input is
 * for trigger display only.
 *
 * Eager vs lazy:
 *   - Eager (default): `source.loadAll()` runs once on first open;
 *     the cached tree powers subsequent searches and reopens.
 *   - Lazy: `source.loadChildren(null)` fetches roots on open. On-
 *     expand hydration is documented as a v1 stub; the first adopter
 *     (notification route picker, B.X.2) is eager-only.
 */
@Component({
    selector: 'cms-tree-picker',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <button
            #trigger
            type="button"
            class="cms-tree-picker__trigger"
            [class.cms-tree-picker__trigger--disabled]="disabled()"
            [attr.aria-haspopup]="'listbox'"
            [attr.aria-expanded]="isOpen()"
            [disabled]="disabled()"
            (click)="onTriggerClick()">
            <span class="cms-tree-picker__trigger-label" [class.cms-tree-picker__trigger-label--empty]="!displayValue()">
                {{ displayValue() ? displayValue()!.label : placeholder() }}
            </span>
            @if (displayValue() && clearable() && !disabled()) {
                <button
                    type="button"
                    class="cms-tree-picker__clear"
                    aria-label="Clear selection"
                    (click)="clearSelection($event)">
                    <i class="bi bi-x"></i>
                </button>
            }
            <i class="bi bi-chevron-down cms-tree-picker__chevron"
               [class.cms-tree-picker__chevron--open]="isOpen()"></i>
        </button>

        <ng-template #dropdown>
            <div class="cms-tree-picker__panel"
                 [style.width.px]="triggerWidth()"
                 (keydown)="onPanelKeydown($event)">
                @if (searchable()) {
                    <div class="cms-tree-picker__search">
                        <i class="bi bi-search cms-tree-picker__search-icon"></i>
                        <input
                            #searchInput
                            type="text"
                            class="cms-tree-picker__search-input"
                            placeholder="Search..."
                            autocomplete="off"
                            [ngModel]="searchQuery()"
                            (ngModelChange)="onSearchChange($event)"
                        />
                    </div>
                }
                @if (loading()) {
                    <div class="cms-tree-picker__loading">Loading...</div>
                } @else if (filteredEntries().length === 0) {
                    <div class="cms-tree-picker__empty">No matches</div>
                } @else {
                    <div class="cms-tree-picker__list" role="listbox">
                        @for (entry of filteredEntries(); track entry.node.id; let i = $index) {
                            @if (entry.kind === 'group') {
                                <div class="cms-tree-picker__group"
                                     [style.padding-left.px]="indentPx(entry.depth)">
                                    {{ entry.node.label }}
                                </div>
                            } @else {
                                <button
                                    type="button"
                                    class="cms-tree-picker__leaf"
                                    [class.cms-tree-picker__leaf--active]="isSameNode(entry.node, displayValue())"
                                    [class.cms-tree-picker__leaf--focused]="focusedIndex() === i"
                                    [style.padding-left.px]="indentPx(entry.depth)"
                                    role="option"
                                    [attr.aria-selected]="isSameNode(entry.node, displayValue())"
                                    (click)="selectEntry(entry)"
                                    (mouseenter)="focusedIndex.set(i)">
                                    {{ entry.node.label }}
                                </button>
                            }
                        }
                    </div>
                }
            </div>
        </ng-template>
    `,
    styles: [`
        :host {
            display: inline-block;
            width: 100%;
        }
        .cms-tree-picker__trigger {
            display: flex;
            align-items: center;
            gap: 6px;
            width: 100%;
            padding: 6px 10px;
            font-size: .875rem;
            line-height: 1.4;
            border: 1px solid var(--cms-border);
            border-radius: var(--cms-radius);
            background: var(--cms-input-bg, #fff);
            color: var(--cms-text);
            cursor: pointer;
            text-align: left;
        }
        .cms-tree-picker__trigger:hover:not(:disabled) {
            border-color: var(--cms-btn-hover-border, var(--cms-border));
        }
        .cms-tree-picker__trigger--disabled,
        .cms-tree-picker__trigger:disabled {
            opacity: .55;
            cursor: not-allowed;
        }
        .cms-tree-picker__trigger-label {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .cms-tree-picker__trigger-label--empty {
            color: var(--cms-text-muted);
        }
        .cms-tree-picker__chevron {
            font-size: .75rem;
            color: var(--cms-text-muted);
            transition: transform .15s ease-out;
        }
        .cms-tree-picker__chevron--open { transform: rotate(180deg); }
        .cms-tree-picker__clear {
            background: none;
            border: 0;
            padding: 0 2px;
            color: var(--cms-text-muted);
            cursor: pointer;
            font-size: .9rem;
            line-height: 1;
        }
        .cms-tree-picker__clear:hover { color: var(--cms-text); }

        /* Dropdown panel rendered through the CDK Overlay portal.
           Default view-encapsulation routes these selectors to the
           portal-mounted DOM via the component's _ngcontent attr. */
        .cms-tree-picker__panel {
            display: flex;
            flex-direction: column;
            max-height: 360px;
            background: var(--cms-surface, #fff);
            border: 1px solid var(--cms-border);
            border-radius: var(--cms-radius);
            box-shadow: var(--cms-shadow-md, 0 4px 12px rgba(0,0,0,.10));
            overflow: hidden;
        }
        .cms-tree-picker__search {
            position: relative;
            display: flex;
            align-items: center;
            padding: 6px 8px;
            border-bottom: 1px solid var(--cms-border);
            flex-shrink: 0;
        }
        .cms-tree-picker__search-icon {
            position: absolute;
            left: 16px;
            color: var(--cms-text-muted);
            font-size: .75rem;
            pointer-events: none;
        }
        .cms-tree-picker__search-input {
            flex: 1;
            width: 100%;
            padding: 4px 8px 4px 24px;
            font-size: .8125rem;
            line-height: 1.4;
            border: 1px solid var(--cms-border);
            border-radius: var(--cms-radius);
            background: var(--cms-input-bg, #fff);
            color: var(--cms-text);
        }
        .cms-tree-picker__search-input:focus {
            outline: 2px solid var(--cms-accent);
            outline-offset: -1px;
        }
        .cms-tree-picker__loading,
        .cms-tree-picker__empty {
            padding: 16px 12px;
            text-align: center;
            color: var(--cms-text-muted);
            font-size: .8125rem;
        }
        .cms-tree-picker__list {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 4px 0;
        }
        .cms-tree-picker__group {
            padding: 6px 12px;
            font-size: .7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: .04em;
            color: var(--cms-text-muted);
            cursor: default;
            user-select: none;
        }
        .cms-tree-picker__leaf {
            display: block;
            width: 100%;
            text-align: left;
            background: none;
            border: 0;
            padding: 6px 12px;
            cursor: pointer;
            color: var(--cms-text);
            font-size: .875rem;
            line-height: 1.4;
        }
        .cms-tree-picker__leaf:hover {
            background: var(--cms-surface-hover, #f3f4f6);
        }
        .cms-tree-picker__leaf--focused {
            background: var(--cms-surface-hover, #f3f4f6);
        }
        .cms-tree-picker__leaf--active {
            background: var(--cms-accent-light);
        }
        .cms-tree-picker__leaf--active.cms-tree-picker__leaf--focused {
            background: var(--cms-accent-light);
        }
    `],
})
export class CmsTreePickerComponent<T = unknown> {
    readonly source = input.required<CmsTreePickerSource<T>>();
    readonly mode = input<'eager' | 'lazy'>('eager');
    readonly placeholder = input<string>('Select...');
    readonly value = input<CmsTreePickerNode<T> | null>(null);
    readonly disabled = input<boolean>(false);
    readonly searchable = input<boolean>(true);
    readonly clearable = input<boolean>(true);
    readonly pruneEmptyGroups = input<boolean>(true);

    readonly valueChange = output<CmsTreePickerSelection<T> | null>();

    protected readonly isOpen = signal<boolean>(false);
    protected readonly searchQuery = signal<string>('');
    protected readonly rootNodes = signal<ReadonlyArray<CmsTreePickerNode<T>>>([]);
    protected readonly loading = signal<boolean>(false);
    protected readonly focusedIndex = signal<number>(-1);
    protected readonly triggerWidth = signal<number>(0);

    /**
     * Internal display mirror of the selected node. Updated on
     * `selectEntry` and `clearSelection` so the trigger label
     * reflects user picks even when the parent runs the picker
     * uncontrolled (does not echo value back via `[value]`). An
     * effect below syncs from the `value` input so parent-driven
     * resets still flow through.
     */
    protected readonly displayValue = signal<CmsTreePickerNode<T> | null>(null);

    protected readonly triggerRef = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
    protected readonly dropdownTpl = viewChild.required<TemplateRef<unknown>>('dropdown');

    private readonly overlay = inject(Overlay);
    private readonly viewContainerRef = inject(ViewContainerRef);
    private readonly destroyRef = inject(DestroyRef);

    private overlayRef: OverlayRef | null = null;
    private hasLoaded = false;

    /**
     * Flat DFS list of group headers + selectable leaves, before
     * search filter. Computed lazily from `rootNodes`.
     */
    protected readonly entries = computed<PickerEntry<T>[]>(() => {
        const out: PickerEntry<T>[] = [];
        this.buildEntries(this.rootNodes(), 0, [], out);
        return out;
    });

    /**
     * `entries` narrowed by the search filter. Empty query passes
     * everything through; non-empty matches `label.includes(query)`
     * case-insensitively against leaf and group labels. Filtering on
     * label-substring means a leaf survives when ITS OWN label
     * matches; group rows survive when their own label matches OR
     * any descendant leaf matches.
     */
    protected readonly filteredEntries = computed<PickerEntry<T>[]>(() => {
        const query = this.searchQuery().trim().toLowerCase();
        if (query.length === 0) {
            return this.entries();
        }
        const all = this.entries();
        // Pre-compute which group ids contain a matching leaf so the
        // group survives even if its own label does not match.
        const matchingGroupIds = new Set<string>();
        for (const entry of all) {
            if (entry.kind === 'leaf' && entry.node.label.toLowerCase().includes(query)) {
                for (let d = 0; d < entry.breadcrumb.length - 1; d++) {
                    // Walk ancestry by looking up groups whose
                    // breadcrumb prefix matches; cheaper than rebuilding
                    // a parent map for v1.
                    const prefix = entry.breadcrumb.slice(0, d + 1).join('/');
                    matchingGroupIds.add(prefix);
                }
            }
        }
        return all.filter((entry) => {
            const labelHit = entry.node.label.toLowerCase().includes(query);
            if (labelHit) {
                return true;
            }
            if (entry.kind === 'group') {
                const prefix = entry.breadcrumb.join('/');
                return matchingGroupIds.has(prefix);
            }
            return false;
        });
    });

    constructor() {
        // Reset focused-leaf cursor whenever the filtered list shape
        // changes so a stale index does not point at the wrong row
        // after a search query mutation.
        effect(() => {
            this.filteredEntries();
            this.focusedIndex.set(-1);
        });

        // Mirror the parent-owned `value` input into the internal
        // display signal so external resets show up in the trigger
        // label. User-driven picks override locally; the next time
        // the parent changes `value`, this effect re-syncs.
        effect(() => this.displayValue.set(this.value()));

        this.destroyRef.onDestroy(() => this.closeOverlay());
    }

    protected onTriggerClick(): void {
        if (this.disabled()) {
            return;
        }
        if (this.isOpen()) {
            this.closeOverlay();
        } else {
            this.openOverlay();
        }
    }

    protected clearSelection(event: Event): void {
        event.stopPropagation();
        this.displayValue.set(null);
        this.valueChange.emit(null);
    }

    protected selectEntry(entry: PickerEntry<T>): void {
        if (entry.kind !== 'leaf') {
            return;
        }
        this.displayValue.set(entry.node);
        this.valueChange.emit({
            node: entry.node,
            breadcrumb: entry.breadcrumb,
        });
        this.closeOverlay();
    }

    protected onSearchChange(value: string): void {
        this.searchQuery.set(value);
        const src = this.source();
        if (this.mode() === 'lazy' && src.searchAll) {
            const query = value.trim();
            if (query.length > 0) {
                this.loading.set(true);
                src.searchAll(query)
                    .pipe(take(1), takeUntilDestroyed(this.destroyRef))
                    .subscribe({
                        next: (nodes) => {
                            this.rootNodes.set(nodes);
                            this.loading.set(false);
                        },
                        error: () => this.loading.set(false),
                    });
            }
        }
    }

    protected onPanelKeydown(event: KeyboardEvent): void {
        const entries = this.filteredEntries();
        const leafIndexes: number[] = [];
        for (let i = 0; i < entries.length; i++) {
            if (entries[i].kind === 'leaf') {
                leafIndexes.push(i);
            }
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.moveFocus(leafIndexes, +1);
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.moveFocus(leafIndexes, -1);
            return;
        }
        if (event.key === 'Enter') {
            const idx = this.focusedIndex();
            if (idx >= 0 && idx < entries.length) {
                event.preventDefault();
                this.selectEntry(entries[idx]);
            }
        }
    }

    protected indentPx(depth: number): number {
        return INDENT_BASE_PX + depth * INDENT_PER_DEPTH_PX;
    }

    protected isSameNode(a: CmsTreePickerNode<T> | null, b: CmsTreePickerNode<T> | null): boolean {
        if (a === null || b === null) {
            return false;
        }
        return a.id === b.id;
    }

    private moveFocus(leafIndexes: number[], step: 1 | -1): void {
        if (leafIndexes.length === 0) {
            return;
        }
        const current = this.focusedIndex();
        const currentPos = leafIndexes.indexOf(current);
        let nextPos: number;
        if (currentPos === -1) {
            nextPos = step === 1 ? 0 : leafIndexes.length - 1;
        } else {
            nextPos = (currentPos + step + leafIndexes.length) % leafIndexes.length;
        }
        this.focusedIndex.set(leafIndexes[nextPos]);
    }

    private openOverlay(): void {
        if (this.overlayRef) {
            return;
        }
        const trigger = this.triggerRef().nativeElement;
        this.triggerWidth.set(trigger.offsetWidth);

        const positions: ConnectedPosition[] = [
            { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: OVERLAY_OFFSET_Y_PX },
            { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -OVERLAY_OFFSET_Y_PX },
        ];
        const positionStrategy = this.overlay.position()
            .flexibleConnectedTo(trigger)
            .withPositions(positions)
            .withPush(true)
            .withFlexibleDimensions(false);

        const config = new OverlayConfig({
            positionStrategy,
            scrollStrategy: this.overlay.scrollStrategies.reposition(),
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-transparent-backdrop',
            maxHeight: OVERLAY_MAX_HEIGHT_PX,
        });

        this.overlayRef = this.overlay.create(config);
        const portal = new TemplatePortal(this.dropdownTpl(), this.viewContainerRef);
        this.overlayRef.attach(portal);
        this.overlayRef.backdropClick()
            .pipe(take(1), takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.closeOverlay());
        this.overlayRef.keydownEvents()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((event) => {
                if (event.key === 'Escape') {
                    this.closeOverlay();
                }
            });
        this.isOpen.set(true);

        this.loadRoots();
    }

    private closeOverlay(): void {
        if (!this.overlayRef) {
            return;
        }
        if (this.overlayRef.hasAttached()) {
            this.overlayRef.detach();
        }
        this.overlayRef.dispose();
        this.overlayRef = null;
        this.isOpen.set(false);
        this.searchQuery.set('');
        this.focusedIndex.set(-1);
    }

    private loadRoots(): void {
        const src = this.source();
        if (this.mode() === 'eager') {
            if (this.hasLoaded) {
                return;
            }
            if (!src.loadAll) {
                console.warn('[CmsTreePicker] eager mode requires `loadAll` on the source.');
                return;
            }
            this.loading.set(true);
            src.loadAll()
                .pipe(take(1), takeUntilDestroyed(this.destroyRef))
                .subscribe({
                    next: (nodes) => {
                        this.rootNodes.set(nodes);
                        this.hasLoaded = true;
                        this.loading.set(false);
                    },
                    error: () => this.loading.set(false),
                });
            return;
        }
        // Lazy mode v1: load root children only. On-expand hydration
        // is documented as a future increment; the first adopter
        // (notification route picker) is eager-only.
        if (!src.loadChildren) {
            console.warn('[CmsTreePicker] lazy mode requires `loadChildren` on the source.');
            return;
        }
        this.loading.set(true);
        src.loadChildren(null)
            .pipe(take(1), takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (nodes) => {
                    this.rootNodes.set(nodes);
                    this.loading.set(false);
                },
                error: () => this.loading.set(false),
            });
    }

    /**
     * Group-pruning predicate. Returns true when the subtree rooted
     * at `node` contains at least one selectable leaf (transitively)
     * so empty branches can be skipped before their group header is
     * emitted.
     */
    private hasSelectableDescendant(node: CmsTreePickerNode<T>): boolean {
        if (node.selectable) {
            return true;
        }
        if (!node.children) {
            return false;
        }
        return node.children.some((c) => this.hasSelectableDescendant(c));
    }

    private buildEntries(
        nodes: ReadonlyArray<CmsTreePickerNode<T>>,
        depth: number,
        parentBreadcrumb: ReadonlyArray<string>,
        out: PickerEntry<T>[],
    ): void {
        const prune = this.pruneEmptyGroups();
        for (const node of nodes) {
            const breadcrumb = [...parentBreadcrumb, node.label];

            if (node.selectable) {
                out.push({ kind: 'leaf', node, depth, breadcrumb });
                // v1 contract: selectable nodes do not recurse into
                // their own children. Adapters use selectable=false to
                // mark pure section headers.
                continue;
            }

            if (!node.children || node.children.length === 0) {
                continue;
            }
            if (prune && !node.children.some((c) => this.hasSelectableDescendant(c))) {
                continue;
            }

            out.push({ kind: 'group', node, depth, breadcrumb });
            this.buildEntries(node.children, depth + 1, breadcrumb, out);
        }
    }
}
