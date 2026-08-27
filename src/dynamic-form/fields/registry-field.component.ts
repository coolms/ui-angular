import {
    ChangeDetectionStrategy,
    Component,
    ViewEncapsulation,
    computed,
    effect,
    inject,
    input,
    signal,
} from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { FieldItem } from '@coolms/core-angular';
import { FieldWidgetHostComponent } from '../../ui/field-widgets/field-widget-host.component';
import { FieldWidgetRegistry } from '../../ui/field-widgets/field-widget-registry';

/**
 * Bridges a DynamicEntity form field to the shared **field-widget registry**.
 *
 * The dynamic form is a Reactive-Forms surface (`FormGroup`/`FormControl`) with
 * its own input components for the common types; this is its `@default` branch —
 * for a type none of those handle, it renders the registry widget (e.g. a
 * module's `tags` / `taxonomy` picker) instead of "not supported", translating
 * between the registry's `{value, valueChange}` callback contract and the
 * underlying `FormControl`. When no widget is registered for the type it shows
 * the original "not yet supported" notice, so the form never breaks.
 *
 * Note: DynamicEntity field schemas don't carry a widget `config` block (unlike
 * the content field-panels), so widgets are handed an empty config here — a
 * `tags` field still works (free-add), just without a backend suggestions URL.
 */
@Component({
    selector: 'app-registry-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    imports: [FieldWidgetHostComponent],
    template: `
        @if (kind(); as k) {
            <div class="form-group">
                <label class="form-label">
                    {{ item().label }}
                    @if (item().required) { <span class="text-danger">*</span> }
                </label>
                <app-field-widget-host
                    [kind]="k"
                    [value]="value()"
                    [config]="config()"
                    [disabled]="disabled()"
                    [valueChange]="onChange" />
                @if (item().hint) {
                    <div class="form-text text-muted">{{ item().hint }}</div>
                }
            </div>
        } @else {
            <div class="field-not-supported">
                Field type "{{ item().type }}" not yet supported.
            </div>
        }
    `,
})
export class RegistryFieldComponent {
    private readonly registry = inject(FieldWidgetRegistry);

    item = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();

    private readonly control = computed<AbstractControl | null>(() => this.formGroup().get(this.item().alias));

    /** The registry widget kind for this field's type, or null when none is registered. */
    readonly kind = computed<string | null>(() => {
        const type = this.item().type;
        return this.registry.componentFor(type) ? type : null;
    });

    /** Current control value, mirrored into a signal so external resets re-render. */
    readonly value = signal<unknown>(null);
    readonly disabled = computed(() => this.item().readonly || (this.control()?.disabled ?? false));
    readonly config = computed<Record<string, unknown>>(() => ({}));

    constructor() {
        // Seed from the control and track external value changes (patches /
        // resets). Our own writes use `emitEvent: false`, so this never echoes.
        effect((onCleanup) => {
            const ctrl = this.control();
            if (!ctrl) {
                return;
            }
            this.value.set(ctrl.value);
            const sub = ctrl.valueChanges.subscribe(v => this.value.set(v));
            onCleanup(() => sub.unsubscribe());
        });
    }

    readonly onChange = (next: unknown): void => {
        const ctrl = this.control();
        if (!ctrl) {
            return;
        }
        ctrl.setValue(next, { emitEvent: false });
        ctrl.markAsDirty();
        ctrl.markAsTouched();
        this.value.set(next);
    };
}
