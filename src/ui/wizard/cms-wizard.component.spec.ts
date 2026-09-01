import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CmsWizardComponent } from './cms-wizard.component';
import { CmsWizardStepDirective } from './cms-wizard.directives';
import type { WizardStepConfig } from './cms-wizard.types';

/**
 *-2.6a — behaviour spec for the reusable wizard primitive.
 *
 * Exercises:
 *   1. Renders the visible-step strip, omitting hidden steps.
 *   2. Back disabled on the first visible step.
 *   3. Last visible step shows Submit (not Next).
 *   4. `canProceed === false` disables Next.
 *   5. Next/Back emit `stepChange` with the neighbouring visible id.
 *   6. Step-dot click emits `stepChange` (back-jumps allowed).
 *   7. Forward jump beyond `active + 1` is blocked.
 *   8. Cancel button emits `cancelled`.
 *   9. The directive's template is rendered for the matching step.
 */

@Component({
    standalone: true,
    imports: [CmsWizardComponent, CmsWizardStepDirective],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <cms-wizard
            [steps]="steps()"
            [currentStepId]="currentStepId()"
            (stepChange)="onStepChange($event)"
            (cancelled)="cancelled = true"
            (completed)="completed = true"
        >
            <ng-container *cmsWizardStep="'mode'">
                <span data-test="step-mode">MODE</span>
            </ng-container>
            <ng-container *cmsWizardStep="'audience'">
                <span data-test="step-audience">AUDIENCE</span>
            </ng-container>
            <ng-container *cmsWizardStep="'review'">
                <span data-test="step-review">REVIEW</span>
            </ng-container>
        </cms-wizard>
    `,
})
class HostComponent {
    readonly modeChosen = signal(false);

    readonly steps = signal<readonly WizardStepConfig[]>([
        { id: 'mode', label: 'Mode', canProceed: () => this.modeChosen() },
        { id: 'skipped', label: 'Skipped', hidden: true },
        { id: 'audience', label: 'Audience' },
        { id: 'review', label: 'Review' },
    ]);

    readonly currentStepId = signal('mode');

    cancelled = false;
    completed = false;

    onStepChange(id: string): void {
        this.currentStepId.set(id);
    }
}

function bodyText(fixture: ReturnType<typeof TestBed.createComponent>): string {
    return (fixture.nativeElement.querySelector('.cms-wizard__body')?.textContent ?? '').trim();
}

function primaryBtn(fixture: ReturnType<typeof TestBed.createComponent>): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.cms-wizard__btn--primary') as HTMLButtonElement;
}

function backBtn(fixture: ReturnType<typeof TestBed.createComponent>): HTMLButtonElement {
    const ghosts = fixture.nativeElement.querySelectorAll('.cms-wizard__btn--ghost') as NodeListOf<HTMLButtonElement>;
    // Cancel is first ghost; Back is second.
    return ghosts[1];
}

describe('CmsWizardComponent', () => {
    it('renders the visible step strip, omitting hidden steps', () => {
        const f = TestBed.createComponent(HostComponent);
        f.detectChanges();

        const dots = f.nativeElement.querySelectorAll('.cms-wizard__step') as NodeListOf<HTMLButtonElement>;
        expect(dots.length).toBe(3); // mode, audience, review — `skipped` hidden
        expect(dots[0].textContent?.trim()).toContain('Mode');
        expect(dots[1].textContent?.trim()).toContain('Audience');
        expect(dots[2].textContent?.trim()).toContain('Review');
    });

    it('renders the directive template for the active step', () => {
        const f = TestBed.createComponent(HostComponent);
        f.detectChanges();

        expect(bodyText(f)).toBe('MODE');

        f.componentInstance.modeChosen.set(true);
        f.componentInstance.currentStepId.set('audience');
        f.detectChanges();

        expect(bodyText(f)).toBe('AUDIENCE');
    });

    it('disables Back on the first visible step', () => {
        const f = TestBed.createComponent(HostComponent);
        f.detectChanges();
        expect(backBtn(f).disabled).toBe(true);
    });

    it('disables Next when canProceed returns false', () => {
        const f = TestBed.createComponent(HostComponent);
        f.detectChanges();
        expect(primaryBtn(f).disabled).toBe(true);
        expect(primaryBtn(f).textContent?.trim()).toBe('Next');
    });

    it('enables Next after canProceed allows and advances on click', () => {
        const f = TestBed.createComponent(HostComponent);
        f.componentInstance.modeChosen.set(true);
        f.detectChanges();
        expect(primaryBtn(f).disabled).toBe(false);

        primaryBtn(f).click();
        f.detectChanges();
        expect(f.componentInstance.currentStepId()).toBe('audience');
    });

    it('shows Submit instead of Next on the last visible step', () => {
        const f = TestBed.createComponent(HostComponent);
        f.componentInstance.modeChosen.set(true);
        f.componentInstance.currentStepId.set('review');
        f.detectChanges();
        expect(primaryBtn(f).textContent?.trim()).toBe('Submit');
    });

    it('emits `completed` on Submit', () => {
        const f = TestBed.createComponent(HostComponent);
        f.componentInstance.modeChosen.set(true);
        f.componentInstance.currentStepId.set('review');
        f.detectChanges();
        primaryBtn(f).click();
        f.detectChanges();
        expect(f.componentInstance.completed).toBe(true);
    });

    it('emits `cancelled` when Cancel is clicked', () => {
        const f = TestBed.createComponent(HostComponent);
        f.detectChanges();
        const cancel = f.nativeElement.querySelectorAll('.cms-wizard__btn--ghost')[0] as HTMLButtonElement;
        cancel.click();
        f.detectChanges();
        expect(f.componentInstance.cancelled).toBe(true);
    });

    it('back-jumps via step-dot click', () => {
        const f = TestBed.createComponent(HostComponent);
        f.componentInstance.modeChosen.set(true);
        f.componentInstance.currentStepId.set('review');
        f.detectChanges();

        const dots = f.nativeElement.querySelectorAll('.cms-wizard__step') as NodeListOf<HTMLButtonElement>;
        dots[0].click(); // back to 'mode'
        f.detectChanges();
        expect(f.componentInstance.currentStepId()).toBe('mode');
    });

    it('blocks forward step-dot jump beyond active + 1', () => {
        const f = TestBed.createComponent(HostComponent);
        f.componentInstance.modeChosen.set(true);
        f.detectChanges();
        const dots = f.nativeElement.querySelectorAll('.cms-wizard__step') as NodeListOf<HTMLButtonElement>;
        // active is index 0 (mode); index 2 (review) is unreachable.
        expect(dots[2].disabled).toBe(true);
    });
});
