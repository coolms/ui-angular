import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { ErrorHandlerService } from '@coolms/core-angular';

import { ContextMenuComponent } from '../../context-menu/context-menu.component';
import { ContextMenuService } from '../../context-menu/context-menu.service';
import { CmsPageHeaderComponent } from '../cms-page-header.component';
import type { ToolbarAction } from '../page-toolbar.component';
import { CmsSectionHeadComponent, type SectionHeadAction, type SectionHeadPrimary } from './cms-section-head.component';
import { firstFit, sectionFits, titleKeepsFloor } from './section-fit';

const TITLE = 'Mail of the design team';
const WIDE = 900;
/** Wide enough for all of either header. */
const START = 800;
const STEP = 14;

@Component({
    standalone: true,
    imports: [CmsSectionHeadComponent, CmsPageHeaderComponent, ContextMenuComponent],
    template: `
        <div data-test="box" [style.width.px]="width()" style="position: absolute; left: 0; top: 0">
            @if (page()) {
                <cms-page-header [title]="title()" icon="envelope" [subtitle]="description()" [actions]="actions()"
                                 (actionClick)="chosen.push($event)">
                    <span header-meta data-test="meta" style="display: flex; flex-wrap: wrap; gap: 4px">
                        <span data-test="elsewhere" data-said-elsewhere style="padding: 0 4px">mail-design</span>
                        <span data-test="only-here" style="padding: 0 4px">Draft</span>
                        @if (extra()) {
                            <span data-test="only-here-2" title="Pinned since May" style="padding: 0 4px">Pinned</span>
                        }
                    </span>
                    <span header-actions data-test="status" style="padding: 0 6px">Online</span>
                </cms-page-header>
            } @else {
                <cms-section-head [title]="title()" icon="envelope" [description]="description()" [primary]="primary()" [more]="more()"
                                  (action)="chosen.push($event)">
                    <span section-meta data-test="elsewhere" data-said-elsewhere style="padding: 0 4px">mail-design</span>
                    <span section-meta data-test="only-here" style="padding: 0 4px">Draft</span>
                    @if (extra()) {
                        <span section-meta data-test="only-here-2" title="Pinned since May" style="padding: 0 4px">Pinned</span>
                    }
                </cms-section-head>
            }
        </div>
        <coolms-context-menu />
    `,
})
class HostComponent {
    readonly page = signal(false);
    /** A second chip said only on the header, after the first. */
    readonly extra = signal(false);
    readonly width = signal(WIDE);
    readonly title = signal(TITLE);
    readonly description = signal('Write, read and sort mail');
    readonly primary = signal<SectionHeadPrimary | null>({ id: 'compose', label: 'Compose', icon: 'pencil-square' });
    readonly more = signal<SectionHeadAction[]>([{ id: 'add-mailbox', label: 'Add mailbox', icon: 'plus-lg' }]);
    readonly actions = signal<ToolbarAction[]>([
        { id: 'compose', icon: 'pencil-square', label: 'Compose', primary: true },
        { id: 'add-mailbox', icon: 'plus-lg', label: 'Add mailbox' },
    ]);
    readonly chosen: string[] = [];
}

describe('what a header draws on its one line', () => {
    it('gives way in one order: the description, the chips said elsewhere and the title, the primary as its icon, the primary in More', () => {
        expect(sectionFits('icon')).toEqual([0, 1, 2, 3, 4, 5]);
        expect(sectionFits('label')).withContext('no icon to stay as').toEqual([0, 1, 2, 4, 5]);
        expect(sectionFits('none')).withContext('nothing to move').toEqual([0, 1, 2, 5]);
        expect(firstFit([0, 1, 2, 3], (s) => s >= 2)).toBe(2);
        expect(firstFit([0, 1], () => false)).withContext('the last step, when none fits').toBe(1);
    });

    it('keeps 64px of a title, or all of a shorter one', () => {
        expect(titleKeepsFloor(64, 300)).toBeTrue();
        expect(titleKeepsFloor(60, 300)).toBeFalse();
        expect(titleKeepsFloor(40, 40)).toBeTrue();
        expect(titleKeepsFloor(30, 40)).toBeFalse();
    });
});

