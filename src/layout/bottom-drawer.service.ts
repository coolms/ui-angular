import { Injectable, signal, Type } from '@angular/core';

/**
 * Service for the resizable bottom-drawer editor panel.
 *
 * Components opened here must accept their data as `@Input()` properties
 * (passed via NgComponentOutlet inputs) rather than via DIALOG_DATA.
 * The panel behaves like the VS Code terminal — slides up from the shell
 * bottom, can be resized by dragging the top edge, and is dismissed by
 * calling close() or by the editor's own close button.
 */
@Injectable({ providedIn: 'root' })
export class BottomDrawerService {
    readonly isOpen    = signal(false);
    readonly component = signal<Type<unknown> | null>(null);
    readonly inputs    = signal<Record<string, unknown>>({});
    readonly height    = signal(420);

    open(component: Type<unknown>, inputs: Record<string, unknown> = {}): void {
        this.component.set(component);
        this.inputs.set(inputs);
        this.isOpen.set(true);
    }

    close(): void {
        this.isOpen.set(false);
        setTimeout(() => {
            if (!this.isOpen()) {
                this.component.set(null);
                this.inputs.set({});
            }
        }, 200);
    }

    setHeight(px: number): void {
        this.height.set(Math.max(120, Math.min(800, px)));
    }
}
