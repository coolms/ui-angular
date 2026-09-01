import { Component, DestroyRef, input, output, inject, OnInit, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CmsLoaderComponent } from '@coolms/core-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ReactiveFormsModule, FormBuilder, FormGroup, ValidatorFn, Validators, AbstractControl } from '@angular/forms';
import { FormRenderService } from './form-render.service';
import { ErrorHandlerService, FormRenderDefinition, FieldItem } from '@coolms/core-angular';
import { DynamicLayoutComponent } from './dynamic-layout.component';
import { LoadingComponent } from '../ui/state/loading.component';
import { ErrorBannerComponent } from '../ui/state/error-banner.component';

@Component({
    selector: 'app-dynamic-form',
    standalone: true,
    imports: [CmsLoaderComponent, ReactiveFormsModule, DynamicLayoutComponent, LoadingComponent, ErrorBannerComponent],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        @if (loading()) {
            <app-loading label="Loading form…" />
        }
        @if (loadError(); as err) {
            <app-error-banner [message]="err" [showRetry]="true" (retry)="loadDefinition()" />
        }
        @if (definition(); as def) {
            <form [formGroup]="formGroup()" (ngSubmit)="submit()" autocomplete="off">
                <app-dynamic-layout
                    [nodes]="def.layout"
                    [itemsMap]="itemsMap()"
                    [formGroup]="formGroup()"
                    [formId]="formId()"
                    [context]="context()"
                />
                <!-- Slot for dialog-supplied extra fields that need host context
                     (e.g. the NaviNode template picker, which needs the tree's
                     resolved theme). Renders after the declared fields, before
                     the footer. Empty for every other consumer. -->
                <ng-content />
                @if (serverError()) {
                    <div class="alert alert-danger py-2 px-3 mt-2" style="font-size:.875rem">
                        {{ serverError() }}
                    </div>
                }
                @if (showActions()) {
                    @if (declaredActions() && def.actions.length) {
                        <!-- Preview mode: render the form's OWN declared actions exactly
                             as the public SSR site will (Submit/Cancel/…). -->
                        <div class="form-actions">
                            @for (action of def.actions; track action.name) {
                                <button [type]="action.type" [name]="action.name"
                                        class="cms-btn" [class]="actionClass(action.variant)"
                                        [disabled]="submitDisabled()">
                                    {{ action.label }}
                                </button>
                            }
                        </div>
                    } @else {
                        <div class="form-actions">
                            <button type="button" class="cms-btn"
                                    (click)="cancelled.emit()">
                                Cancel
                            </button>
                            <button type="submit" class="cms-btn cms-btn-primary"
                                    [disabled]="formGroup().invalid || saving() || submitDisabled()">
                                @if (saving()) {
                                    <cms-loader [inline]="true" />
                                }
                                {{ saving() ? 'Saving…' : submitLabel() }}
                            </button>
                        </div>
                    }
                }
            </form>
        }
    `,
})
export class DynamicFormComponent implements OnInit {
    // ── Inputs ────────────────────────────────────────────────────────────────
    formId          = input.required<string>();
    context         = input<'create' | 'edit'>('create');
    initialValue    = input<Record<string, unknown>>({});
    submitLabel     = input<string>('Save');
    /** When true, the submit button is disabled regardless of form validity. */
    submitDisabled  = input<boolean>(false);
    /** Extra fields merged into submitted value — not rendered in the form. */
    extraPayload    = input<Record<string, unknown>>({});
    /**
     * Aliases to render read-only on top of whatever the definition says.
     *
     * For a field the DEFINITION cannot know is fixed, because the reason is
     * runtime state rather than form design — a module setting this deployment
     * pins in its environment, say. The definition's own `readonly` still
     * applies; this only ever adds.
     *
     * ⚠️ Read-only here means the control is DISABLED, and Angular still reports
     * a disabled control in `getRawValue()` — which {@link submit} uses, so the
     * value is still submitted. A host that must not send these has to drop them
     * itself; changing `getRawValue()` to `value` would silently stop submitting
     * every definition-level readonly field across the app, several of which are
     * identifiers the server needs.
     */
    readonlyFields  = input<readonly string[]>([]);
    /** Preview mode: render the form's OWN declared `actions` footer (exactly as
     *  the public SSR site will) instead of the host Cancel/Save footer. Off by
     *  default so admin CRUD dialogs keep their Cancel/Save footer unchanged. */
    declaredActions = input<boolean>(false);
    /**
     * Render no footer at all, because the host owns one.
     *
     * For a dialog whose action bar carries more than Cancel/Save — a Reset, the
     * record's id — where a second row of buttons inside the body would read as
     * two competing footers. Such a host drives {@link submit} itself and reads
     * {@link saving} for its own button state. Defaults to true: every existing
     * consumer keeps its footer.
     */
    showActions = input<boolean>(true);

    // ── Outputs ───────────────────────────────────────────────────────────────
    submitted    = output<Record<string, unknown>>();
    cancelled    = output<void>();
    /** Emitted on every form value change — useful for dirty-state tracking. */
    formChanged  = output<void>();

    // ── State ─────────────────────────────────────────────────────────────────
    loading     = signal(true);
    loadError   = signal<string | null>(null);
    serverError = signal<string | null>(null);
    saving      = signal(false);
    definition  = signal<FormRenderDefinition | null>(null);

    itemsMap = computed<Record<string, FieldItem>>(() => {
        const def = this.definition();
        if (!def) return {};
        return Object.fromEntries(def.items.map(item => [item.alias, item]));
    });

    formGroup = signal<FormGroup>(new FormGroup({}));

    private readonly formRenderService = inject(FormRenderService);
    private readonly fb                = inject(FormBuilder);
    private readonly errors            = inject(ErrorHandlerService);
    private readonly destroyRef        = inject(DestroyRef);

    ngOnInit(): void {
        this.loadDefinition();
    }

    /** (Re)fetch the form definition. Public so the error banner's Retry can re-run it. */
    loadDefinition(): void {
        this.loading.set(true);
        this.loadError.set(null);
        this.formRenderService.fetch(this.formId(), this.context()).subscribe({
            next: def => {
                this.definition.set(def);
                const group = this.buildFormGroup(def.items);
                const init  = this.initialValue();
                if (Object.keys(init).length > 0) {
                    group.patchValue(init);
                }
                this.formGroup.set(group);
                this.loading.set(false);
                // Emit formChanged on every user interaction so parents can track dirty state.
                group.valueChanges
                    .pipe(takeUntilDestroyed(this.destroyRef))
                    .subscribe(() => this.formChanged.emit());
            },
            error: err => {
                this.loadError.set(this.errors.humanize(err));
                this.loading.set(false);
            },
        });
    }

    submit(): void {
        if (this.formGroup().invalid) {
            this.formGroup().markAllAsTouched();
            return;
        }
        this.saving.set(true);
        this.serverError.set(null);
        const value = { ...this.asDeclaredTypes(this.formGroup().getRawValue()), ...this.extraPayload() };
        this.submitted.emit(value);
    }

    /** Call from parent on server error after submit. */
    setServerError(message: string): void {
        this.saving.set(false);
        this.serverError.set(message);
    }

    /** Call from parent on successful submit. */
    resetSaving(): void {
        this.saving.set(false);
    }

    /**
     * Return the FormControl for the field with the given alias, or null if not found.
     * Used by parent components to set field-level server errors from API violation responses.
     */
    getControl(alias: string): AbstractControl | null {
        return this.formGroup().get(alias);
    }

    /** Map a FormAction variant to the matching cms-btn modifier class. */
    actionClass(variant: string): string {
        switch (variant) {
            case 'primary': return 'cms-btn-primary';
            case 'danger':  return 'cms-btn-danger';
            case 'link':    return 'cms-btn-link';
            default:        return '';
        }
    }

    /**
     * Give a `number` field a NUMBER.
     *
     * ⚠️ **Angular's `NumberValueAccessor` never applies here, and that is not
     * obvious.** Its selector is `input[type=number]`, matched at COMPILE time
     * against the static template — and this form binds `[type]="item().type"`,
     * so the selector cannot match and the default string accessor is used
     * instead. Every "number" field this form has ever rendered therefore
     * submitted a STRING.
     *
     * That was invisible for as long as nothing checked: a settings row storing
     * `"300"` where the module reads `is_int()` would save, read back, and be
     * silently discarded — the exact "saves and does nothing" failure the
     * settings tier exists to prevent. It only surfaced when a write validation
     * started refusing the mismatch out loud.
     *
     * An empty field becomes `null`, not `0`: an operator who cleared a box did
     * not ask for zero, and the server is the right place to decide whether that
     * key may be cleared at all. A value that is not a number is left ALONE so
     * validation can report it, rather than being coerced into `NaN`.
     *
     * @param value the form's raw value
     *
     * @return the same map with declared-numeric fields as numbers
     */
    private asDeclaredTypes(value: Record<string, unknown>): Record<string, unknown> {
        const items = this.itemsMap();
        const out: Record<string, unknown> = { ...value };

        for (const [alias, raw] of Object.entries(out)) {
            if ('number' !== items[alias]?.type) continue;
            if ('' === raw || null === raw || undefined === raw) {
                out[alias] = null;
                continue;
            }
            const asNumber = Number(raw);
            if (!Number.isNaN(asNumber)) out[alias] = asNumber;
        }

        return out;
    }

    private buildFormGroup(items: readonly FieldItem[]): FormGroup {
        const controls: Record<string, AbstractControl> = {};
        const pinned = new Set(this.readonlyFields());
        for (const item of items) {
            if (item.type === 'subform') continue; // handled separately
            controls[item.alias] = this.fb.control(
                { value: null, disabled: item.readonly || pinned.has(item.alias) },
                this.buildValidators(item),
            );
        }
        return this.fb.group(controls);
    }

    private buildValidators(item: FieldItem) {
        const vs: ValidatorFn[] = [];
        if (item.required) vs.push(Validators.required);

        for (const v of item.validators ?? []) {
            switch (v.type) {
                case 'NotBlank': vs.push(Validators.required); break;
                case 'Email':    vs.push(Validators.email);    break;
                case 'Length': {
                    const val = v.value as Record<string, number> | number | null;
                    if (typeof val === 'number') {
                        vs.push(Validators.maxLength(val));
                    } else if (val && typeof val === 'object') {
                        if (val['max'] != null) vs.push(Validators.maxLength(val['max']));
                        if (val['min'] != null) vs.push(Validators.minLength(val['min']));
                    }
                    break;
                }
                case 'Range': {
                    const val = v.value as Record<string, number> | null;
                    if (val) {
                        if (val['min'] != null) vs.push(Validators.min(val['min']));
                        if (val['max'] != null) vs.push(Validators.max(val['max']));
                    }
                    break;
                }
                case 'Regex': {
                    const m = typeof v.value === 'string' && v.value.match(/^\/(.+)\/([gimsuy]*)$/);
                    if (m) vs.push(Validators.pattern(new RegExp(m[1], m[2])));
                    break;
                }
            }
        }
        return Validators.compose(vs);
    }
}
