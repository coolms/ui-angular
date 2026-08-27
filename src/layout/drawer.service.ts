import { inject, Injectable, signal, Type } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * Service for the right-side drawer panel.
 *
 * Any component can open the drawer with arbitrary content:
 *   drawerService.open(MyComponent, { record: item }, 'My title')
 *
 * The drawer closes itself or can be closed programmatically:
 *   drawerService.close()
 *   drawerService.toggle()
 *
 * `title` is read by the admin shell wrapper to render the drawer
 * header; an empty title falls back to a generic 'Panel' label.
 *
 * **Auto-close on navigation** (M1.2.f.4): every `NavigationEnd`
 * closes the drawer if it's open. Without this, a panel opened on
 * page A (e.g., Calendar settings) stayed visible after navigating
 * to page B (e.g., Navigation), showing stale, irrelevant content.
 */
@Injectable({ providedIn: 'root' })
export class DrawerService {
    isOpen    = signal(false);
    component = signal<Type<unknown> | null>(null);
    inputs    = signal<Record<string, unknown>>({});
    title     = signal<string>('');

    private readonly router = inject(Router);

    constructor() {
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd),
        ).subscribe(() => {
            if (this.isOpen()) {
                this.close();
            }
        });
    }

    open(
        component: Type<unknown>,
        inputs: Record<string, unknown> = {},
        title: string = '',
    ): void {
        this.component.set(component);
        this.inputs.set(inputs);
        this.title.set(title);
        this.isOpen.set(true);
    }

    close(): void {
        this.isOpen.set(false);
        // Delay component clear for exit animation to complete
        setTimeout(() => {
            if (!this.isOpen()) {
                this.component.set(null);
                this.inputs.set({});
                this.title.set('');
            }
        }, 200);
    }

    toggle(): void {
        if (this.isOpen()) {
            this.close();
        } else {
            this.isOpen.set(true);
        }
    }
}
