import { DestroyRef, ElementRef, Injectable, NgZone, afterNextRender, inject, signal } from '@angular/core';

/**
 * How much of a header's one line is drawn: 0 all of it; 1 without the description, the title whole; 2 also without
 * the chips said elsewhere on the page (`data-said-elsewhere`), the title cut where it must be; 3 the primary as its
 * icon alone; 4 the primary in More; 5 the title held at its least and the chips said only here cut with an ellipsis,
 * the last first, each down to about one character.
 */
export type SectionFit = 0 | 1 | 2 | 3 | 4 | 5;

/** The least of a title that is kept, in px; a shorter title is kept whole. */
export const SECTION_TITLE_FLOOR = 64;

/** The steps a header may take, in order: without a primary the description, the chips and the title alone give way, and a primary with no icon has no icon to stay as. */
export function sectionFits(primary: 'none' | 'icon' | 'label'): readonly SectionFit[] {
    switch (primary) {
        case 'none': return [0, 1, 2, 5];
        case 'label': return [0, 1, 2, 4, 5];
        case 'icon': return [0, 1, 2, 3, 4, 5];
    }
}

/** The first step that fits, else the last one. */
export function firstFit(steps: readonly SectionFit[], fits: (step: SectionFit) => boolean): SectionFit {
    return steps.find(fits) ?? steps[steps.length - 1];
}

/** Whether a title of `whole` px drawn `drawn` px wide keeps its least width. */
export function titleKeepsFloor(drawn: number, whole: number): boolean {
    return drawn >= Math.min(SECTION_TITLE_FLOOR, whole) - 1;
}

const whole = (e: HTMLElement): boolean => e.scrollWidth - e.clientWidth <= 1;

/** The parts of an element laid out on the line, however deep; what is laid over it (a menu) is not. */
function partsOf(e: Element, into: DOMRect[] = []): DOMRect[] {
    for (const child of Array.from(e.children)) {
        const position = getComputedStyle(child).position;
        if (position === 'absolute' || position === 'fixed') continue;
        const r = child.getBoundingClientRect();
        if (r.width > 0) into.push(r);
        partsOf(child, into);
    }
    return into;
}

/**
 * How far what a row draws runs out of where it belongs, in px; 0 or less when it fits: the row's parts past its
 * padding, and what each part holds past that part's own box, which a box that shrinks (a chips container that may wrap)
 * lets run over its neighbour without leaving the row.
 */
function overflowOf(box: HTMLElement): number {
    const css = getComputedStyle(box);
    const outer = box.getBoundingClientRect();
    const start = outer.left + box.clientLeft + parseFloat(css.paddingLeft);
    const end = start + box.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    let over = -Infinity;
    for (const child of Array.from(box.children)) {
        const position = getComputedStyle(child).position;
        if (position === 'absolute' || position === 'fixed') continue;
        const own = child.getBoundingClientRect();
        if (own.width === 0 && child.children.length === 0) continue;
        over = Math.max(over, own.right - end, start - own.left);
        for (const r of partsOf(child)) over = Math.max(over, r.right - Math.min(end, own.right), Math.max(start, own.left) - r.left);
    }

    return over === -Infinity ? 0 : over;
}

/** Whether what a row lays out fits inside its padding: a title gives way before this, an empty one has nothing to give. */
function holdsItsChildren(box: HTMLElement): boolean {
    return overflowOf(box) <= 1;
}

/** The styles a cut chip is drawn with: one line, cut with an ellipsis. */
const CUT: ReadonlyArray<readonly [string, string]> = [
    ['display', 'inline-block'], ['overflow', 'hidden'], ['text-overflow', 'ellipsis'], ['white-space', 'nowrap'],
    ['vertical-align', 'middle'], ['box-sizing', 'border-box'], ['flex-shrink', '0'], ['min-width', '0'],
];

/** A chip beside the title: an element there that holds text of its own, said only on the header. */
function onlyHereChips(row: HTMLElement): HTMLElement[] {
    const meta = row.querySelector<HTMLElement>('[data-section-meta]');
    if (meta === null) return [];

    return Array.from(meta.querySelectorAll<HTMLElement>('*')).filter((e) =>
        e.closest('[data-said-elsewhere]') === null && e.getBoundingClientRect().width > 0
        && Array.from(e.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== ''));
}

/** About one character and the ellipsis, inside the chip's own padding and border. */
function chipFloor(chip: HTMLElement): number {
    const css = getComputedStyle(chip);
    const frame = ['padding-left', 'padding-right', 'border-left-width', 'border-right-width']
        .reduce((sum, p) => sum + (parseFloat(css.getPropertyValue(p)) || 0), 0);

    return Math.ceil(frame + 1.6 * parseFloat(css.fontSize));
}

/**
 * Keeps a header on one line. Provided by the header; it reads the header's row (`data-section-row`), its title
 * (`data-section-title`), which alone shrinks on the line with its description (`data-section-description`), and the
 * chips the host marks said elsewhere (`data-said-elsewhere`), which the styles hide from step 2,
 * and the chips said only there (`data-section-meta`), cut at step 5; and writes the step as the row's `data-fit`, which the styles follow. It tries the steps
 * in order whenever the row's width or content changes, so one width has one answer.
 */
