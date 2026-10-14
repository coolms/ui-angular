import { DestroyRef, ElementRef, inject, Injectable, NgZone } from '@angular/core';
import { Dialog, DialogRef } from '@angular/cdk/dialog';

/**
 * Returns `true` when the binding acted on the key: the scope then stops the
 * chain and calls `preventDefault` + `stopPropagation`. `false` lets the next
 * binding of the same layer look at it.
 */
export type KeyHandler = (event: KeyboardEvent) => boolean;

export interface KeyBindingOptions {
    /**
     * Fire while focus is in a text field (input, textarea, select) or a
     * contenteditable. Default `false`: a shortcut never takes a key the
     * person is typing.
     */
    readonly inTextFields?: boolean;
}

interface Layer {
    readonly element: Element;
}

interface Binding {
    /** The element whose layer the binding belongs to; `null` = any layer (the Esc coordinator's handlers). */
    readonly host: Element | null;
    readonly handler: KeyHandler;
    readonly inTextFields: boolean;
}

/**
 * The topmost overlay owns the keyboard. ONE stack of layers -- the page at the
 * bottom, then every open dialog in the order it opened, and any other surface
 * pushed with `pushLayer` -- and ONE document listener. A key goes only to the
 * bindings whose host lies in the topmost layer, last bound first, so while an
 * editor, a viewer or a dialog is open, no shortcut of a view beneath it fires.
 *
 * Every CDK dialog is a layer by itself (`Dialog.afterOpened`, dropped on
 * `closed`); nothing per dialog is needed. A key that starts inside the overlay
 * container but in no layer (a menu, an autocomplete) reaches no page binding
 * either. Bindings with no host are the Esc coordinator's: they keep its LIFO
 * contract (each handler says itself whether its overlay is open) on any layer.
 *
 * Bind in a component with {@link bindKeys}; it takes the component's element
 * as the host and unbinds on destroy.
 */
@Injectable({ providedIn: 'root' })
export class KeyboardScopeService {
    private readonly layers: Layer[] = [];
    private readonly bindings: Binding[] = [];

    constructor() {
        const zone = inject(NgZone);
        const dialog = inject(Dialog);
        for (const ref of dialog.openDialogs) {
            this.trackDialog(ref);
        }
        const opened = dialog.afterOpened.subscribe(ref => this.trackDialog(ref));

        const listener = (event: KeyboardEvent): void => {
            zone.run(() => this.dispatch(event));
        };
        document.addEventListener('keydown', listener);
        inject(DestroyRef).onDestroy(() => {
            opened.unsubscribe();
            document.removeEventListener('keydown', listener);
        });
    }

    /**
     * Push a surface that is not a CDK dialog (a drawer editor, a hand-built
     * overlay) as the topmost layer. Returns its removal; calling it twice is a
     * no-op.
     */
    pushLayer(element: Element): () => void {
        const layer: Layer = { element };
        this.layers.push(layer);
        return () => this.drop(layer);
    }

    /** The topmost layer's element, or `null` when only the page is open. */
    topLayer(): Element | null {
        return this.layers.length > 0 ? this.layers[this.layers.length - 1].element : null;
    }

    /**
     * Bind `handler` to the layer `host` lies in. Returns its removal; calling it
     * twice is a no-op.
     */
    bind(host: Element, handler: KeyHandler, options: KeyBindingOptions = {}): () => void {
        return this.add({ host, handler, inTextFields: options.inTextFields ?? false });
    }

    /** The Esc coordinator's binding: any layer, last bound first, in text fields too. */
    bindAnyLayer(handler: KeyHandler): () => void {
        return this.add({ host: null, handler, inTextFields: true });
    }

    private add(binding: Binding): () => void {
        this.bindings.push(binding);
        let removed = false;
        return () => {
            if (removed) return;
            removed = true;
            const i = this.bindings.lastIndexOf(binding);
            if (i >= 0) this.bindings.splice(i, 1);
        };
    }

    private trackDialog(ref: DialogRef<unknown, unknown>): void {
        const drop = this.pushLayer(ref.overlayRef.hostElement);
        ref.closed.subscribe(() => drop());
    }

    private drop(layer: Layer): void {
        const i = this.layers.lastIndexOf(layer);
        if (i >= 0) this.layers.splice(i, 1);
    }

    /** The index of the topmost layer that contains `node`; -1 for the page. */
    private layerIndexOf(node: Node): number {
        for (let i = this.layers.length - 1; i >= 0; i -= 1) {
            if (this.layers[i].element.contains(node)) return i;
        }
        return -1;
    }

    private dispatch(event: KeyboardEvent): void {
        const target = event.target instanceof Element ? event.target : null;
        const top = this.layers.length - 1;
        const typing = target !== null && isTextField(target);
        // A key from inside the overlay container but in no layer -- a menu, an
        // autocomplete -- belongs to that surface, not to the page under it.
        const inUntrackedOverlay = target !== null && this.layerIndexOf(target) < 0
            && target.closest('.cdk-overlay-container') !== null;
        // A modal surface opened without the Dialog service (an overlay with a
        // backdrop) owns the page as well, wherever focus is.
        const untrackedModal = top < 0 && document.querySelector('.cdk-overlay-backdrop-showing') !== null;

        for (let i = this.bindings.length - 1; i >= 0; i -= 1) {
            const b = this.bindings[i];
            if (typing && !b.inTextFields) continue;
            if (b.host !== null) {
                if (inUntrackedOverlay || untrackedModal) continue;
                if (this.layerIndexOf(b.host) !== top) continue;
            }
            if (b.handler(event)) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
        }
    }
}

/** Focus is where the person types: a text field or a contenteditable. */
export function isTextField(el: Element): boolean {
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
        const type = (el.getAttribute('type') ?? 'text').toLowerCase();
        return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image'].includes(type);
    }
    return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * Bind the calling component's shortcuts to its own layer: the component's
 * element is the host, and the binding goes with the component. Call in an
 * injection context (a constructor or a field initializer). Returns the
 * removal, for a component that drops its shortcuts earlier.
 */
export function bindKeys(handler: KeyHandler, options: KeyBindingOptions = {}): () => void {
    const host = inject(ElementRef<Element>).nativeElement as Element;
    const unbind = inject(KeyboardScopeService).bind(host, handler, options);
    inject(DestroyRef).onDestroy(unbind);
    return unbind;
}
