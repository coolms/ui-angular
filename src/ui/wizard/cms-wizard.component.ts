import { CommonModule } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    ContentChildren,
    HostListener,
    QueryList,
    computed,
    input,
    output,
} from '@angular/core';

import { CmsWizardStepDirective } from './cms-wizard.directives';
import type { WizardStepConfig } from './cms-wizard.types';

/**
 *-2.6a — reusable wizard primitive.
 *
 * Modal-agnostic, navigation-only: the host (e.g. document-
 * generation wizard) supplies the step list and the current step
 * id; the primitive renders the progress strip, the active step's
 * projected content, and the Back / Next / Submit / Cancel
 * actions. It does not own state — `stepChange` carries each
 * navigation intent up to the host which moves the signal.
 *
 * Hidden steps are filtered out of both the progress strip and
 * forward/back navigation. The current step id is treated as
 * authoritative; if the host points at a hidden step id (rare but
 * possible during adaptive recomputation), the primitive still
 * renders that step's projected content and lets the host correct
 * itself on the next change.
 *
 * Keyboard contract:
 *   - Esc -> emits `cancelled`
 *   - Enter (when canProceed) -> advances; on the final step, this
 *     emits `completed`
 *
 * ARIA: the progress strip is a `tablist`; each dot is a `tab`;
 * the projected content area is a `tabpanel`.
 */
