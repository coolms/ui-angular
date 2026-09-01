/**
 *-2.6a — Reusable wizard primitive.
 *
 * A `WizardStepConfig` is a step's declaration. The caller provides
 * the visual ordering and the gating predicate; the primitive owns
 * the navigation contract (Back/Next/Submit, hidden-step skip,
 * ARIA roles, keyboard).
 */
export interface WizardStepConfig {
    /** Stable step id; used by `*cmsWizardStep` directive matching and as the
     *  `currentStepId` value. */
    readonly id: string;
    /** Human-readable label rendered in the progress strip. */
    readonly label: string;
    /** Optional predicate gating the Next/Submit button. Returning `false`
     *  disables the primary advance action while the step is active. */
    readonly canProceed?: () => boolean;
    /** When true, the step is omitted from the progress strip AND from
     *  forward/back navigation. Use this to model adaptive flows whose
     *  step set depends on earlier picks (e.g. Filter mode adds a
     *  filter-criteria step that Single mode skips). */
    readonly hidden?: boolean;
    /** Marker only — has no behavioural effect today. Reserved so
     *  consumers can express "Skip" affordances in X-2.6b without a
     *  primitive API churn. */
    readonly optional?: boolean;
}
