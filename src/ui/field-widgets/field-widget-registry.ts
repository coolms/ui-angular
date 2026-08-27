import { InjectionToken, Injectable, Type, inject } from '@angular/core';

/**
 * The inputs every field-widget component receives (passed via
 * `ngComponentOutletInputs`). `value`/`valueChange` are a one-way value + a
 * change callback (rather than an `@Output`, which `NgComponentOutlet` can't
 * bind); `config` is the backend widget descriptor (`field.widget`).
 */
export interface FieldWidgetInputs extends Record<string, unknown> {
    readonly value: unknown;
    readonly config: Record<string, unknown>;
    readonly disabled: boolean;
    readonly valueChange: (value: unknown) => void;
}

interface FieldWidgetEntry {
    readonly kind: string;
    readonly component: Type<unknown>;
}

/** Multi-provider token a module uses to register a field-widget (see {@link provideFieldWidget}). */
export const FIELD_WIDGET = new InjectionToken<readonly FieldWidgetEntry[]>('FIELD_WIDGET');

/**
 * Front-end side of the field-widget registry (the backend half is
 * `App\Field\Domain\Registry\FieldWidgetRegistry`). Maps a widget `kind` — as
 * carried by a field descriptor's `widget.kind` from `GET /content/field-panels`
 * — to the Angular component that renders it.
 *
 * A module registers its widget once (e.g. `provideFieldWidget('tags', …)` in
 * `app.config`); any field-rendering surface then resolves the component by
 * kind, so adding a widget needs no edit to the surfaces that render fields.
 */
@Injectable({ providedIn: 'root' })
export class FieldWidgetRegistry {
    private readonly byKind = new Map<string, Type<unknown>>();

    constructor() {
        for (const entry of inject(FIELD_WIDGET, { optional: true }) ?? []) {
            // First registration per kind wins.
            if (!this.byKind.has(entry.kind)) {
                this.byKind.set(entry.kind, entry.component);
            }
        }
    }

    /** The component for the given widget kind, or null when none is registered. */
    componentFor(kind: string | null | undefined): Type<unknown> | null {
        return kind ? this.byKind.get(kind) ?? null : null;
    }
}

/**
 * Register a field-widget component for a widget `kind`. Add the result to an
 * application's providers (e.g. `app.config.ts`); the component is then used
 * wherever a field declares `widget.kind === kind`.
 */
export function provideFieldWidget(kind: string, component: Type<unknown>): { provide: typeof FIELD_WIDGET; useValue: FieldWidgetEntry; multi: true } {
    return { provide: FIELD_WIDGET, useValue: { kind, component }, multi: true };
}
