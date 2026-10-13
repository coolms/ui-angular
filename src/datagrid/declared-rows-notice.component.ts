import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ElevationRequiredComponent } from '../ui/state/elevation-required.component';
import { EmptyStateComponent } from '../ui/state/empty-state.component';
import { ErrorBannerComponent } from '../ui/state/error-banner.component';
import type { DeclaredRowsSource } from './declared-rows.source';

/**
 * What a list page shows in place of, or above, its grid when the grid's declared rows are not simply there:
 *
 * - `elevate` -- the list is the caller's once elevated: the elevation notice, with its Elevate button. The grid
 *   reads its definition again on the grant, and the rows follow.
 * - `denied` -- the list is not the caller's: said so, never drawn as an empty list.
 * - a definition that names no source, or a fetch the server refused or that failed: the server's words.
 *
 * Usage, beside a grid fed by the same source (`[hidden]` keeps the grid mounted):
 *
 *     <cms-declared-rows-notice [source]="rows" />
 *     <coolms-datagrid [hidden]="!rows.showsRows()" ...>
 */
@Component({
    selector: 'cms-declared-rows-notice',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ElevationRequiredComponent, EmptyStateComponent, ErrorBannerComponent],
    template: `
        @switch (source().availability()) {
            @case ('elevate') {
                <cms-elevation-required
                    data-test="rows-elevate"
                    title="This list needs an elevated session"
                    hint="You may read it once this session is elevated. Your password is asked once, and the session stays elevated for a limited time." />
            }
            @case ('denied') {
                <app-empty-state
                    data-test="rows-denied"
                    icon="slash-circle"
                    title="Not available to you"
                    hint="Your account may not read this list." />
            }
            @default {
                @if (source().error(); as message) {
                    <app-error-banner data-test="rows-error" [message]="message" />
                }
            }
        }
    `,
})
export class DeclaredRowsNoticeComponent {
    readonly source = input.required<DeclaredRowsSource>();
}
