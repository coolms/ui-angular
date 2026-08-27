import { ChangeDetectionStrategy, Component, Type, computed, inject, input } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { FieldWidgetInputs, FieldWidgetRegistry } from './field-widget-registry';

/**
 * Renders the field-widget registered for a `kind` — the single seam every
 * field-rendering surface (content field-panels, DynamicEntity forms, …) goes
 * through to turn a widget `kind` + value into a live input.
 *
 * Resolves `kind` to a component via {@link FieldWidgetRegistry} and binds it
 * with the {@link FieldWidgetInputs} callback contract through
 * `NgComponentOutlet`. When no widget is registered for the kind it renders
 * nothing and reports `false` from {@link resolved} — so a host can fall back to
 * its own input (the registry is additive, never a dead end).
 */
@Component({
    selector: 'app-field-widget-host',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgComponentOutlet],
    template: `
        @if (component(); as comp) {
            <ng-container [ngComponentOutlet]="comp" [ngComponentOutletInputs]="inputs()" />
        }
    `,
})
export class FieldWidgetHostComponent {
    private readonly registry = inject(FieldWidgetRegistry);

    /** The widget kind to render (e.g. `text`, `textarea`, `date`, `tags`). */
    readonly kind = input<string | null | undefined>();
    /** Current value passed to the widget. */
    readonly value = input<unknown>();
    /** Widget descriptor config (e.g. a `suggestionsUrl`); defaults to empty. */
    readonly config = input<Record<string, unknown>>({});
    /** Whether the input is read-only. */
    readonly disabled = input(false);
    /** Change callback the widget invokes with the new value. */
    readonly valueChange = input<(value: unknown) => void>(() => {});

    /** The resolved component for {@link kind}, or null when none is registered. */
    readonly component = computed<Type<unknown> | null>(() => this.registry.componentFor(this.kind()));

    /** True when a widget is registered for {@link kind} (else the host renders nothing). */
    readonly resolved = computed(() => this.component() !== null);

    /** Inputs handed to the widget via `ngComponentOutletInputs`. */
    readonly inputs = computed<FieldWidgetInputs>(() => ({
        value: this.value(),
        config: this.config(),
        disabled: this.disabled(),
        valueChange: this.valueChange(),
    }));
}