@Component({
    selector: 'cms-wizard',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule],
    template: `
        <div class="cms-wizard">
            <!-- Progress strip ----------------------------------------------->
            <div class="cms-wizard__progress"
                 role="tablist"
                 [attr.aria-label]="ariaLabel()">
                @for (step of visibleSteps(); track step.id; let i = $index) {
                    <button type="button"
                            class="cms-wizard__step"
                            [class.cms-wizard__step--active]="step.id === currentStepId()"
                            [class.cms-wizard__step--done]="isStepDone(i)"
                            role="tab"
                            [attr.aria-selected]="step.id === currentStepId()"
                            [attr.aria-controls]="'cms-wizard-panel-' + step.id"
                            [disabled]="!isStepReachable(i)"
                            (click)="onStepDotClick(step.id)">
                        <span class="cms-wizard__step-index">{{ i + 1 }}</span>
                        <span class="cms-wizard__step-label">{{ step.label }}</span>
                    </button>
                    @if (i < visibleSteps().length - 1) {
                        <span class="cms-wizard__sep" aria-hidden="true">›</span>
                    }
                }
            </div>

            <!-- Active step content ------------------------------------------->
            <div class="cms-wizard__body"
                 role="tabpanel"
                 [attr.id]="'cms-wizard-panel-' + currentStepId()"
                 [attr.aria-labelledby]="currentStepId()">
                @if (activeTemplate(); as tpl) {
                    <ng-container *ngTemplateOutlet="tpl"></ng-container>
                } @else {
                    <div class="cms-wizard__placeholder">
                        Step <code>{{ currentStepId() }}</code> — no content registered.
                    </div>
                }
            </div>

            <!-- Footer actions ------------------------------------------------>
            <div class="cms-wizard__footer">
                <button type="button"
                        class="cms-wizard__btn cms-wizard__btn--ghost"
                        (click)="emitCancel()">
                    Cancel
                </button>
                <span class="cms-wizard__spacer"></span>
                <button type="button"
                        class="cms-wizard__btn cms-wizard__btn--ghost"
                        [disabled]="isFirstVisibleStep()"
                        (click)="goBack()">
                    Back
                </button>
                @if (isLastVisibleStep()) {
                    <button type="button"
                            class="cms-wizard__btn cms-wizard__btn--primary"
                            [disabled]="!canAdvance()"
                            (click)="emitComplete()">
                        Submit
                    </button>
                } @else {
                    <button type="button"
                            class="cms-wizard__btn cms-wizard__btn--primary"
                            [disabled]="!canAdvance()"
                            (click)="goNext()">
                        Next
                    </button>
                }
            </div>
        </div>
    `,
    styles: [
        `
            .cms-wizard {
                display: flex;
                flex-direction: column;
                min-height: 0;
                background: var(--cms-surface);
                color: var(--cms-text);
            }
            .cms-wizard__progress {
                display: flex;
                align-items: center;
                gap: .25rem;
                padding: 1rem 1.25rem;
                border-bottom: 1px solid var(--cms-border);
                background: var(--cms-bg);
                overflow-x: auto;
            }
            .cms-wizard__step {
                display: inline-flex;
                align-items: center;
                gap: .5rem;
                padding: .25rem .5rem;
                border: 0;
                background: transparent;
                color: var(--cms-text-secondary);
                font: inherit;
                cursor: pointer;
                border-radius: var(--cms-radius-sm, 4px);
            }
            .cms-wizard__step:disabled {
                cursor: not-allowed;
                opacity: .6;
            }
            .cms-wizard__step--active {
                color: var(--cms-text);
                font-weight: 600;
            }
            .cms-wizard__step--done {
                color: var(--cms-success-text);
            }
            .cms-wizard__step-index {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 1.5rem;
                height: 1.5rem;
                border-radius: 999px;
                background: var(--cms-bg);
                border: 1px solid var(--cms-border);
                font-size: .75rem;
                font-weight: 600;
            }
            .cms-wizard__step--active .cms-wizard__step-index {
                background: var(--cms-accent);
                border-color: var(--cms-accent);
                color: var(--cms-accent-fg, #1a1a1a);
            }
            /* The numeral is small text, so it takes the -text tier: the raw
               hue on --cms-success-light measures 3.15 in light theme. The
               BORDER keeps the raw hue -- non-text, and 3:1 applies there. */
            .cms-wizard__step--done .cms-wizard__step-index {
                background: var(--cms-success-light);
                border-color: var(--cms-success);
                color: var(--cms-success-text);
            }
            .cms-wizard__sep {
                color: var(--cms-text-muted);
            }
            .cms-wizard__body {
                flex: 1 1 auto;
                min-height: 0;
                padding: 1.25rem;
                overflow-y: auto;
            }
            .cms-wizard__placeholder {
                color: var(--cms-text-muted);
                font-style: italic;
            }
            .cms-wizard__footer {
                display: flex;
                align-items: center;
                gap: .5rem;
                padding: .75rem 1.25rem;
                border-top: 1px solid var(--cms-border);
                background: var(--cms-bg);
            }
            .cms-wizard__spacer {
                flex: 1 1 auto;
            }
            .cms-wizard__btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: .4rem .9rem;
                border-radius: var(--cms-radius-sm, 4px);
                border: 1px solid var(--cms-btn-border);
                background: var(--cms-btn-bg);
                color: var(--cms-text);
                font: inherit;
                cursor: pointer;
            }
            .cms-wizard__btn:disabled {
                opacity: .55;
                cursor: not-allowed;
            }
            .cms-wizard__btn--ghost {
                background: transparent;
            }
            .cms-wizard__btn--primary {
                background: var(--cms-accent);
                border-color: var(--cms-accent);
                color: var(--cms-accent-fg, #1a1a1a);
                font-weight: 600;
            }
            .cms-wizard__btn--primary:hover:not(:disabled) {
                background: var(--cms-accent-hover);
                border-color: var(--cms-accent-hover);
            }
        `,
    ],
})
export class CmsWizardComponent {
    /** Declarative step list; the consumer's `computed()` is fine. */
    readonly steps = input.required<readonly WizardStepConfig[]>();
    /** Active step id (must reference a step in `steps()`). */
    readonly currentStepId = input.required<string>();
    /** Optional accessible name for the wizard (used on tablist). */
    readonly ariaLabel = input<string>('Wizard');