@Injectable()
export class SectionRowFit {
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly shown = signal<SectionFit>(0);
    private redraw: (() => void) | null = null;
    private gone = false;
    /** The focus was taken into More with the primary. */
    private moved = false;
    readonly level = this.shown.asReadonly();

    constructor() {
        const zone = inject(NgZone);
        const destroyed = inject(DestroyRef);
        afterNextRender(() => zone.runOutsideAngular(() => {
            const row = this.row();
            if (row === null || this.gone) return;
            const fit = (): void => this.fit();
            const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
            const content = new MutationObserver(fit);
            sizes?.observe(row);
            content.observe(row, { childList: true, subtree: true, characterData: true });
            void document.fonts?.ready.then(fit);
            destroyed.onDestroy(() => {
                sizes?.disconnect();
                content.disconnect();
            });
            fit();
        }));
        destroyed.onDestroy(() => { this.gone = true; });
    }

    /** What draws the row again, at once, when the step changes. */
    onChange(redraw: () => void): void {
        this.redraw = redraw;
    }

    private fit(): void {
        const row = this.row();
        if (row === null || this.gone || row.clientWidth === 0) return;
        this.uncut(row);
        const primary = row.querySelector<HTMLElement>('.cms-section-head__primary');
        const more = row.querySelector<HTMLElement>('[data-action="more"]');
        const focused = document.activeElement;
        const inPrimary = primary?.contains(focused) === true;
        const onMore = more !== null && more === focused;
        const kind = primary === null ? 'none' : primary.querySelector('[data-part="icon"]') === null ? 'label' : 'icon';
        const level = firstFit(sectionFits(kind), (step) => this.fits(row, step));
        if (level !== this.shown()) {
            this.shown.set(level);
            this.redraw?.();
        }
        if (inPrimary && level >= 4) {
            this.moved = true;
            row.querySelector<HTMLElement>('[data-action="more"]')?.focus({ preventScroll: true });
        } else if (this.moved && level < 4) {
            this.moved = false;
            if (onMore) row.querySelector<HTMLElement>('[data-action="primary"]')?.focus({ preventScroll: true });
        }
    }

    private fits(row: HTMLElement, step: SectionFit): boolean {
        row.setAttribute('data-fit', String(step));
        if (step === 5) {
            this.cut(row);
            return holdsItsChildren(row);
        }
        if (!holdsItsChildren(row)) return false;
        const title = row.querySelector<HTMLElement>('[data-section-title]');
        if (title === null) return true;
        if (step >= 2) return titleKeepsFloor(title.clientWidth, title.scrollWidth);
        if (step === 1) return whole(title);
        const description = row.querySelector<HTMLElement>('[data-section-description]');

        return whole(title) && (description === null || whole(description));
    }

    /** The title held at its least; the chips said only here cut, the last first, until the row holds them. */
    private cut(row: HTMLElement): void {
        const title = row.querySelector<HTMLElement>('[data-section-title]');
        if (title !== null) {
            title.style.setProperty('flex', 'none');
            title.style.setProperty('width', `${Math.min(SECTION_TITLE_FLOOR, title.scrollWidth)}px`);
            title.setAttribute('data-fit-held', '');
        }
        for (const chip of onlyHereChips(row).reverse()) {
            const over = overflowOf(row);
            if (over <= 1) return;
            const drawn = chip.getBoundingClientRect().width;
            const text = (chip.textContent ?? '').trim().replace(/\s+/g, ' ');
            chip.setAttribute('data-fit-cut', JSON.stringify({ title: chip.getAttribute('title'), label: chip.getAttribute('aria-label') }));
            for (const [name, value] of CUT) chip.style.setProperty(name, value);
            chip.style.setProperty('max-width', `${Math.max(chipFloor(chip), Math.floor(drawn - over))}px`);
            chip.setAttribute('title', text);
            chip.setAttribute('aria-label', text);
        }
    }

    /** Every chip and the title as the host drew them. */
    private uncut(row: HTMLElement): void {
        const title = row.querySelector<HTMLElement>('[data-fit-held]');
        if (title !== null) {
            title.style.removeProperty('flex');
            title.style.removeProperty('width');
            title.removeAttribute('data-fit-held');
        }
        for (const chip of Array.from(row.querySelectorAll<HTMLElement>('[data-fit-cut]'))) {
            const was = JSON.parse(chip.getAttribute('data-fit-cut') ?? '{}') as { title?: string | null; label?: string | null };
            for (const [name] of CUT) chip.style.removeProperty(name);
            chip.style.removeProperty('max-width');
            if (was.title == null) chip.removeAttribute('title'); else chip.setAttribute('title', was.title);
            if (was.label == null) chip.removeAttribute('aria-label'); else chip.setAttribute('aria-label', was.label);
            chip.removeAttribute('data-fit-cut');
        }
    }

    private row(): HTMLElement | null {
        return this.host.nativeElement.querySelector<HTMLElement>('[data-section-row]');
    }
}
