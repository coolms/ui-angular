import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { ErrorHandlerService } from '@coolms/core-angular';

import { ContextMenuComponent } from '../context-menu/context-menu.component';
import { ContextMenuService } from '../context-menu/context-menu.service';
import { CmsPageHeaderComponent } from './cms-page-header.component';
import type { ToolbarAction } from './page-toolbar.component';

@Component({
    standalone: true,
    imports: [CmsPageHeaderComponent, ContextMenuComponent],
    template: `
        <div style="width: 1200px">
            <cms-page-header title="Chat" icon="chat-dots" [subtitle]="subtitle()" [actions]="actions()"
                             (actionClick)="chosen.push($event)">
                <span header-meta data-test="meta">draft</span>
                <span header-actions data-test="status">Online</span>
            </cms-page-header>
        </div>
        <p data-test="content">content</p>
        <coolms-context-menu />
    `,
})
class HostComponent {
    readonly subtitle = signal('');
    readonly actions = signal<ToolbarAction[]>([
        { id: 'import', icon: 'upload', label: 'Import', disabled: true, refusal: 'An import is running.' },
        { id: 'new-chat', icon: 'plus-lg', label: 'New chat', primary: true },
        { id: 'settings', icon: 'gear', label: 'Settings' },
    ]);
    readonly chosen: string[] = [];
}

describe('CmsPageHeaderComponent', () => {
    let f: ComponentFixture<HostComponent>;
    const el = (): HTMLElement => f.nativeElement as HTMLElement;
    const q = <T extends HTMLElement = HTMLElement>(s: string): T => el().querySelector<T>(s)!;

    beforeEach(() => {
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
        document.body.appendChild(f.nativeElement);
        f.detectChanges();
    });
    afterEach(() => {
        TestBed.inject(ContextMenuService).close();
        el().remove();
    });

    it('is a full-width band: its surface, 52px at least, 20px in from each side, a rule under it', () => {
        const band = q('.page-header');
        const css = getComputedStyle(band);
        expect(band.getBoundingClientRect().width).toBe(1200);
        expect(css.minHeight).toBe('52px');
        expect(css.paddingLeft).toBe('20px');
        expect(css.paddingRight).toBe('20px');
        expect(css.borderBottomStyle).toBe('solid');
        expect(css.borderBottomWidth).toBe('1px');
        expect(css.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
        expect(q('[data-test="content"]').getBoundingClientRect().top).toBeGreaterThanOrEqual(band.getBoundingClientRect().bottom);
    });

    it('draws the icon and title on the left with the meta beside the title, the actions on the right', () => {
        const title = q('.page-header__title');
        expect(title.querySelector('.bi-chat-dots')).not.toBeNull();
        expect(title.querySelector('h1')!.textContent!.trim()).toBe('Chat');
        expect(title.querySelector('[data-test="meta"]')).not.toBeNull();
        const band = q('.page-header');
        const actions = q('.page-header__actions');
        expect(band.lastElementChild).withContext('the actions close the band').toBe(actions);
        expect(title.getBoundingClientRect().left - band.getBoundingClientRect().left).toBe(20);
        if (window.matchMedia('(min-width: 769px)').matches) {
            // Beside the title, at the band's right edge; on a phone they take a row of their own.
            expect(band.getBoundingClientRect().right - actions.getBoundingClientRect().right).toBeCloseTo(20, 0);
        } else {
            expect(getComputedStyle(band).flexWrap).toBe('wrap');
        }
    });

    it('the actions are the projected status, then the one primary filled, then More with the others', () => {
        const actions = q('.page-header__actions');
        const order = [...actions.querySelectorAll('[data-test="status"], [data-action]')]
            .map((n) => n.getAttribute('data-test') ?? n.getAttribute('data-action'));
        expect(order).toEqual(['status', 'primary', 'more']);
        const primary = q<HTMLButtonElement>('[data-action="primary"]');
        expect(primary.classList).toContain('cms-btn-primary');
        expect(primary.textContent!.trim()).toBe('New chat');
        expect(actions.querySelectorAll('.cms-btn').length).withContext('one button drawn as a button').toBe(1);
    });

    it('the primary emits its id; More lists the others in order, a disabled one kept with its reason', async () => {
        q('[data-action="primary"]').click();
        expect(f.componentInstance.chosen).toEqual(['new-chat']);
        q('[data-action="more"]').click();
        f.detectChanges();
        const menu = TestBed.inject(ContextMenuService).menu()!;
        expect(menu.items.map((i) => i.label)).toEqual(['Import', 'Settings']);
        expect(menu.items[0].disabled).toBeTrue();
        expect(menu.items[0].refusal).toBe('An import is running.');
        menu.onAction('settings');
        await Promise.resolve();
        expect(f.componentInstance.chosen).toEqual(['new-chat', 'settings']);
    });

    it('no primary and no More without actions; the band stays', () => {
        f.componentInstance.actions.set([]);
        f.detectChanges();
        expect(el().querySelector('[data-action]')).toBeNull();
        expect(getComputedStyle(q('.page-header')).borderBottomStyle).toBe('solid');
    });

    it('a subtitle sits beside the title on a wide header, after a dot', () => {
        f.componentInstance.subtitle.set('Talk to your team');
        f.detectChanges();
        const band = q('.page-header');
        expect(band.classList).toContain('page-header--with-subtitle');
        const sub = q('.page-header__subtitle');
        expect(sub.textContent!.trim()).toBe('Talk to your team');
        const title = q('.page-header__title');
        expect(sub.getBoundingClientRect().left).toBeGreaterThan(title.getBoundingClientRect().right);
        expect(getComputedStyle(sub, '::before').content).toContain('·');
    });
});
