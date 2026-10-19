import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { KeyboardScopeService } from './keyboard-scope.service';

/**
 * The topmost overlay owns the keyboard: a binding fires only while the layer
 * its host lies in is the topmost one -- the page with nothing open over it, or
 * the newest open dialog.
 */

@Component({
    standalone: true,
    template: `<button type="button" class="in-dialog">ok</button><input class="field-in-dialog" type="text">`,
})
class TestDialogComponent {}

function press(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init });
    target.dispatchEvent(event);
    return event;
}

function hostIn(parent: Element): HTMLElement {
    const el = document.createElement('div');
    el.tabIndex = 0;
    parent.appendChild(el);
    return el;
}

describe('KeyboardScopeService', () => {
    let scope: KeyboardScopeService;
    let dialog: Dialog;
    let page: HTMLElement;
    const refs: DialogRef<unknown, TestDialogComponent>[] = [];

    beforeEach(() => {
        TestBed.configureTestingModule({});
        scope = TestBed.inject(KeyboardScopeService);
        dialog = TestBed.inject(Dialog);
        page = hostIn(document.body);
    });

    afterEach(() => {
        refs.splice(0).forEach(r => r.close());
        page.remove();
    });

    function open(): DialogRef<unknown, TestDialogComponent> {
        const ref = dialog.open(TestDialogComponent, { disableClose: true });
        refs.push(ref);
        return ref;
    }

    it('a page binding fires when nothing is open over the page', () => {
        const handler = jasmine.createSpy('page').and.returnValue(true);
        scope.bind(page, handler);
        press(page, 'Delete');
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('with a dialog open, a page binding fires for no key -- from inside the dialog or from the page', () => {
        const handler = jasmine.createSpy('page').and.returnValue(true);
        scope.bind(page, handler);
        const ref = open();
        const inside = ref.overlayRef.hostElement.querySelector('.in-dialog')!;
        expect(inside).withContext('the dialog rendered its button').not.toBeNull();
        for (const key of ['Delete', 'Backspace', 'F2', 'a', 'c', 'v', 'x', 'Escape']) {
            press(inside, key, { ctrlKey: key.length === 1 });
            press(page, key, { ctrlKey: key.length === 1 });
            press(document.body, key, { ctrlKey: key.length === 1 });
        }
        expect(handler).not.toHaveBeenCalled();
    });

    it('the page binding fires again once the dialog has closed', () => {
        const handler = jasmine.createSpy('page').and.returnValue(true);
        scope.bind(page, handler);
        open().close();
        press(page, 'Delete');
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('a binding inside a dialog fires while that dialog is topmost, not while one is open over it', () => {
        const first = open();
        const inner = hostIn(first.overlayRef.hostElement.querySelector('.in-dialog')!.parentElement!);
        const handler = jasmine.createSpy('first dialog').and.returnValue(true);
        scope.bind(inner, handler);

        press(inner, 'Delete');
        expect(handler).toHaveBeenCalledTimes(1);

        const second = open();
        press(inner, 'Delete');
        press(second.overlayRef.hostElement.querySelector('.in-dialog')!, 'Delete');
        expect(handler).withContext('a dialog is open over it').toHaveBeenCalledTimes(1);

        second.close();
        press(inner, 'Delete');
        expect(handler).withContext('its dialog is topmost again').toHaveBeenCalledTimes(2);
    });

    it('a shortcut does not take a key typed in a field; one bound for controls does', () => {
        const field = document.createElement('input');
        page.appendChild(field);
        const shortcut = jasmine.createSpy('shortcut').and.returnValue(false);
        const typed = jasmine.createSpy('typed').and.returnValue(false);
        scope.bind(page, shortcut);
        scope.bind(page, typed, { inControls: true });
        press(field, 'Delete');
        expect(shortcut).not.toHaveBeenCalled();
        expect(typed).toHaveBeenCalledTimes(1);
    });

    it('a form field of any kind takes every key: a contenteditable, a checkbox, a radio, a range, a select', () => {
        const editable = document.createElement('div');
        editable.contentEditable = 'true';
        const fields: Element[] = [editable, document.createElement('select'), document.createElement('textarea')];
        for (const type of ['checkbox', 'radio', 'range', 'color', 'file', 'button']) {
            const input = document.createElement('input');
            input.type = type;
            fields.push(input);
        }
        page.append(...fields);
        const reached: string[] = [];
        scope.bind(page, e => {
            reached.push(`${(e.target as Element).tagName}/${(e.target as HTMLInputElement).type ?? ''}:${e.key}`);
            return false;
        });
        for (const field of fields) {
            for (const key of [' ', 'Enter', 'Delete', 'ArrowDown', 'a']) press(field, key);
        }
        expect(reached).withContext('keys that reached the shortcut from a field').toEqual([]);
    });

    it('a button, a link or a control role takes Space and Enter, which press it; other keys reach the shortcut', () => {
        const button = document.createElement('button');
        const link = document.createElement('a');
        link.href = '#here';
        const role = document.createElement('div');
        role.setAttribute('role', 'checkbox');
        role.tabIndex = 0;
        const row = hostIn(page);
        page.append(button, link, role);
        const names = new Map<EventTarget, string>([[button, 'button'], [link, 'link'], [role, 'role'], [row, 'row']]);
        const reached: string[] = [];
        scope.bind(page, e => {
            reached.push(`${names.get(e.target!)}:${e.key === ' ' ? 'Space' : e.key}`);
            return false;
        });
        for (const el of [button, link, role, row]) {
            for (const key of [' ', 'Enter', 'Delete']) press(el, key);
        }
        expect(reached).toEqual(['button:Delete', 'link:Delete', 'role:Delete', 'row:Space', 'row:Enter', 'row:Delete']);
    });

    it('a key from an overlay that is no layer (a menu) reaches no page binding', () => {
        const container = document.createElement('div');
        container.className = 'cdk-overlay-container';
        const item = hostIn(container);
        document.body.appendChild(container);
        const handler = jasmine.createSpy('page').and.returnValue(true);
        scope.bind(page, handler);
        press(item, 'Delete');
        container.remove();
        expect(handler).not.toHaveBeenCalled();
    });

    it('the last binding of the layer goes first; true stops the rest and prevents the default', () => {
        const calls: string[] = [];
        scope.bind(page, () => { calls.push('earlier'); return true; });
        scope.bind(page, () => { calls.push('later, passes'); return false; });
        const event = press(page, 'Delete');
        expect(calls).toEqual(['later, passes', 'earlier']);
        expect(event.defaultPrevented).toBeTrue();

        calls.length = 0;
        scope.bind(page, () => { calls.push('latest, takes'); return true; });
        press(page, 'Delete');
        expect(calls).toEqual(['latest, takes']);
    });

    it('a pushed layer owns the keyboard until it is removed; removing twice is harmless', () => {
        const handler = jasmine.createSpy('page').and.returnValue(true);
        scope.bind(page, handler);
        const surface = hostIn(document.body);
        const remove = scope.pushLayer(surface);
        expect(scope.topLayer()).toBe(surface);
        press(page, 'Delete');
        expect(handler).not.toHaveBeenCalled();
        remove();
        remove();
        expect(scope.topLayer()).toBeNull();
        press(page, 'Delete');
        expect(handler).toHaveBeenCalledTimes(1);
        surface.remove();
    });

    it('an unbound shortcut fires no more; unbinding twice is harmless', () => {
        const handler = jasmine.createSpy('page').and.returnValue(true);
        const unbind = scope.bind(page, handler);
        unbind();
        unbind();
        press(page, 'Delete');
        expect(handler).not.toHaveBeenCalled();
    });

    it('an any-layer binding (the Esc coordinator\'s) still fires with a dialog open, in a field too', () => {
        const esc = jasmine.createSpy('esc').and.returnValue(true);
        scope.bindAnyLayer(e => e.key === 'Escape' && esc());
        const ref = open();
        press(ref.overlayRef.hostElement.querySelector('.field-in-dialog')!, 'Escape');
        expect(esc).toHaveBeenCalledTimes(1);
    });
});