    /** Emitted when the user requests a step change. The host
     *  applies the change by mutating its `currentStepId` source. */
    readonly stepChange = output<string>();
    /** Emitted on Cancel / Esc. */
    readonly cancelled = output<void>();
    /** Emitted on Submit / Enter from the final visible step. */
    readonly completed = output<void>();

    @ContentChildren(CmsWizardStepDirective)
    private readonly stepDirectives!: QueryList<CmsWizardStepDirective>;

    /** Visible-only step view (hidden steps filtered out). */
    protected readonly visibleSteps = computed<readonly WizardStepConfig[]>(() =>
        this.steps().filter((s) => !s.hidden),
    );

    /** Index of the active step within `visibleSteps()`. -1 means the
     *  active id is hidden or unknown (rare during adaptive transitions). */
    protected readonly activeIndex = computed<number>(() => {
        const id = this.currentStepId();
        const visible = this.visibleSteps();
        for (let i = 0; i < visible.length; i++) {
            if (visible[i].id === id) {
                return i;
            }
        }
        return -1;
    });

    /** Resolved `TemplateRef` for the active step id, or null if
     *  no directive declared it. Read on every render — the
     *  ContentChildren query updates as templates mount/unmount. */
    protected readonly activeTemplate = computed(() => {
        const id = this.currentStepId();
        // ContentChildren is a QueryList — converting to array is the
        // change-detection-safe way to read inside a computed.
        const directives = this.stepDirectives?.toArray() ?? [];
        const match = directives.find((d) => d.cmsWizardStep() === id);
        return match?.templateRef ?? null;
    });

    protected isFirstVisibleStep(): boolean {
        return this.activeIndex() <= 0;
    }

    protected isLastVisibleStep(): boolean {
        return this.activeIndex() === this.visibleSteps().length - 1;
    }

    protected canAdvance(): boolean {
        const id = this.currentStepId();
        const cfg = this.steps().find((s) => s.id === id);
        return cfg?.canProceed ? cfg.canProceed() : true;
    }

    /** A step is "done" when the active step is past it. Visual cue
     *  only — does not influence navigability. */
    protected isStepDone(index: number): boolean {
        return index < this.activeIndex();
    }

    /** A step is reachable via dot-click when the user has either
     *  already advanced past it (back-jump) or it is the next one
     *  and `canAdvance()` allows. Forward jumps over un-completed
     *  steps are blocked. */
    protected isStepReachable(index: number): boolean {
        const active = this.activeIndex();
        if (index <= active) {
            return true;
        }
        return index === active + 1 && this.canAdvance();
    }

    protected onStepDotClick(id: string): void {
        if (id === this.currentStepId()) {
            return;
        }
        this.stepChange.emit(id);
    }

    protected goBack(): void {
        const i = this.activeIndex();
        if (i <= 0) {
            return;
        }
        this.stepChange.emit(this.visibleSteps()[i - 1].id);
    }

    protected goNext(): void {
        const i = this.activeIndex();
        if (i < 0 || !this.canAdvance()) {
            return;
        }
        if (i >= this.visibleSteps().length - 1) {
            this.emitComplete();
            return;
        }
        this.stepChange.emit(this.visibleSteps()[i + 1].id);
    }

    protected emitCancel(): void {
        this.cancelled.emit();
    }

    protected emitComplete(): void {
        if (!this.canAdvance()) {
            return;
        }
        this.completed.emit();
    }

    @HostListener('keydown.escape', ['$event'])
    onEsc(event: Event): void {
        event.preventDefault();
        this.emitCancel();
    }

    @HostListener('keydown.enter', ['$event'])
    onEnter(event: Event): void {
        // Don't hijack Enter inside text inputs / selects / textareas.
        const target = event.target as HTMLElement | null;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
            return;
        }
        if (!this.canAdvance()) {
            return;
        }
        event.preventDefault();
        if (this.isLastVisibleStep()) {
            this.emitComplete();
        } else {
            this.goNext();
        }
    }
}