for (const page of [false, true]) {
    describe(page ? 'cms-page-header on one line' : 'cms-section-head on one line', () => {
        let f: ComponentFixture<HostComponent>;
        const el = (): HTMLElement => f.nativeElement as HTMLElement;
        const q = <T extends HTMLElement = HTMLElement>(s: string): T => el().querySelector<T>(s)!;
        const row = (): HTMLElement => q('[data-section-row]');
        const title = (): HTMLElement => q('[data-section-title]');
        const description = (): HTMLElement => q('[data-section-description]');
        const primary = (): HTMLElement => q('[data-action="primary"]');
        const more = (): HTMLElement | null => el().querySelector('[data-action="more"]');
        const label = (): HTMLElement => q('.cms-section-head__label');
        const fit = (): number => Number(row().getAttribute('data-fit'));
        const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
        const draws = (e: HTMLElement | null): boolean => e !== null && e.getBoundingClientRect().width > 2;

        async function settle(): Promise<void> {
            f.detectChanges();
            await frame();
            await frame();
            f.detectChanges();
        }
        async function wide(px: number): Promise<void> {
            f.componentInstance.width.set(px);
            await settle();
        }
        /** The first width, from wide to narrow, that draws the step (or, `orLater`, any later one). */
        async function narrowTo(step: number, orLater = false): Promise<number> {
            for (let w = START; w > 20; w -= STEP) {
                await wide(w);
                if (fit() === step || (orLater && fit() > step)) return w;
            }
            throw new Error(`no width draws step ${step}`);
        }
        /** Nothing the row draws reaches over another part of it, or past it. */
        function oneLine(): void {
            const parts = [title(), ...Array.from(row().querySelectorAll<HTMLElement>('[data-test="elsewhere"], [data-test="only-here"], [data-test="only-here-2"], [data-section-description], [data-test="status"], [data-action]'))]
                .filter((e) => draws(e)).map((e) => e.getBoundingClientRect()).sort((a, b) => a.left - b.left);
            for (let i = 1; i < parts.length; i++) {
                expect(parts[i].left).withContext(`parts ${i - 1} and ${i} at ${f.componentInstance.width()}`).toBeGreaterThanOrEqual(parts[i - 1].right - 1);
            }
            const r = row().getBoundingClientRect();
            expect(parts[parts.length - 1].right).withContext(`inside the row at ${f.componentInstance.width()}`).toBeLessThanOrEqual(r.right + 1);
            const middle = r.top + r.height / 2;
            for (const p of parts) {
                expect(p.top).toBeLessThan(middle);
                expect(p.bottom).toBeGreaterThan(middle);
            }
        }
        const elsewhere = (): HTMLElement => q('[data-test="elsewhere"]');
        const onlyHere = (): HTMLElement => q('[data-test="only-here"]');
        const cut = (): boolean => title().scrollWidth - title().clientWidth > 1;
        /**
         * The least width that draws all of the line, read off what is drawn at a width with room to spare: the row's
         * padding, each part's own width and the gaps between them; a box that grows (the page header's main) counted by
         * its own parts.
         */
        function needed(): number {
            const natural = (box: HTMLElement): number => {
                const css = getComputedStyle(box);
                const parts = Array.from(box.children).filter((c): c is HTMLElement => c instanceof HTMLElement
                    && c.getBoundingClientRect().width > 0 && getComputedStyle(c).position !== 'absolute');
                const gap = parseFloat(css.columnGap) || 0;
                const own = parts.reduce((sum, c) => sum + (parseFloat(getComputedStyle(c).flexGrow) > 0 ? natural(c) : c.getBoundingClientRect().width), 0);

                return own + gap * Math.max(0, parts.length - 1) + parseFloat(css.paddingLeft) + parseFloat(css.paddingRight);
            };

            return Math.ceil(natural(row()));
        }
        /** Narrower and narrower from `from`, until the primary is in More. */
        async function sweep(from: number, each: (w: number) => void): Promise<number> {
            let w = from;
            for (; w > 100; w -= STEP) {
                await wide(w);
                each(w);
                if (fit() === 4) break;
            }
            return w;
        }
        const state = (): string => [fit(), draws(description()), draws(elsewhere()), title().clientWidth, draws(label()), draws(primary())].join(' ');

        beforeEach(async () => {
            TestBed.configureTestingModule({
                imports: [HostComponent],
                providers: [
                    { provide: HttpClient, useValue: {} },
                    { provide: Router, useValue: {} },
                    { provide: ErrorHandlerService, useValue: {} },
                    { provide: Store, useValue: { selectSnapshot: () => null } },
                ],
            });
            f = TestBed.createComponent(HostComponent);
            f.componentInstance.page.set(page);
            document.body.appendChild(f.nativeElement);
            await document.fonts.ready;
            await settle();
        });
        afterEach(() => {
            TestBed.inject(ContextMenuService).close();
            el().remove();
        });

        it('draws all of it from exactly the width its content needs, and gives way just under it', async () => {
            await wide(2000);
            expect(fit()).toBe(0);
            const need = needed();
            await wide(need + 1);
            expect(fit()).withContext(`all of it at ${need + 1}, its content needing ${need}`).toBe(0);
            await wide(need - 4);
            expect(fit()).withContext(`given way at ${need - 4}`).toBeGreaterThan(0);
        });

        it('gives way in order as it narrows, never wraps, and one width has one answer', async () => {
            const height = row().getBoundingClientRect().height;
            const chip = onlyHere().getBoundingClientRect().width;
            const whole = title().scrollWidth;
            await wide(2000);
            const from = needed() + 1;
            const seen: Record<number, string> = {};
            const steps: number[] = [];
            const last = await sweep(from, (w) => {
                seen[w] = state();
                if (steps[steps.length - 1] !== fit()) steps.push(fit());
                expect(row().getBoundingClientRect().height).withContext(`one line at ${w}`).toBe(height);
                oneLine();
                expect(draws(description())).withContext(`the description at ${w}`).toBe(fit() === 0);
                if (fit() <= 1) expect(cut()).withContext(`the title whole at ${w}`).toBeFalse();
                if (fit() >= 2) expect(title().clientWidth).toBeGreaterThanOrEqual(63);
                expect(draws(elsewhere())).withContext(`the chip said elsewhere at ${w}`).toBe(fit() < 2);
                if (cut()) expect(draws(elsewhere())).withContext(`the chip gives way before the title is cut, at ${w}`).toBeFalse();
                expect(onlyHere().getBoundingClientRect().width).withContext(`the chip said only here, at ${w}`).toBe(chip);
                expect(draws(label())).withContext(`the label at ${w}`).toBe(fit() < 3);
            });
            expect(steps).withContext(`every step, once and in order, from ${from} to ${last}`).toEqual([0, 1, 2, 3, 4]);
            for (let w = last; w <= from; w += STEP) {
                await wide(w);
                expect(state()).withContext(`back at ${w}`).toBe(seen[w]);
            }
            expect(title().scrollWidth).toBe(whole);
        }, 30000);

        it('cuts the title down to 64px before the primary gives its label up, and keeps a shorter title whole', async () => {
            const at = await narrowTo(3);
            await wide(at + STEP);
            expect(fit()).toBe(2);
            expect(title().clientWidth).withContext('cut').toBeLessThan(title().scrollWidth);
            expect(title().clientWidth).withContext('down to about its least').toBeLessThan(64 + 2 * STEP);
            expect(getComputedStyle(title()).textOverflow).toBe('ellipsis');
            expect(getComputedStyle(title()).display).withContext('an ellipsis needs a block, whatever the page styles say').toBe('block');
            expect(title().title).toBe(TITLE);

            f.componentInstance.title.set('Hi');
            f.componentInstance.width.set(WIDE);
            await settle();
            await narrowTo(3);
            expect(title().scrollWidth - title().clientWidth).withContext('the short title is whole').toBeLessThanOrEqual(1);
        }, 30000);

        it('leaves the description where assistive technology reads it', async () => {
            await narrowTo(1);
            const css = getComputedStyle(description());
            expect(css.display).not.toBe('none');
            expect(css.visibility).toBe('visible');
            expect(description().getAttribute('aria-hidden')).toBeNull();
            expect(description().textContent!.trim()).toBe('Write, read and sort mail');
            expect(draws(description())).toBeFalse();
        }, 30000);

        it('the primary as its icon: its label is its tooltip and its name; disabled, the label then the reason', async () => {
            await narrowTo(3);
            expect(draws(primary())).toBeTrue();
            expect(draws(primary().querySelector('.bi-pencil-square'))).toBeTrue();
            expect(draws(label())).toBeFalse();
            expect(primary().title).toBe('Compose');
            expect(primary().textContent!.trim()).withContext('its name').toBe('Compose');
            expect(primary().getAttribute('aria-label')).toBeNull();

            const reason = 'No mailbox can send.';
            f.componentInstance.primary.set({ id: 'compose', label: 'Compose', icon: 'pencil-square', disabled: true, reason });
            f.componentInstance.actions.set([{ id: 'compose', icon: 'pencil-square', label: 'Compose', primary: true, disabled: true, refusal: reason }, { id: 'add-mailbox', icon: 'plus-lg', label: 'Add mailbox' }]);
            await settle();
            expect(fit()).toBe(3);
            expect(primary().title).toBe(`Compose: ${reason}`);
            expect(el().querySelector('#' + primary().getAttribute('aria-describedby')!)!.textContent).toBe(reason);
            expect(primary().querySelector('.cms-section-head__label')!.textContent).toBe('Compose');

            await wide(WIDE);
            expect(primary().title).withContext('with its label, the reason alone').toBe(reason);
        }, 30000);

        it('in More: first in its menu, and it emits as ever; More is drawn for it alone and leaves with it', async () => {
            await narrowTo(4);
            expect(draws(primary())).toBeFalse();
            more()!.click();
            f.detectChanges();
            const menu = TestBed.inject(ContextMenuService).menu()!;
            expect(menu.items.map((i) => i.id)).toEqual(['compose', 'add-mailbox']);
            menu.onAction('compose');
            await Promise.resolve();
            expect(f.componentInstance.chosen).toEqual(['compose']);
            TestBed.inject(ContextMenuService).close();

            f.componentInstance.more.set([]);
            f.componentInstance.actions.set([{ id: 'compose', icon: 'pencil-square', label: 'Compose', primary: true }]);
            await settle();
            await wide(WIDE);
            expect(more()).withContext('no More with room for the primary').toBeNull();
            // More costs what the icon did: with no other action, the next step is the chips' cut, with the primary in More.
            await narrowTo(4, true);
            expect(draws(more())).withContext('More for the primary alone').toBeTrue();
        }, 30000);

        it('the focus goes with the primary into More, and back', async () => {
            await narrowTo(4);
            await wide(WIDE);
            primary().focus();
            expect(document.activeElement).toBe(primary());
            await narrowTo(4);
            expect(document.activeElement).withContext('on More').toBe(more());
            await wide(WIDE);
            expect(document.activeElement).withContext('back on the primary').toBe(primary());

            more()!.focus();
            await narrowTo(4);
            await wide(WIDE);
            expect(document.activeElement).withContext('More keeps a focus of its own').toBe(more());
        }, 30000);

        it('without a primary only the description, the chips and the title give way; one with no icon goes from its label into More', async () => {
            f.componentInstance.primary.set(null);
            f.componentInstance.actions.set([{ id: 'add-mailbox', icon: 'plus-lg', label: 'Add mailbox' }]);
            await settle();
            for (const w of [300, 160, 90]) {
                await wide(w);
                expect([0, 1, 2, 5]).withContext(`at ${w}`).toContain(fit());
            }
            f.componentInstance.primary.set({ id: 'compose', label: 'Compose' });
            f.componentInstance.actions.set([{ id: 'compose', icon: '', label: 'Compose', primary: true }]);
            await wide(2000);
            const steps: number[] = [];
            await sweep(needed() + 1, (w) => {
                if (steps[steps.length - 1] !== fit()) steps.push(fit());
                if (fit() < 4) expect(draws(label())).withContext(`its label at ${w}`).toBeTrue();
            });
            expect(steps).toEqual([0, 1, 2, 4]);
        }, 30000);

        it('answers a change of its content, with no change of its width', async () => {
            await wide(WIDE);
            expect(fit()).toBe(0);
            f.componentInstance.description.set('A description far too long for this header to draw whole beside its title, whatever the size of its text: '.repeat(3));
            await settle();
            expect(fit()).toBe(1);
            f.componentInstance.description.set('Short');
            await settle();
            expect(fit()).toBe(0);
        });

        it('gives way with no title drawn too, as while a page is being read', async () => {
            f.componentInstance.title.set('');
            f.componentInstance.description.set('');
            await wide(START);
            expect(fit()).toBe(0);
            await wide(page ? 190 : 100);
            expect(fit()).toBeGreaterThan(2);
        });

        it('a chip said elsewhere hides before the title is cut; a chip said only here keeps its size', async () => {
            const at = await narrowTo(2);
            expect(draws(elsewhere())).toBeFalse();
            expect(getComputedStyle(elsewhere()).display).toBe('none');
            expect(draws(onlyHere())).toBeTrue();
            await wide(at + STEP);
            expect(fit()).toBe(1);
            expect(cut()).withContext('the title whole while the chip is there').toBeFalse();
            expect(draws(elsewhere())).toBeTrue();
        }, 30000);

        it('at last the chips said only here are cut, the last first, the title held at its least; and back', async () => {
            f.componentInstance.extra.set(true);
            f.componentInstance.primary.set(null);
            f.componentInstance.more.set([]);
            f.componentInstance.actions.set([]);
            await settle();
            await wide(START);
            const chipOf = (n: 1 | 2): HTMLElement => q(n === 1 ? '[data-test="only-here"]' : '[data-test="only-here-2"]');
            const natural = [chipOf(1).getBoundingClientRect().width, chipOf(2).getBoundingClientRect().width];
            const whole = title().scrollWidth;
            const height = row().getBoundingClientRect().height;
            let at = 0;
            for (let w = START; w > 60 && at === 0; w -= 4) {
                await wide(w);
                if (fit() === 5) at = w;
            }
            expect(at).withContext('the last step reached').toBeGreaterThan(0);
            let both = false;
            for (let w = at; w > 60 && !both; w -= 4) {
                await wide(w);
                expect(fit()).toBe(5);
                oneLine();
                expect(row().getBoundingClientRect().height).withContext(`one line at ${w}`).toBe(height);
                expect(Math.abs(title().getBoundingClientRect().width - Math.min(64, whole))).withContext(`the title held at ${w}`).toBeLessThanOrEqual(1);
                const [first, last] = [chipOf(1), chipOf(2)];
                for (const c of [first, last]) {
                    expect(draws(c)).withContext(`a chip said only here is drawn at ${w}`).toBeTrue();
                    expect(getComputedStyle(c).display).not.toBe('none');
                }
                const cutFirst = first.getBoundingClientRect().width < natural[0] - 1;
                const cutLast = last.getBoundingClientRect().width < natural[1] - 1;
                expect(cutLast || !cutFirst).withContext(`the last chip is cut before the first, at ${w}`).toBeTrue();
                if (cutLast) {
                    expect(last.scrollWidth).toBeGreaterThan(last.clientWidth);
                    expect(getComputedStyle(last).textOverflow).toBe('ellipsis');
                    expect(last.getAttribute('title')).withContext('its whole text its tooltip').toBe('Pinned');
                    expect(last.getAttribute('aria-label')).withContext('and its name').toBe('Pinned');
                }
                if (cutFirst) {
                    both = true;
                    expect(first.getAttribute('title')).toBe('Draft');
                    expect(first.getAttribute('aria-label')).toBe('Draft');
                    expect(last.getBoundingClientRect().width).withContext('the last at its least first').toBeLessThan(natural[1] / 2 + 12);
                }
            }
            expect(both).withContext('both chips cut before the row runs out').toBeTrue();
            expect(chipOf(2).getBoundingClientRect().width).withContext('cut at the narrowest').toBeLessThan(natural[1] - 1);

            await wide(START);
            expect(fit()).toBeLessThan(5);
            const last = chipOf(2);
            expect(last.getAttribute('title')).withContext('its own tooltip back').toBe('Pinned since May');
            expect(last.getAttribute('aria-label')).toBeNull();
            expect(last.style.maxWidth).toBe('');
            expect(Math.round(last.getBoundingClientRect().width)).toBe(Math.round(natural[1]));
            expect(title().style.width).toBe('');
        }, 30000);

        it('clips no focus ring: nothing from a button to the row cuts what overflows it', () => {
            for (let e: HTMLElement | null = primary().parentElement; e !== null && e !== el(); e = e.parentElement) {
                expect(getComputedStyle(e).overflowX).withContext(e.className).toBe('visible');
            }
        });

        if (page) {
            it('the meta and the controls keep their size, at 320 too', async () => {
                const sizes = (): number[] => ['[data-test="only-here"]', '[data-test="status"]'].map((s) => Math.round(q(s).getBoundingClientRect().width));
                const at = sizes();
                await wide(320);
                expect(sizes()).toEqual(at);
                oneLine();
                expect(row().getBoundingClientRect().height).toBeLessThan(60);
            });
        } else {
            it('a split primary is the icon and its chevron together; in More its entries follow it', async () => {
                f.componentInstance.primary.set({
                    id: 'upload', label: 'Upload', icon: 'upload', menuLabel: 'More ways to add', menu: [{ id: 'new-folder', label: 'New folder' }],
                });
                await settle();
                await narrowTo(3);
                expect(draws(primary())).toBeTrue();
                expect(draws(q('[data-action="primary-menu"]'))).toBeTrue();
                expect(draws(label())).toBeFalse();
                oneLine();
                await narrowTo(4);
                expect(draws(q('[data-action="primary-menu"]'))).toBeFalse();
                more()!.click();
                f.detectChanges();
                expect(TestBed.inject(ContextMenuService).menu()!.items.map((i) => i.id)).toEqual(['upload', 'new-folder', 'add-mailbox']);
            }, 30000);
        }
    });
}
