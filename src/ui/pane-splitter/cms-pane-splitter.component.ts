import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    HostListener,
    Renderer2,
    afterNextRender,
    inject,
    input,
    output,
} from '@angular/core';

/**
 * Reusable pane splitter — a thin vertical drag bar dropped BETWEEN two flex
 * children of a horizontal flex row. Dragging it resizes the pane immediately
 * before it (its `previousElementSibling`); the pane after it absorbs the change
 * (so give the trailing pane `flex: 1`).
 *
 * Placed as a sibling rather than a child handle, it is never clipped by a pane's
 * `overflow` and never overlaps a pane's scrollbar. It renders as a 1px divider
 * (replacing the panes' own border) that thickens to an accent bar on hover/drag,
 * with a comfortable ~7px hit area.
 *
 * ```html
 * <aside class="rail">…</aside>
 * <cms-pane-splitter [minWidth]="180" [maxWidth]="360" storageKey="email.rail" />
 * <section class="list" style="flex:1">…</section>
 * ```
 *
 * The chosen width persists to `localStorage` under {@link storageKey} (omit to
 * not persist) and is re-applied on load. Double-click clears it and restores the
 * pane's stylesheet default width.
 */
@Component({
    selector: 'cms-pane-splitter',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: '<div class="splitter__line"></div>',
    styles: [`
        :host {
            flex: 0 0 7px; align-self: stretch; display: flex; align-items: stretch; justify-content: center;
            cursor: col-resize; touch-action: none; user-select: none; position: relative; z-index: 5;
        }
        .splitter__line { width: 1px; background: var(--cms-border); transition: background .12s ease, width .12s ease; }
        :host(:hover) .splitter__line,
        :host(.cms-splitter--dragging) .splitter__line { width: 3px; background: var(--cms-accent, #F5A623); }
    `],
})
export class CmsPaneSplitterComponent {
    /** Lower bound for the resized (previous) pane, in px. */
    readonly minWidth = input<number>(160);
    /** Upper bound for the resized (previous) pane, in px. */
    readonly maxWidth = input<number>(640);
    /** localStorage key to persist the chosen width; omit/'' to not persist. */
    readonly storageKey = input<string>('');

    /**
     * Which sibling this splitter resizes. `'start'` (default) resizes the pane
     * BEFORE it (a leading rail; give the trailing pane `flex:1`). `'end'` resizes
     * the pane AFTER it (a trailing rail; give the leading pane `flex:1`) — the
     * drag inverts so pulling the bar toward the rail shrinks it, as expected.
     */
    readonly side = input<'start' | 'end'>('start');

    /** Emits the final pane width (px, clamped) at the end of a drag. */
    readonly widthChange = output<number>();

    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    private readonly renderer = inject(Renderer2);

    private startX = 0;
    private startWidth = 0;
    private dragging = false;
    // Bound once so add/removeEventListener target the same references.
    private readonly onMove = (e: PointerEvent): void => this.move(e);
    private readonly onUp = (): void => this.up();

    constructor() {
        inject(DestroyRef).onDestroy(() => this.teardown());
        // Apply any persisted width once the sibling panes are in the DOM.
        afterNextRender(() => {
            const saved = this.readSaved();
            if (saved !== null) {
                this.applyWidth(saved);
            }
        });
    }

    @HostListener('pointerdown', ['$event'])
    onPointerDown(e: PointerEvent): void {
        const pane = this.pane();
        if (pane === null) {
            return;
        }
        e.preventDefault();
        this.dragging = true;
        this.startX = e.clientX;
        this.startWidth = pane.offsetWidth;
        this.renderer.addClass(this.host, 'cms-splitter--dragging');
        // Kill text selection + force a global resize cursor for the whole drag.
        this.renderer.setStyle(document.body, 'user-select', 'none');
        this.renderer.setStyle(document.body, 'cursor', 'col-resize');
        window.addEventListener('pointermove', this.onMove);
        window.addEventListener('pointerup', this.onUp);
    }

    /** Double-click restores the pane's stylesheet default (clears the inline + saved width). */
    @HostListener('dblclick')
    onDblclick(): void {
        const pane = this.pane();
        if (pane === null) {
            return;
        }
        this.renderer.removeStyle(pane, 'flex');
        this.renderer.removeStyle(pane, 'width');
        const key = this.storageKey();
        if (key !== '') {
            try {
                localStorage.removeItem(key);
            } catch {
                /* storage denied — nothing to clear */
            }
        }
    }

    /** The pane this splitter resizes: the sibling on its {@link side}. */
    private pane(): HTMLElement | null {
        const el = this.side() === 'end' ? this.host.nextElementSibling : this.host.previousElementSibling;
        return el instanceof HTMLElement ? el : null;
    }

    private move(e: PointerEvent): void {
        if (!this.dragging) {
            return;
        }
        // For a trailing rail the geometry inverts: dragging the bar left (dx<0)
        // must GROW the pane that sits to the splitter's right.
        const dx = e.clientX - this.startX;
        const delta = this.side() === 'end' ? -dx : dx;
        this.applyWidth(this.clamp(this.startWidth + delta));
    }

    private up(): void {
        if (!this.dragging) {
            return;
        }
        this.dragging = false;
        this.renderer.removeClass(this.host, 'cms-splitter--dragging');
        this.renderer.removeStyle(document.body, 'user-select');
        this.renderer.removeStyle(document.body, 'cursor');
        window.removeEventListener('pointermove', this.onMove);
        window.removeEventListener('pointerup', this.onUp);
        const pane = this.pane();
        if (pane !== null) {
            const w = pane.offsetWidth;
            this.writeSaved(w);
            this.widthChange.emit(w);
        }
    }

    private applyWidth(w: number): void {
        const pane = this.pane();
        if (pane === null) {
            return;
        }
        this.renderer.setStyle(pane, 'flex', `0 0 ${w}px`);
        this.renderer.setStyle(pane, 'width', `${w}px`);
    }

    private clamp(w: number): number {
        return Math.min(this.maxWidth(), Math.max(this.minWidth(), w));
    }

    private readSaved(): number | null {
        const key = this.storageKey();
        if (key === '') {
            return null;
        }
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) {
                return null;
            }
            const n = Number(raw);
            return Number.isFinite(n) ? this.clamp(n) : null;
        } catch {
            return null;
        }
    }

    private writeSaved(w: number): void {
        const key = this.storageKey();
        if (key === '') {
            return;
        }
        try {
            localStorage.setItem(key, String(Math.round(w)));
        } catch {
            /* storage full/denied — persistence is best-effort */
        }
    }

    private teardown(): void {
        window.removeEventListener('pointermove', this.onMove);
        window.removeEventListener('pointerup', this.onUp);
        if (this.dragging) {
            this.renderer.removeStyle(document.body, 'user-select');
            this.renderer.removeStyle(document.body, 'cursor');
        }
    }
}
