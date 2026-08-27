import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * UI-polish A2 — shared "nothing here yet" empty state. Replaces the
 * one-off `<p>No results</p>` notes (and silent blank grids) each page
 * rolled on its own. Projects optional content (e.g. a "Create" button)
 * via <ng-content> below the hint.
 *
 * Usage:
 *   <app-empty-state icon="inbox" title="No instances yet"
 *                    hint="They'll appear here once a process runs." />
 */
@Component({
    selector: 'app-empty-state',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="cms-empty">
            @if (icon()) {
                <i class="bi cms-empty__icon" [class]="'bi-' + icon()" aria-hidden="true"></i>
            }
            <p class="cms-empty__title">{{ title() }}</p>
            @if (hint()) {
                <p class="cms-empty__hint">{{ hint() }}</p>
            }
            <ng-content />
        </div>
    `,
    styles: [`
        .cms-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 40px 24px;
            text-align: center;
            color: var(--cms-text-secondary);
        }
        .cms-empty__icon {
            font-size: 1.75rem;
            color: var(--cms-text-muted);
            margin-bottom: 2px;
        }
        .cms-empty__title {
            margin: 0;
            font-size: .9375rem;
            font-weight: 600;
            color: var(--cms-text);
        }
        .cms-empty__hint {
            margin: 0;
            font-size: .8125rem;
            color: var(--cms-text-muted);
            max-width: 36ch;
        }
    `],
})
export class EmptyStateComponent {
    readonly icon = input<string>('inbox');
    readonly title = input<string>('Nothing here yet');
    readonly hint = input<string>('');
}
