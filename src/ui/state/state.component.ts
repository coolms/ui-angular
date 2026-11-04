import { ChangeDetectionStrategy, Component, computed, inject, Injector, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { ElevationService, isElevationRefusal } from '@coolms/core-angular';
import { elevateOnce } from './elevate-once';
import { RELOAD_PAGE } from './error-banner.component';

/** What a page, a card or a line of text shows instead of its content. */
export type StateKind = 'loading' | 'empty' | 'error' | 'denied' | 'elevation-required';

/** Where it stands: centred in the content area, centred in its card, or small beside text. */
export type StatePlacement = 'page' | 'block' | 'inline';

/** The one thing a state offers to do about itself: Retry for an error, or what an empty state suggests. */
export interface StateAction {
    readonly label: string;
    readonly run: () => void;
}

/** The kind's mark, for every kind but loading, which turns a spinner instead. */
const ICON: Readonly<Record<Exclude<StateKind, 'loading'>, string>> = {
    'empty': 'inbox',
    'error': 'exclamation-triangle',
    'denied': 'slash-circle',
    'elevation-required': 'shield-lock',
};

/**
 * The state component of the UI contract (`state` in design-tokens' components.json): one component, one API and one
 * look from the tokens for every state a page, a card or a line of text can be in instead of its content.
 *
 *   <cms-state kind="loading" title="Reading your mailboxes" placement="page" />
 *   <cms-state kind="error" [title]="message()" [error]="failure()" [action]="{ label: 'Retry', run: load }" />
 *
 * A loading state shows its spinner only after `--cms-state-delay`, so a read that answers sooner shows nothing; its
 * title is in the live region from the start. Every kind is a polite status. An error whose cause is a refusal for want
 * of elevation is shown as the elevation state, as the error banner shows it, and any other refusal (a 403) as
 * `denied`, with no action -- retrying a refusal is refused again. The Elevate flow is the banner's:
 * once the session is elevated the page is loaded again where the shell provides that, else `elevated` fires.
 */
@Component({
    selector: 'cms-state',
    standalone: true,
    host: { '[class.cms-state-host--inline]': "placement() === 'inline'" },
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="cms-state" [class]="'cms-state cms-state--' + placement()" [attr.data-kind]="shownKind()"
             role="status" aria-live="polite">
            @if (shownKind() === 'loading') {
                <span class="cms-state__spinner" data-test="state-spinner" aria-hidden="true"></span>
            } @else {
                <i class="bi cms-state__icon" [class]="'bi cms-state__icon bi-' + icon()" aria-hidden="true"></i>
            }
            <span class="cms-state__text">
                <span class="cms-state__title">{{ title() }}</span>
                @if (description()) {
                    <span class="cms-state__description">{{ description() }}</span>
                }
            </span>
            @if (shownKind() === 'elevation-required') {
                <button type="button" class="cms-btn cms-btn-primary cms-state__action" data-test="elevate"
                        [disabled]="asking()" (click)="elevate()">Elevate</button>
                @if (unavailable()) {
                    <span class="cms-state__description" data-test="elevation-unavailable">
                        Elevation isn't available here. Ask an administrator.
                    </span>
                }
            } @else if (shownKind() !== 'denied' && action(); as act) {
                <button type="button" class="cms-btn cms-state__action" data-test="state-action"
                        (click)="act.run()">{{ act.label }}</button>
            }
        </div>
    `,
    styles: [`
        :host { display: block; }
        :host(.cms-state-host--inline) { display: inline-block; }
        .cms-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: var(--cms-space-3, 12px);
            text-align: center;
            color: var(--cms-text-secondary);
        }
        .cms-state--page { min-height: 100%; padding: var(--cms-space-12, 48px) var(--cms-space-6, 24px); }
        .cms-state--block { padding: var(--cms-space-8, 32px) var(--cms-space-6, 24px); }
        .cms-state--inline {
            display: inline-flex;
            flex-direction: row;
            gap: var(--cms-space-2, 8px);
            text-align: start;
            font-size: var(--cms-font-size-meta, .8125rem);
        }
        .cms-state__text { display: flex; flex-direction: column; gap: var(--cms-space-1, 4px); align-items: inherit; }
        .cms-state--inline .cms-state__text { flex-direction: row; gap: var(--cms-space-2, 8px); }
        .cms-state__title { color: var(--cms-text); font-weight: 600; }
        .cms-state--page .cms-state__title { font-size: var(--cms-font-size-title-sm, 1rem); }
        .cms-state--inline .cms-state__title { font-weight: 400; color: inherit; }
        .cms-state__description { color: var(--cms-text-muted); max-width: 48ch; }
        /* A narrow box wraps the action's label at its words rather than letting the button run out of it. */
        .cms-state__action { max-width: 100%; white-space: normal; }
        .cms-state__icon { font-size: 1.75rem; color: var(--cms-text-muted); }
        .cms-state--page .cms-state__icon { font-size: 2.25rem; }
        .cms-state--inline .cms-state__icon { font-size: 1em; }
        .cms-state[data-kind='error'] .cms-state__icon { color: var(--cms-danger); }
        .cms-state__spinner {
            --cms-state-size: var(--cms-spinner-size-block, 24px);
            box-sizing: border-box;
            width: var(--cms-state-size);
            height: var(--cms-state-size);
            border: var(--cms-spinner-stroke, 2px) solid var(--cms-spinner-track, var(--cms-border));
            border-top-color: var(--cms-spinner-color, var(--cms-accent-text));
            border-radius: 50%;
            animation: cms-state-turn var(--cms-spinner-duration, 800ms) linear infinite;
        }
        .cms-state--page .cms-state__spinner { --cms-state-size: var(--cms-spinner-size-page, 32px); }
        .cms-state--inline .cms-state__spinner { --cms-state-size: var(--cms-spinner-size-inline, 16px); }
        /* A loading state appears only after the delay: a read that answers sooner shows nothing. Its words are in the
           live region from the start; only what is seen waits. */
        .cms-state[data-kind='loading'] { animation: cms-state-appear 0s linear var(--cms-state-delay, 300ms) both; }
        @keyframes cms-state-turn { to { transform: rotate(360deg); } }
        @keyframes cms-state-appear { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cms-state-pulse { 50% { opacity: .35; } }
        @media (prefers-reduced-motion: reduce) {
            .cms-state__spinner { animation: cms-state-pulse 1.6s ease-in-out infinite; }
        }
    `],
})
export class StateComponent {
    readonly kind = input.required<StateKind>();
    readonly title = input.required<string>();
    readonly description = input<string>('');
    readonly placement = input<StatePlacement>('block');
    /** Retry for an error, or what an empty state suggests; elevation-required offers Elevate of its own. */
    readonly action = input<StateAction | null>(null);
    /** The failure an error state describes: a refusal for want of elevation is shown as the elevation state. */
    readonly error = input<unknown>(null);
    /** The session is elevated and there is no page to load again: the host loads its content again. */
    readonly elevated = output<void>();

    protected readonly shownKind = computed<StateKind>(() => {
        if (this.kind() !== 'error') {
            return this.kind();
        }
        const error = this.error();
        if (isElevationRefusal(error)) {
            return 'elevation-required';
        }
        // A refusal is the server's last word: Retry would only be refused again, so it is shown as one, with no action.
        return error instanceof HttpErrorResponse && 403 === error.status ? 'denied' : 'error';
    });
    protected readonly icon = computed(() => {
        const kind = this.shownKind();
        return kind === 'loading' ? '' : ICON[kind];
    });
    protected readonly asking = signal(false);
    /** The installation cannot elevate: the button opened nothing, and the person is told so. */
    protected readonly unavailable = signal(false);

    // Resolved when Elevate is pressed: a state that never offers it does not bring the session's elevation along.
    private readonly injector = inject(Injector);
    private readonly reloadPage = inject(RELOAD_PAGE, { optional: true });

    protected elevate(): void {
        this.asking.set(true);
        elevateOnce(this.injector.get(ElevationService)).pipe(
            finalize(() => this.asking.set(false)),
        ).subscribe(outcome => {
            if (outcome === 'elevated') {
                if (this.reloadPage) {
                    this.reloadPage();
                } else {
                    this.elevated.emit();
                }
            } else if (outcome === 'unavailable') {
                this.unavailable.set(true);
            }
        });
    }
}
