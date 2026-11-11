import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    HostListener,
    Renderer2,
    afterNextRender,
    effect,
    inject,
    input,
    output,
    signal,
    untracked,
} from '@angular/core';

/** How far one press of ArrowLeft or ArrowRight moves the splitter, in px. */
export const PANE_SPLITTER_KEY_STEP = 16;

/** The keys that move the splitter; releasing one ends the move. */
const MOVE_KEYS: ReadonlySet<string> = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

/**
 * Reusable pane splitter -- a thin vertical drag bar dropped BETWEEN two flex
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
 * <aside class="rail">...</aside>
 * <cms-pane-splitter [minWidth]="180" [maxWidth]="360" storageKey="email.rail" ariaLabel="Resize folders" />
 * <section class="list" style="flex:1">...</section>
 * ```
 *
 * It is a focusable separator: role separator, vertical, its value the pane's
 * width in px between {@link minWidth} and {@link maxWidth}. ArrowLeft and
 * ArrowRight move it by {@link PANE_SPLITTER_KEY_STEP} px, Home and End take
 * the pane to its limits, Enter resets it like a double-click.
 *
 * The chosen width persists to `localStorage` under {@link storageKey} (omit to
 * not persist) and is re-applied on load. Double-click (or Enter) clears it and
 * restores the pane's stylesheet default width. A host that keeps the width
 * elsewhere sets it with {@link width} and hears the final one on
 * {@link widthChange}.
 */
