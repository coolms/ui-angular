import { DestroyRef, Directive, HostListener, inject, input, output } from '@angular/core';

/**
 * Selection model picked by the consumer based on its UX:
 *   - `single` (Document): one item at a time; click replaces.
 *   - `toggle` (Media): multi-select via Ctrl/Meta; Shift behaves
 *     like Ctrl in this mode (no range).
 *   - `range` (VFS): Ctrl toggles; Shift+click emits
 *     `rangeSelectionRequested` so the consumer can compute the
 *     range against its own ordered data.
 *   - `mailbox` (Notification drawer): plain click activates (no
 *     selection change); Ctrl toggles add/remove; Shift requests
 *     a range; dblclick mirrors plain click so plain click fires
 *     immediately with no dblclick disambiguation.
 */
export type CmsItemSelectionMode = 'single' | 'toggle' | 'range' | 'mailbox';

export interface CmsSelectionChange<T> {
    selection: readonly T[];
    newAnchor: T | null;
}

export interface CmsRangeSelectionRequest<T> {
    from: T;
    to: T;
    modifier: 'replace' | 'add';
}

/**
 * Shared item-interactions primitive. Normalizes click /
 * dblclick / contextmenu on any list item across the four selection
 * models the admin SPA uses (Document single, Media toggle, VFS
 * range, Notification mailbox). Selection storage stays on the
 * consumer's signal -- the directive only computes the next state
 * based on the incoming event + the consumer's `currentSelection`
 * input and emits the change.
 *
 * Single-click is delayed by `dblclickDelay` ms (default 250) so a
 * dblclick within the window cancels it. Modifier-keyed clicks and
 * right-clicks fire immediately (modifier indicates intent).
 *
 * Mailbox mode bypasses the dblclick delay on plain clicks too: in
 * mailbox semantics plain click and dblclick both emit `activated`,
 * so there is nothing to disambiguate and delaying would only add
 * latency.
 */
@Directive({ selector: '[cmsItemInteractions]', standalone: true })
export class CmsItemInteractionsDirective<T> {
    readonly cmsItem = input.required<T>();
    readonly selectionMode = input<CmsItemSelectionMode>('single');
    readonly currentSelection = input<readonly T[]>([]);
    readonly rangeAnchor = input<T | null>(null);
    readonly dblclickDelay = input<number>(250);

    readonly selectionChanged = output<CmsSelectionChange<T>>();
    readonly rangeSelectionRequested = output<CmsRangeSelectionRequest<T>>();
    readonly activated = output<T>();
    readonly contextMenuRequested = output<{ item: T; event: MouseEvent }>();

    private pendingSingleClick: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        inject(DestroyRef).onDestroy(() => this.cancelPending());
    }

    @HostListener('click', ['$event'])
    onClick(event: MouseEvent): void {
        if (this.selectionMode() === 'mailbox') {
            // Mailbox plain click == dblclick (both `activated`), so no
            // disambiguation window is needed and the delay would only
            // add latency. Modifier branches handled inside applyClick.
            this.applyClick(event);
            return;
        }
        const modified = event.ctrlKey || event.metaKey || event.shiftKey;
        if (modified) {
            // Modifier-keyed click -- intent is explicit, fire now.
            this.applyClick(event);
            return;
        }
        const delay = this.dblclickDelay();
        if (delay <= 0) {
            this.applyClick(event);
            return;
        }
        this.cancelPending();
        this.pendingSingleClick = setTimeout(() => {
            this.pendingSingleClick = null;
            this.applyClick(event);
        }, delay);
    }

    @HostListener('dblclick', ['$event'])
    onDblclick(event: MouseEvent): void {
        event.preventDefault();
        this.cancelPending();
        this.activated.emit(this.cmsItem());
    }

    @HostListener('contextmenu', ['$event'])
    onContextMenu(event: MouseEvent): void {
        event.preventDefault();
        this.cancelPending();
        this.applyRightClick(event);
        this.contextMenuRequested.emit({ item: this.cmsItem(), event });
    }

    private cancelPending(): void {
        if (this.pendingSingleClick !== null) {
            clearTimeout(this.pendingSingleClick);
            this.pendingSingleClick = null;
        }
    }

    private applyClick(event: MouseEvent): void {
        const item = this.cmsItem();
        const mode = this.selectionMode();
        const current = this.currentSelection();
        const ctrl = event.ctrlKey || event.metaKey;
        const shift = event.shiftKey;

        switch (mode) {
            case 'single':
                this.selectionChanged.emit({ selection: [item], newAnchor: item });
                return;

            case 'toggle': {
                if (ctrl || shift) {
                    // Ctrl or Shift add/remove (Shift treated as Ctrl in toggle mode).
                    const without = current.filter((i) => i !== item);
                    const next = without.length === current.length ? [...current, item] : without;
                    this.selectionChanged.emit({ selection: next, newAnchor: item });
                    return;
                }
                this.selectionChanged.emit({ selection: [item], newAnchor: item });
                return;
            }

            case 'range': {
                if (shift) {
                    const anchor = this.rangeAnchor();
                    if (anchor === null) {
                        // No anchor yet -- fall back to plain click semantics.
                        this.selectionChanged.emit({ selection: [item], newAnchor: item });
                        return;
                    }
                    this.rangeSelectionRequested.emit({
                        from: anchor,
                        to: item,
                        modifier: ctrl ? 'add' : 'replace',
                    });
                    return;
                }
                if (ctrl) {
                    const without = current.filter((i) => i !== item);
                    const next = without.length === current.length ? [...current, item] : without;
                    this.selectionChanged.emit({ selection: next, newAnchor: item });
                    return;
                }
                this.selectionChanged.emit({ selection: [item], newAnchor: item });
                return;
            }

            case 'mailbox': {
                if (shift) {
                    const anchor = this.rangeAnchor();
                    if (anchor === null) {
                        // No anchor yet -- mailbox falls back to
                        // activation rather than a synthetic single-
                        // item selection (mailbox's primary action is
                        // activation, not selection).
                        this.activated.emit(item);
                        return;
                    }
                    this.rangeSelectionRequested.emit({
                        from: anchor,
                        to: item,
                        modifier: ctrl ? 'add' : 'replace',
                    });
                    return;
                }
                if (ctrl) {
                    const without = current.filter((i) => i !== item);
                    const next = without.length === current.length ? [...current, item] : without;
                    this.selectionChanged.emit({ selection: next, newAnchor: item });
                    return;
                }
                this.activated.emit(item);
                return;
            }
        }
    }

    /**
     * Right-click selection update before the context menu opens.
     * Matches typical OS file-manager behaviour: right-clicking an
     * already-selected item preserves the selection (so a multi-file
     * "Delete" works); right-clicking an unselected item replaces.
     */
    private applyRightClick(_event: MouseEvent): void {
        const item = this.cmsItem();
        const current = this.currentSelection();
        if (current.includes(item)) {
            return;
        }
        this.selectionChanged.emit({ selection: [item], newAnchor: item });
    }
}
