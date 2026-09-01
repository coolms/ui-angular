import { Directive, TemplateRef, inject, input } from '@angular/core';

/**
 *-2.6a — structural directive that registers a step's
 * template with the surrounding `<cms-wizard>` and tags it with
 * the step id the parent will match against.
 *
 * Usage:
 * ```html
 * <cms-wizard ...>
 *   <ng-container *cmsWizardStep="'mode'">…step body…</ng-container>
 *   <ng-container *cmsWizardStep="'audience'">…</ng-container>
 * </cms-wizard>
 * ```
 *
 * The wizard component picks the directive whose `cmsWizardStep`
 * value matches its current `currentStepId` input and renders that
 * template via `ngTemplateOutlet`. Steps without a matching
 * directive render as blank — useful while step components are
 * staged piecewise (X-2.6a placeholder usage).
 */
@Directive({
    selector: '[cmsWizardStep]',
    standalone: true,
})
export class CmsWizardStepDirective {
    /** The step id this template belongs to. Required. */
    readonly cmsWizardStep = input.required<string>();

    /** Auto-injected by the structural-directive contract. The
     *  parent reaches in and renders this via `*ngTemplateOutlet`. */
    readonly templateRef = inject(TemplateRef<unknown>);
}
