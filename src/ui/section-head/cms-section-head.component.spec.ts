import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { ErrorHandlerService } from '@coolms/core-angular';

import { ContextMenuComponent } from '../../context-menu/context-menu.component';
import { ContextMenuService } from '../../context-menu/context-menu.service';
import { CmsSectionHeadComponent, type SectionHeadAction, type SectionHeadPrimary } from './cms-section-head.component';
import { sectionActionsOf } from '../cms-page-header.component';

@Component({
    standalone: true,
    imports: [CmsSectionHeadComponent, ContextMenuComponent],
    template: `
        <cms-section-head title="Email" [primary]="primary()" [more]="more()" (action)="chosen.push($event)">
            @if (context()) {
                <div section-context data-test="card">Work mail</div>
            }
        </cms-section-head>
        <coolms-context-menu />
    `,
})
class HostComponent {
    readonly primary = signal<SectionHeadPrimary | null>({ id: 'compose', label: 'Compose', icon: 'pencil-square' });
    readonly more = signal<SectionHeadAction[]>([
        { id: 'add-mailbox', label: 'Add mailbox', icon: 'plus-lg' },
        { id: 'module-settings', label: 'Email settings', icon: 'gear' },
        { id: 'import', label: 'Import', icon: 'upload', disabled: true, reason: 'Choose a mailbox first.' },
    ]);
    readonly context = signal(true);
    readonly chosen: string[] = [];
}

describe('CmsSectionHeadComponent', () => {
    let f: ComponentFixture<HostComponent>;
    const el = (): HTMLElement => f.nativeElement as HTMLElement;
    const q = (s: string): HTMLElement | null => el().querySelector(s);

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

    it('row 1 holds the title, then the primary with its icon and label, then More', () => {
        const row = q('[data-row="1"]')!;
        expect(row.querySelector('h1')!.textContent!.trim()).toBe('Email');
        const primary = row.querySelector<HTMLButtonElement>('[data-action="primary"]')!;
        expect(primary.textContent!.trim()).toBe('Compose');
        expect(primary.querySelector('.bi-pencil-square')).not.toBeNull();
        const buttons = [...row.querySelectorAll('[data-action]')].map((b) => b.getAttribute('data-action'));
        expect(buttons).toEqual(['primary', 'more']);
        expect(row.querySelector('[data-action="more"]')!.getAttribute('aria-label')).toBe('More actions');
    });

    it('the primary emits its id; More lists the other actions in order, a disabled one kept with its reason', async () => {
        q('[data-action="primary"]')!.click();
        expect(f.componentInstance.chosen).toEqual(['compose']);

        q('[data-action="more"]')!.click();
        f.detectChanges();
        const menu = TestBed.inject(ContextMenuService).menu()!;
        expect(menu.items.map((i) => i.label)).toEqual(['Add mailbox', 'Email settings', 'Import']);
        const imp = menu.items[2];
        expect(imp.disabled).toBeTrue();
        expect(imp.refusal).toBe('Choose a mailbox first.');
        expect(q('[data-action="more"]')!.getAttribute('aria-expanded')).toBe('true');

        menu.onAction('add-mailbox');
        await Promise.resolve();
        expect(f.componentInstance.chosen).toEqual(['compose', 'add-mailbox']);
    });

    it('a disabled primary stays in place, says its reason, and emits nothing', () => {
        f.componentInstance.primary.set({ id: 'compose', label: 'Compose', icon: 'pencil-square', disabled: true, reason: 'No mailbox can send.' });
        f.detectChanges();
        const primary = q('[data-action="primary"]')!;
        expect(primary.getAttribute('aria-disabled')).toBe('true');
        const described = primary.getAttribute('aria-describedby')!;
        expect(el().querySelector('#' + described)!.textContent).toBe('No mailbox can send.');
        primary.click();
        expect(f.componentInstance.chosen).toEqual([]);
    });

    it('a primary with entries is a split button whose menu lists them', () => {
        f.componentInstance.primary.set({
            id: 'upload', label: 'Upload', icon: 'upload', menuLabel: 'More ways to add',
            menu: [{ id: 'new-folder', label: 'New folder', icon: 'folder-plus' }],
        });
        f.detectChanges();
        const split = q('[data-action="primary-menu"]')!;
        expect(split.getAttribute('aria-label')).toBe('More ways to add');
        split.click();
        f.detectChanges();
        expect(TestBed.inject(ContextMenuService).menu()!.items.map((i) => i.id)).toEqual(['new-folder']);
    });

    it('no More without other actions, no primary without one, and no row 2 without a context', () => {
        f.componentInstance.more.set([]);
        f.componentInstance.primary.set(null);
        f.componentInstance.context.set(false);
        f.detectChanges();
        expect(q('[data-action="more"]')).toBeNull();
        expect(q('[data-action="primary"]')).toBeNull();
        expect(getComputedStyle(q('[data-row="2"]')!).display).toBe('none');
    });

    it('row 2 holds the context when one is given, and no divider line is drawn under either row', () => {
        const row2 = q('[data-row="2"]')!;
        expect(row2.querySelector('[data-test="card"]')!.textContent).toBe('Work mail');
        expect(getComputedStyle(row2).display).not.toBe('none');
        for (const row of [q('[data-row="1"]')!, row2, q('.cms-section-head')!]) {
            expect(getComputedStyle(row).borderBottomStyle).toBe('none');
        }
    });
});

describe('sectionActionsOf', () => {
    it('takes the first primary action as the primary and every other drawn action under More, the title node none', () => {
        const { primary, more } = sectionActionsOf([
            { id: 'title', icon: '', label: 'Mail' },
            { id: 'add-mailbox', icon: 'plus-lg', label: 'Add mailbox' },
            { id: 'sep', icon: '', divider: true },
            { id: 'gone', icon: 'x', label: 'Gone', hidden: true },
            { id: 'import', icon: 'upload', label: 'Import', title: 'Import a file', disabled: true, refusal: 'An import is running.' },
            { id: 'compose', icon: 'pencil-square', label: 'Compose', primary: true },
        ]);
        expect(primary).toEqual(jasmine.objectContaining({ id: 'compose', label: 'Compose' }));
        expect(more.map((a) => a.id)).toEqual(['add-mailbox', 'import']);
        expect(more[1]).toEqual(jasmine.objectContaining({ disabled: true, reason: 'An import is running.' }));
        expect(more[0].reason).toBeUndefined();
    });

    it('with no primary action, every action is under More', () => {
        const { primary, more } = sectionActionsOf([{ id: 'refresh', icon: 'arrow-clockwise', label: 'Refresh' }]);
        expect(primary).toBeNull();
        expect(more.map((a) => a.id)).toEqual(['refresh']);
    });
});
