import { Component, computed, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { ComponentRegistry } from '@coolms/core-angular';
/**
 * Renders a registered component dynamically by string key.
 *
 * Usage:
 *   <app-slot key="MediaLibraryPage" />
 *   <app-slot key="MediaLibraryPage" [inputs]="{ someInput: value }" />
 *
 * Renders nothing (no error) when the key is not found in ComponentRegistry.
 */
@Component({
    selector: 'app-slot',
    standalone: true,
    imports: [NgComponentOutlet],
    template: `
        @if (component()) {
            <ng-container *ngComponentOutlet="component()!; inputs: inputs()" />
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [`:host { display: contents; }`],
})
export class SlotComponent {
    readonly key    = input.required<string>();
    readonly inputs = input<Record<string, unknown>>({});

    private readonly registry = inject(ComponentRegistry);

    readonly component = computed(() => this.registry.get(this.key()));
}
