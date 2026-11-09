import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { Observable, of, Subject, throwError } from 'rxjs';

import { CmsFilesPickerComponent } from './cms-files-picker.component';
import { CmsFilesPickerService } from './cms-files-picker.service';
import {
    FilesPickerDenied,
    FilesPickerFailure,
    type FilesPickerChoice,
    type FilesPickerEntry,
    type FilesPickerOptions,
    type FilesPickerPage,
} from './cms-files-picker.types';

const file = (id: string, size: number): FilesPickerEntry => ({ id, name: id, kind: 'file', size, mimeType: 'text/plain' });
const folder = (name: string): FilesPickerEntry => ({ id: 'dir-' + name, name, kind: 'folder' });

/** Two spaces: a top folder with two folders, one the person may not open, and a paged one; a team space of one file. */
const FOLDERS: Readonly<Record<string, readonly FilesPickerEntry[] | 'denied' | 'error'>> = {
    'mine:': [folder('Docs'), folder('Locked'), folder('Many'), folder('Broken'), file('a.txt', 100), file('big.bin', 900)],
    'mine:Docs': [file('d1.txt', 200), file('d2.txt', 300)],
    'mine:Locked': 'denied',
    'mine:Broken': 'error',
    'team:': [file('t1.txt', 50)],
};

function makeList(calls: string[], pages: Map<string, Subject<FilesPickerPage>> = new Map()) {
    return (space: string, path: string, cursor?: string): Observable<FilesPickerPage> => {
        calls.push(space + ':' + path + (cursor ? '@' + cursor : ''));
        if (path === 'Many') {
            const key = cursor ?? 'first';
            if (pages.has(key)) return pages.get(key)!;
            const entries = Array.from({ length: 20 }, (_, i) => file((cursor ? 'p2-' : 'p1-') + i, 10));

            return of({ entries, next: cursor ? null : 'page-2' });
        }
        const found = FOLDERS[space + ':' + path];
        if (found === 'denied') return throwError(() => new FilesPickerDenied());
        if (found === 'error') return throwError(() => new FilesPickerFailure('The drive did not answer'));

        return of({ entries: found ?? [] });
    };
}

function q<T extends Element = HTMLElement>(f: ComponentFixture<unknown>, sel: string): T | null {
    return (f.nativeElement as HTMLElement).querySelector<T>(sel);
}
function qa<T extends Element = HTMLElement>(f: ComponentFixture<unknown>, sel: string): T[] {
    return Array.from((f.nativeElement as HTMLElement).querySelectorAll<T>(sel));
}
function rowNamed(f: ComponentFixture<unknown>, name: string): HTMLElement {
    const row = qa(f, '[data-test="fp-row"]').find((r) => r.querySelector('.cms-fp__name-text')?.textContent?.trim() === name);
    if (!row) throw new Error('no row ' + name + ' in ' + qa(f, '[data-test="fp-row"]').map((r) => r.textContent?.trim()).join(' | '));

    return row;
}
function key(f: ComponentFixture<unknown>, k: string): void {
    const list = q(f, '[role="listbox"]') ?? (f.nativeElement as HTMLElement);
    list.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    f.detectChanges();
}

