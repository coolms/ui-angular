import { Component, inject, input, signal, ChangeDetectionStrategy } from '@angular/core';

import { FormGroup } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DynamicFieldComponent } from './dynamic-field.component';
import { FormRenderService } from './form-render.service';
import { FieldItem, LayoutNode, VisibilityCondition } from '@coolms/core-angular';
/**
 * Recursively renders a layout tree: groups, grids, columns, tabs, and field-alias leaves.
 *
 * Uses Default change detection so that showWhen conditions re-evaluate
 * synchronously on every user interaction without needing valueChanges subscriptions.
 */
@Component({
    selector: 'app-dynamic-layout',
    standalone: true,
    imports: [DynamicFieldComponent],
    template: `
        @for (node of nodes(); track node.type + (node.name ?? '')) {
            @if (isVisible(node)) {
                @switch (node.type) {

                    @case ('group') {
                        <div class="form-group-section" [class.compact]="node.compact">
                            @if (node.name) {
                                <h4 class="form-group-title">{{ node.name }}</h4>
                            }
                            @if (node.description) {
                                <p class="form-group-desc">{{ node.description }}</p>
                            }
                            <app-dynamic-layout
                                [nodes]="node.children ?? []"
                                [itemsMap]="itemsMap()"
                                [formGroup]="formGroup()"
                                [formId]="formId()"
                                [context]="context()"
                            />
                        </div>
                    }

                    @case ('grid') {
                        <!-- Inline column divs so Bootstrap flex grid works:
                             .col-md-* must be direct children of .row, but a recursive
                             <app-dynamic-layout> wrapper would break that relationship. -->
                        <div class="row g-3">
                            @for (col of node.children ?? []; track col.type + (col.name ?? '')) {
                                <div [class]="'col-md-' + (col.width ?? 12)">
                                    <app-dynamic-layout
                                        [nodes]="col.children ?? []"
                                        [itemsMap]="itemsMap()"
                                        [formGroup]="formGroup()"
                                        [formId]="formId()"
                                        [context]="context()"
                                    />
                                </div>
                            }
                        </div>
                    }

                    @case ('column') {
                        <!-- Standalone column (outside a grid node) — rare but supported -->
                        <div [class]="'col-md-' + (node.width ?? 12)">
                            <app-dynamic-layout
                                [nodes]="node.children ?? []"
                                [itemsMap]="itemsMap()"
                                [formGroup]="formGroup()"
                                [formId]="formId()"
                                [context]="context()"
                            />
                        </div>
                    }

                    @case ('tabs') {
                        <div class="form-tabs">
                            <div class="form-tabs__nav">
                                @for (tab of node.children ?? []; track tab.name) {
                                    <button type="button"
                                            class="form-tabs__btn"
                                            [class.form-tabs__btn--active]="activeTab() === ($index)"
                                            (click)="activeTab.set($index)">
                                        {{ tab.name }}
                                    </button>
                                }
                            </div>
                            <div class="form-tabs__content">
                                @for (tab of node.children ?? []; track tab.name; let i = $index) {
                                    @if (activeTab() === i) {
                                        <app-dynamic-layout
                                            [nodes]="tab.children ?? []"
                                            [itemsMap]="itemsMap()"
                                            [formGroup]="formGroup()"
                                            [formId]="formId()" [context]="context()" />
                                    }
                                }
                            </div>
                        </div>
                    }

                    @case ('tab') {
                        <!-- rendered by parent tabs node — never rendered standalone -->
                    }

                    @case ('wizard') {
                        <div class="form-wizard">
                            <ol class="form-wizard__steps">
                                @for (step of node.children ?? []; track step.name; let i = $index) {
                                    <li class="form-wizard__step"
                                        [class.form-wizard__step--active]="currentStep() === i"
                                        [class.form-wizard__step--done]="currentStep() > i"
                                        (click)="goToStep(i, node)">
                                        <span class="form-wizard__step-num">{{ i + 1 }}</span>
                                        <span class="form-wizard__step-label">{{ step.name || ('Step ' + (i + 1)) }}</span>
                                    </li>
                                }
                            </ol>
                            @for (step of node.children ?? []; track step.name; let i = $index) {
                                @if (currentStep() === i) {
                                    @if (step.description) {
                                        <p class="form-group-desc">{{ step.description }}</p>
                                    }
                                    <app-dynamic-layout
                                        [nodes]="step.children ?? []"
                                        [itemsMap]="itemsMap()"
                                        [formGroup]="formGroup()" />
                                }
                            }
                            @if (stepError()) {
                                <div class="form-wizard__error" role="alert">{{ stepError() }}</div>
                            }
                            <div class="form-wizard__nav">
                                <button type="button" class="cms-btn"
                                        [disabled]="currentStep() === 0"
                                        (click)="prevStep()">
                                    Back
                                </button>
                                @if (currentStep() < lastStepIndex(node)) {
                                    <button type="button" class="cms-btn cms-btn-primary"
                                            [disabled]="validating()"
                                            (click)="nextStep(node)">
                                        {{ validating() ? 'Checking…' : 'Next' }}
                                    </button>
                                } @else {
                                    <span class="form-wizard__final">Final step — submit below.</span>
                                }
                            </div>
                        </div>
                    }

                    @case ('step') {
                        <!-- rendered by parent wizard node — never rendered standalone -->
                    }

                    @default {
                        <!-- Field alias leaf -->
                        @if (itemsMap()[node.type]; as item) {
                            <app-dynamic-field
                                [item]="item"
                                [formGroup]="formGroup()"
                            />
                        }
                    }
                }
            }
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [`
        .form-group-section { margin-bottom: 20px; }
        .form-group-section.compact { margin-bottom: 12px; }
        .form-group-title {
            font-size: .95rem; font-weight: 600;
            color: var(--cms-text-body); margin: 0 0 4px;
            padding-bottom: 6px;
            border-bottom: 1px solid var(--cms-border);
        }
        .form-group-desc { font-size: .8rem; color: var(--cms-text-secondary); margin: 0 0 12px; }

        .form-tabs__nav {
            display: flex; gap: 0;
            border-bottom: 2px solid var(--cms-border);
            margin-bottom: 20px;
        }
        .form-tabs__btn {
            padding: 8px 16px;
            border: none; background: none;
            font-size: .875rem; font-weight: 500;
            color: var(--cms-text-secondary);
            cursor: pointer; border-bottom: 2px solid transparent;
            margin-bottom: -2px; transition: color .15s, border-color .15s;
        }
        .form-tabs__btn:hover { color: var(--cms-text); }
        .form-tabs__btn--active {
            color: var(--cms-accent-text);
            border-bottom-color: var(--cms-accent);
        }
        .form-tabs__content { padding-top: 4px; }

        /* Wizard (multi-step) — step indicator + Back/Next nav */
        .form-wizard__steps {
            display: flex; flex-wrap: wrap; gap: 4px;
            list-style: none; margin: 0 0 20px; padding: 0;
            counter-reset: step;
        }
        .form-wizard__step {
            display: inline-flex; align-items: center; gap: 8px;
            padding: 6px 14px 6px 8px; border-radius: 999px;
            font-size: .8125rem; color: var(--cms-text-secondary);
            cursor: pointer; user-select: none;
            border: 1px solid var(--cms-border); background: var(--cms-surface);
        }
        .form-wizard__step-num {
            display: inline-flex; align-items: center; justify-content: center;
            width: 22px; height: 22px; border-radius: 50%;
            background: var(--cms-border-light); color: var(--cms-text-secondary);
            font-size: .75rem; font-weight: 600; flex: 0 0 auto;
        }
        .form-wizard__step--done { color: var(--cms-text); }
        .form-wizard__step--done .form-wizard__step-num {
            background: var(--cms-success, #16a34a); color: var(--cms-text-inverse);
        }
        .form-wizard__step--active {
            border-color: var(--cms-accent); color: var(--cms-accent-text); font-weight: 600;
        }
        .form-wizard__step--active .form-wizard__step-num {
            background: var(--cms-accent); color: var(--cms-accent-fg, #1a1a1a);
        }
        .form-wizard__nav {
            display: flex; align-items: center; gap: 10px;
            margin-top: 20px; padding-top: 14px;
            border-top: 1px solid var(--cms-border);
        }
        .form-wizard__final { font-size: .8125rem; color: var(--cms-text-muted); }
        .form-wizard__error {
            margin-top: 14px; padding: 8px 12px;
            font-size: .8125rem; color: var(--cms-danger, #dc2626);
            background: var(--cms-danger-light, #fef2f2);
            border: 1px solid var(--cms-danger, #dc2626); border-radius: var(--cms-radius, 6px);
        }
    `],
})
export class DynamicLayoutComponent {
    nodes     = input.required<ReadonlyArray<LayoutNode>>();
    itemsMap  = input.required<Record<string, FieldItem>>();
    formGroup = input.required<FormGroup>();

    /**
     * Form id + context, threaded down from <app-dynamic-form>. When a formId is
     * present, a wizard's "Next" additionally gates on the SERVER (WZ-C) after the
     * instant client check. Null in contexts without a form id -> client-only gate.
     */
    formId  = input<string | null>(null);
    context = input<'create' | 'edit'>('create');

    /** Active tab index for this layout instance (used when type === 'tabs'). */
    activeTab = signal(0);

    /** Active step index for this layout instance (used when type === 'wizard'). */
    currentStep = signal(0);
    /** Set when a forward navigation is blocked by an invalid current step (WZ-B). */
    stepError = signal<string | null>(null);
    /** True while a server-side per-step validation (WZ-C) is in flight. */
    validating = signal(false);

    private readonly renderService = inject(FormRenderService);

    /** Last reachable step index for a wizard node. */
    lastStepIndex(node: LayoutNode): number {
        return Math.max(0, (node.children?.length ?? 1) - 1);
    }

    /**
     * Advance to the next step. WZ-B gates on the current step's validity client-side
     * (instant); WZ-C then re-checks it server-side (authoritative) when a formId is
     * available. Either gate failing shows a step-level banner and does NOT advance.
     */
    async nextStep(node: LayoutNode): Promise<void> {
        if (!(await this.canLeaveCurrentStep(node))) return;
        this.currentStep.update(s => Math.min(this.lastStepIndex(node), s + 1));
    }

    /** Step back one (clamped to the first). Going back never validates. */
    prevStep(): void {
        this.stepError.set(null);
        this.currentStep.update(s => Math.max(0, s - 1));
    }

    /**
     * Jump directly to a step via the step-indicator pill. Going back (or staying)
     * is always allowed; jumping FORWARD past an invalid current step is gated,
     * same as Next.
     */
    async goToStep(index: number, node: LayoutNode): Promise<void> {
        if (index > this.currentStep() && !(await this.canLeaveCurrentStep(node))) return;
        this.stepError.set(null);
        this.currentStep.set(index);
    }

    /**
     * WZ-B + WZ-C — gate leaving the current wizard step: the instant client check
     * first (so we never round-trip on an obviously-invalid step), then — when a
     * formId is available — the server-authoritative WZ-C check. A server/network
     * error does NOT block (degrades to the client gate; the final submit re-validates).
     */
    private async canLeaveCurrentStep(node: LayoutNode): Promise<boolean> {
        if (!this.validateStep(node)) {
            this.stepError.set('Please complete the required fields on this step before continuing.');
            return false;
        }
        this.stepError.set(null);

        const formId = this.formId();
        if (!formId) return true;

        this.validating.set(true);
        try {
            const result = await firstValueFrom(this.renderService.validateStep(
                formId,
                this.currentStep(),
                this.context(),
                this.formGroup().getRawValue() as Record<string, unknown>,
            ));
            if (result.valid) return true;
            this.applyServerViolations(result.violations);
            this.stepError.set('Please correct the highlighted fields before continuing.');
            return false;
        } catch {
            return true; // server unreachable -> trust the client gate; final submit still validates
        } finally {
            this.validating.set(false);
        }
    }

    /**
     * Surface server violations on the offending field controls (marks them invalid
     * + touched so each field shows its error state). The custom `server` error is
     * replaced by the control's own validators the moment the user edits the field.
     */
    private applyServerViolations(violations: Record<string, string[]>): void {
        const fg = this.formGroup();
        for (const [alias, messages] of Object.entries(violations ?? {})) {
            const control = fg.get(alias);
            if (control) {
                control.setErrors({ ...(control.errors ?? {}), server: messages[0] ?? 'Invalid' });
                control.markAsTouched();
            }
        }
    }

    /**
     * Validate the wizard's CURRENT step: mark every field control under the step
     * touched (arming each field's inline error) and return whether all are valid.
     */
    private validateStep(wizard: LayoutNode): boolean {
        const step = (wizard.children ?? [])[this.currentStep()];
        if (!step) return true;
        const fg = this.formGroup();
        const items = this.itemsMap();
        let ok = true;
        const walk = (node: LayoutNode): void => {
            for (const child of node.children ?? []) {
                if (items[child.type]) {
                    const control = fg.get(child.type);
                    if (control) {
                        control.markAsTouched();
                        if (control.invalid) ok = false;
                    }
                } else {
                    walk(child);
                }
            }
        };
        walk(step);
        return ok;
    }

    /**
     * Evaluate showWhen condition synchronously.
     * Returns true when the node should be shown (no condition = always visible).
     * Default CD ensures re-evaluation on every user interaction.
     */
    isVisible(node: LayoutNode): boolean {
        const cond: VisibilityCondition | undefined = node.showWhen;
        if (!cond) return true;

        const control = this.formGroup().get(cond.field);
        if (!control) return true;

        const v = control.value;
        switch (cond.operator) {
            case 'eq':       return v === cond.value;
            case 'ne':       return v !== cond.value;
            case 'in':       return Array.isArray(cond.value) && (cond.value as unknown[]).includes(v);
            case 'notIn':    return Array.isArray(cond.value) && !(cond.value as unknown[]).includes(v);
            case 'empty':    return v == null || v === '' || (Array.isArray(v) && v.length === 0);
            case 'notEmpty': return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
            default:         return true;
        }
    }
}
