import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CmsLoaderComponent } from '@coolms/core-angular';

/**
 * UI-polish A2 -- shared inline loading indicator. Replaces the ad-hoc
 * "Loading…" text / blank panels each page rolled on its own, so a page never
 * just goes silently blank while data loads.
 *
 * It draws {@link CmsLoaderComponent}, the platform mark. It used to
 * draw a Bootstrap `spinner-border`, which is how a settings screen ended up
 * showing the same spinner as every other product on the web while the branded
 * loader sat one directory away, opt-in. A shared component is the only place
 * that fix scales from: every `<app-loading>` on every page changed with it,
 * and a page added tomorrow inherits it without knowing this component exists.
 *
 * Usage: `<app-loading label="Loading report…" />`
 */
@Component({
    selector: 'app-loading',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CmsLoaderComponent],
    template: `
        <div class="cms-loading" aria-live="polite">
            <cms-loader [inline]="true" [label]="label()" />
        </div>
    `,
    styles: [`
        .cms-loading {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: var(--cms-content-padding, 20px);
            color: var(--cms-text-secondary);
            font-size: .875rem;
        }
    `],
})
export class LoadingComponent {
    readonly label = input<string>('Loading…');
}