describe('CmsFilesPickerComponent', () => {
    let calls: string[];
    let confirmed: Array<readonly FilesPickerChoice[]>;
    let cancelled: number;

    function create(extra: Partial<FilesPickerOptions> = {}, pages?: Map<string, Subject<FilesPickerPage>>): ComponentFixture<CmsFilesPickerComponent> {
        const f = TestBed.createComponent(CmsFilesPickerComponent);
        f.componentRef.setInput('options', {
            title: 'Attach from files',
            spaces: [{ id: 'mine', name: 'My files' }, { id: 'team', name: 'Team' }],
            list: makeList(calls, pages),
            onConfirm: (c: readonly FilesPickerChoice[]) => confirmed.push(c),
            onCancel: () => cancelled++,
            ...extra,
        } satisfies FilesPickerOptions);
        f.detectChanges();

        return f;
    }

    beforeEach(() => {
        TestBed.configureTestingModule({ imports: [CmsFilesPickerComponent] });
        calls = [];
        confirmed = [];
        cancelled = 0;
    });

    it('keeps the selection across folders and spaces, counts all of it, and gives back where each was chosen', () => {
        const f = create();
        rowNamed(f, 'a.txt').click();
        f.detectChanges();
        rowNamed(f, 'Docs').click();
        f.detectChanges();
        rowNamed(f, 'd2.txt').click();
        f.detectChanges();
        q(f, '[data-test="fp-up"]')!.click();
        f.detectChanges();

        expect(rowNamed(f, 'a.txt').getAttribute('aria-selected')).toBe('true');
        expect(q(f, '[data-test="fp-chip"]')!.textContent).toContain('2 selected');

        const select = q<HTMLSelectElement>(f, '[data-test="fp-space"]')!;
        select.value = 'team';
        select.dispatchEvent(new Event('change'));
        f.detectChanges();
        rowNamed(f, 't1.txt').click();
        f.detectChanges();

        expect(q(f, '[data-test="fp-chip"]')!.textContent).toContain('3 selected');
        expect(q(f, '[data-test="fp-total"]')!.textContent).toContain('3 files, 450 B');

        q(f, '[data-test="fp-chip"]')!.click();
        f.detectChanges();
        expect(qa(f, '[data-test="fp-chosen"] li').map((li) => li.querySelector('.cms-fp__chosen-name')!.textContent!.trim()))
            .toEqual(['a.txt', 'd2.txt', 't1.txt']);

        q(f, '[data-test="fp-confirm"]')!.click();
        expect(confirmed.length).toBe(1);
        expect(confirmed[0].map((c) => [c.id, c.space, c.path])).toEqual([
            ['a.txt', 'mine', ''],
            ['d2.txt', 'mine', 'Docs'],
            ['t1.txt', 'team', ''],
        ]);
    });

    it('removes one choice from the chip, and Clear empties it', () => {
        const f = create();
        rowNamed(f, 'a.txt').click();
        rowNamed(f, 'big.bin').click();
        f.detectChanges();
        q(f, '[data-test="fp-chip"]')!.click();
        f.detectChanges();
        qa(f, '[data-test="fp-unchoose"]')[0].click();
        f.detectChanges();
        expect(q(f, '[data-test="fp-chip"]')!.textContent).toContain('1 selected');
        expect(rowNamed(f, 'a.txt').getAttribute('aria-selected')).toBe('false');

        q(f, '[data-test="fp-clear"]')!.click();
        f.detectChanges();
        expect(q(f, '[data-test="fp-chip"]')).toBeNull();
        expect(q<HTMLButtonElement>(f, '[data-test="fp-confirm"]')!.disabled).toBeTrue();
    });

    it('disables a file that would go over the budget with that reason, and never ticks it', () => {
        // 1000 limit, 300 spent: 700 left; a.txt (100) fits, big.bin (900) does not.
        const f = create({ budget: { usedBytes: 300, limitBytes: 1000 } });
        const big = rowNamed(f, 'big.bin');
        expect(big.getAttribute('aria-disabled')).toBe('true');
        expect(big.querySelector('[data-test="fp-reason"]')!.textContent).toContain('Over the message size limit');
        expect(rowNamed(f, 'a.txt').getAttribute('aria-disabled')).toBeNull();

        big.click();
        f.detectChanges();
        expect(q(f, '[data-test="fp-chip"]')).toBeNull();

        rowNamed(f, 'a.txt').click();
        f.detectChanges();
        expect(q(f, '[data-test="fp-left"]')!.textContent).toContain('600 B of 1 KB left after these');
    });

    it('counts the host cost, not the size, against the budget', () => {
        // Each file costs ten times its size: a.txt costs 1000 of the 999 left.
        const f = create({ budget: { usedBytes: 1, limitBytes: 1000, cost: (e) => (e.size ?? 0) * 10 } });
        expect(rowNamed(f, 'a.txt').getAttribute('aria-disabled')).toBe('true');
    });

    it('shows the host reason before the budget one', () => {
        const f = create({
            budget: { usedBytes: 300, limitBytes: 1000 },
            disabledReason: (e) => (e.id === 'big.bin' ? 'Not a type this sends' : null),
        });
        expect(rowNamed(f, 'big.bin').querySelector('[data-test="fp-reason"]')!.textContent!.trim()).toBe('Not a type this sends');
    });

    it('is over budget when the host has already spent more than the limit: confirm is disabled', () => {
        const f = create({ budget: { usedBytes: 1200, limitBytes: 1000 } });
        expect(q(f, '[data-test="fp-left"]')!.textContent).toContain('Over the message size limit');
        expect(q<HTMLButtonElement>(f, '[data-test="fp-confirm"]')!.disabled).toBeTrue();
    });

    it('disables confirm with nothing chosen, and its label carries the count', () => {
        const f = create({ confirmLabel: (n) => (n === 0 ? 'Attach files' : 'Attach ' + n + ' files') });
        const confirm = q<HTMLButtonElement>(f, '[data-test="fp-confirm"]')!;
        expect(confirm.disabled).toBeTrue();
        expect(confirm.textContent!.trim()).toBe('Attach files');
        rowNamed(f, 'a.txt').click();
        f.detectChanges();
        expect(confirm.disabled).toBeFalse();
        expect(confirm.textContent!.trim()).toBe('Attach 1 files');
    });

    it('names no count on its own confirm label with nothing chosen', () => {
        const f = create();
        const confirm = q<HTMLButtonElement>(f, '[data-test="fp-confirm"]')!;
        expect(confirm.textContent!.trim()).toBe('Choose files');
        rowNamed(f, 'a.txt').click();
        rowNamed(f, 'big.bin').click();
        f.detectChanges();
        expect(confirm.textContent!.trim()).toBe('Choose 2 files');
    });

    it('moves with Up and Down, opens with Enter, ticks with Space, goes up with Backspace, cancels with Escape', () => {
        const f = create();
        const list = q(f, '[role="listbox"]')!;
        expect(list.getAttribute('aria-multiselectable')).toBe('true');

        key(f, 'ArrowDown');
        key(f, 'ArrowUp');
        key(f, 'Enter');
        expect(calls).toContain('mine:Docs');
        expect(q(f, '[data-test="fp-crumb"][aria-current]')!.textContent!.trim()).toBe('Docs');

        key(f, 'ArrowDown');
        expect(q(f, '[role="listbox"]')!.getAttribute('aria-activedescendant')).toBe(qa(f, '[data-test="fp-row"]')[1].id);
        key(f, ' ');
        expect(rowNamed(f, 'd2.txt').getAttribute('aria-selected')).toBe('true');

        key(f, 'Backspace');
        expect(q(f, '[data-test="fp-crumb"][aria-current]')!.textContent!.trim()).toBe('My files');

        key(f, 'End');
        key(f, ' ');
        expect(rowNamed(f, 'big.bin').getAttribute('aria-selected')).toBe('true');

        key(f, 'Escape');
        expect(cancelled).toBe(1);
        expect(confirmed.length).toBe(0);
    });

    it('shows a folder the person may not open as denied in place, with no action, and stays open', () => {
        const f = create();
        rowNamed(f, 'Locked').click();
        f.detectChanges();
        const state = q(f, 'cms-state .cms-state')!;
        expect(state.getAttribute('data-kind')).toBe('denied');
        expect(q(f, '[data-test="state-action"]')).toBeNull();
        expect(cancelled).toBe(0);

        q(f, '[data-test="fp-up"]')!.click();
        f.detectChanges();
        expect(rowNamed(f, 'Docs')).toBeTruthy();
    });

    it('shows a failure with the host words and Retry, which reads the folder again', () => {
        const f = create();
        rowNamed(f, 'Broken').click();
        f.detectChanges();
        expect(q(f, 'cms-state .cms-state')!.getAttribute('data-kind')).toBe('error');
        expect(q(f, 'cms-state')!.textContent).toContain('The drive did not answer');
        const before = calls.filter((c) => c === 'mine:Broken').length;
        q(f, '[data-test="state-action"]')!.click();
        expect(calls.filter((c) => c === 'mine:Broken').length).toBe(before + 1);
    });

    it('asks for the following page near the end of the list, keeping what is shown, once at a time', () => {
        const second = new Subject<FilesPickerPage>();
        const f = create({}, new Map([['page-2', second]]));
        rowNamed(f, 'Many').click();
        f.detectChanges();
        expect(qa(f, '[data-test="fp-row"]').length).toBe(20);

        f.componentInstance.onScroll();
        key(f, 'End');
        f.detectChanges();
        expect(q(f, '[data-test="fp-paging"]')).not.toBeNull();
        expect(calls.filter((c) => c === 'mine:Many@page-2').length).toBe(1);

        second.next({ entries: [file('p2-0', 10), file('p2-1', 10)], next: null });
        f.detectChanges();
        expect(q(f, '[data-test="fp-paging"]')).toBeNull();
        expect(qa(f, '[data-test="fp-row"]').length).toBe(22);
        expect(rowNamed(f, 'p1-0')).toBeTruthy();
    });

    it('draws no space switch for one space, and an empty folder as the empty state', () => {
        const f = create({ spaces: [{ id: 'empty', name: 'Nothing' }] });
        expect(q(f, '[data-test="fp-space"]')).toBeNull();
        expect(q(f, 'cms-state .cms-state')!.getAttribute('data-kind')).toBe('empty');
    });
});

describe('CmsFilesPickerService', () => {
    beforeEach(() => TestBed.configureTestingModule({}));

    afterEach(() => TestBed.inject(Dialog).closeAll());

    it('opens a modal dialog labelled by its title, and resolves undefined on cancel', async () => {
        const answer = TestBed.inject(CmsFilesPickerService).open({
            title: 'Attach from files',
            spaces: [{ id: 'mine', name: 'My files' }],
            list: () => of({ entries: [file('a.txt', 1)] }),
        });
        await new Promise((r) => setTimeout(r));
        TestBed.inject(ApplicationRef).tick();
        const container = document.querySelector<HTMLElement>('.cdk-dialog-container')!;
        expect(container.getAttribute('role')).toBe('dialog');
        expect(container.getAttribute('aria-modal')).toBe('true');
        const title = document.getElementById(container.getAttribute('aria-labelledby') ?? '');
        expect(title?.textContent).toContain('Attach from files');

        document.querySelector<HTMLElement>('[data-test="fp-cancel"]')!.click();
        expect(await answer).toBeUndefined();
    });
});