@Component({
    selector: 'cms-pane-splitter',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: '<div class="splitter__line"></div>',
    host: {
        'role': 'separator',
        'tabindex': '0',
        'aria-orientation': 'vertical',
        '[attr.aria-valuenow]': 'valueNow()',
        '[attr.aria-valuemin]': 'minWidth()',
        '[attr.aria-valuemax]': 'maxWidth()',
        '[attr.aria-label]': 'ariaLabel() || null',
    },
    styles: [`
        :host {
            flex: 0 0 7px; align-self: stretch; display: flex; align-items: stretch; justify-content: center;
            cursor: col-resize; touch-action: none; user-select: none; position: relative; z-index: 5;
        }
        :host(:focus) { outline: none; }
        :host(:focus-visible) { outline: 2px solid var(--cms-focus-ring, #7c4d00); outline-offset: -2px; }
        .splitter__line { width: 1px; background: var(--cms-border); transition: background .12s ease, width .12s ease; }
        :host(:hover) .splitter__line,
        :host(:focus-visible) .splitter__line,
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
    /** The separator's accessible name, e.g. "Resize folders"; omit for none. */
    readonly ariaLabel = input<string>('');
    /**
     * The pane's width set from outside, in px (clamped to the limits); null
     * leaves it to the stylesheet and the saved width. Applied whenever it
     * changes, and it wins over the saved width.
     */
    readonly width = input<number | null>(null);

    /**
     * Which sibling this splitter resizes. `'start'` (default) resizes the pane
     * BEFORE it (a leading rail; give the trailing pane `flex:1`). `'end'` resizes
     * the pane AFTER it (a trailing rail; give the leading pane `flex:1`) -- the
     * drag inverts so pulling the bar toward the rail shrinks it, as expected.
     */
    readonly side = input<'start' | 'end'>('start');

    /**
     * Emits the final pane width (px, clamped) when a drag ends, when a key that
     * moved the splitter is released, and after a reset (double-click or Enter).
     */
    readonly widthChange = output<number>();

    /** The pane's current width in px, as aria-valuenow; null until measured. */
    protected readonly valueNow = signal<number | null>(null);

    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    private readonly renderer = inject(Renderer2);

    private startX = 0;
    private startWidth = 0;
    private dragging = false;
    /** A key moved the splitter and has not been released yet. */
    private keyMoved = false;
    // Bound once so add/removeEventListener target the same references.
    private readonly onMove = (e: PointerEvent): void => this.move(e);
    private readonly onUp = (): void => this.up();

    constructor() {
        inject(DestroyRef).onDestroy(() => this.teardown());
        // A width set from outside is applied whenever it (or a limit) changes.
        effect(() => {
            const w = this.width();
            if (w !== null) {
                const clamped = this.clamp(w);
                untracked(() => this.applyWidth(clamped));
            }
        });
        // Once the sibling panes are in the DOM: the width set from outside, else
        // the persisted width, else the stylesheet's, measured for aria-valuenow.
        afterNextRender(() => {
            const outside = this.width();
            const saved = outside === null ? this.readSaved() : null;
            if (outside !== null) {
                this.applyWidth(this.clamp(outside));
            } else if (saved !== null) {
                this.applyWidth(saved);
            } else {
                this.measure();
            }
        });
    }

    @HostListener('pointerdown', ['$event'])
    onPointerDown(e: PointerEvent): void {
        const pane = this.pane();
        if (pane === null) {
            return;
        }
        // No text selection and no native touch scroll or drag from here on.
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
        window.addEventListener('pointercancel', this.onUp);
    }

    /** Double-click restores the pane's stylesheet default (clears the inline + saved width). */
    @HostListener('dblclick')
    onDblclick(): void {
        this.reset();
    }

    /** Arrows move by a step, Home and End go to the limits, Enter resets. */
    @HostListener('keydown', ['$event'])
    onKeydown(e: KeyboardEvent): void {
        const pane = this.pane();
        if (pane === null) {
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            this.reset();
            return;
        }
        if (!MOVE_KEYS.has(e.key)) {
            return;
        }
        // For a trailing rail the arrows invert, as the drag does.
        const step = this.side() === 'end' ? -PANE_SPLITTER_KEY_STEP : PANE_SPLITTER_KEY_STEP;
        const current = pane.offsetWidth;
        const next = e.key === 'ArrowLeft' ? current - step
            : e.key === 'ArrowRight' ? current + step
            : e.key === 'Home' ? this.minWidth()
            : this.maxWidth();
        // Home and End would otherwise scroll the page.
        e.preventDefault();
        this.applyWidth(this.clamp(next));
        this.keyMoved = true;
    }

    /** The key that moved the splitter is released: the width is final. */
    @HostListener('keyup', ['$event'])
    onKeyup(e: KeyboardEvent): void {
        if (!this.keyMoved || !MOVE_KEYS.has(e.key)) {
            return;
        }
        this.keyMoved = false;
        this.finish();
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
        window.removeEventListener('pointercancel', this.onUp);
        this.finish();
    }

    /** Saves and emits the pane's width at the end of a drag or a key. */
    private finish(): void {
        const pane = this.pane();
        if (pane !== null) {
            const w = pane.offsetWidth;
            this.writeSaved(w);
            this.widthChange.emit(w);
        }
    }

    /** Puts the pane back at its stylesheet default, clears the saved width and emits the default. */
    private reset(): void {
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
                /* storage denied -- nothing to clear */
            }
        }
        const w = pane.offsetWidth;
        this.valueNow.set(w);
        this.widthChange.emit(w);
    }

    private applyWidth(w: number): void {
        const pane = this.pane();
        if (pane === null) {
            return;
        }
        this.renderer.setStyle(pane, 'flex', `0 0 ${w}px`);
        this.renderer.setStyle(pane, 'width', `${w}px`);
        this.valueNow.set(Math.round(w));
    }

    /** Reads the pane's stylesheet width into aria-valuenow. */
    private measure(): void {
        const pane = this.pane();
        if (pane !== null) {
            this.valueNow.set(pane.offsetWidth);
        }
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
            /* storage full/denied -- persistence is best-effort */
        }
    }

    private teardown(): void {
        window.removeEventListener('pointermove', this.onMove);
        window.removeEventListener('pointerup', this.onUp);
        window.removeEventListener('pointercancel', this.onUp);
        if (this.dragging) {
            this.renderer.removeStyle(document.body, 'user-select');
            this.renderer.removeStyle(document.body, 'cursor');
        }
    }
}
