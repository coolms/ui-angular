import {
    ChangeDetectionStrategy,
    Component,
    input,
    output,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { ToolbarAction } from './page-toolbar.component';

@Component({
    selector: 'cms-page-header',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgClass],
    template: `
        <div class="page-header" [class.page-header--with-subtitle]="!!subtitle()">
            <div class="page-header__main">
                <div class="page-header__title">
                    @if (icon()) {
                        <i class="bi" [ngClass]="'bi-' + icon()"></i>
                    }
                    <h1 class="cms-page-title">{{ title() }}</h1>
                    <!-- Optional title-adjacent meta slot (chips, badges,
                         slug/identifier ribbon, etc). Consumers project via
                         an element carrying the [header-meta] attribute so
                         the content sits on the same baseline as the title.
                         Adopted by CalendarDetail in [#441 follow-up] to
                         fold the slug chip out of a dedicated sub-head row
                         into the header itself. -->
                    <ng-content select="[header-meta]" />
                </div>
                <!-- Optional second-line page subtitle (one-line summary
                     of what the page is for). When set, the header grows
                     to two rows and the title row keeps its baseline so
                     a header-with-subtitle looks like a header-without-
                     subtitle with an extra muted caption underneath.
                     Adopted by Routing Inspector to fold the standalone
                     "Trace the SSR pipeline..." caption into the header
                     instead of letting it float in the page body. -->
                @if (subtitle()) {
                    <div class="page-header__subtitle">{{ subtitle() }}</div>
                }
            </div>
            <div class="page-header__actions">
                @for (action of actions(); track action.id) {
                    @if (!action.hidden && !action.divider) {
                        <button type="button"
                                class="cms-btn"
                                [class.cms-btn-primary]="action.primary"
                                [class.cms-btn-danger]="action.danger"
                                [disabled]="action.disabled ?? false"
                                [title]="action.title ?? action.label ?? ''"
                                (click)="actionClick.emit(action.id)">
                            <i class="bi" [ngClass]="'bi-' + action.icon"></i>
                            @if (action.label) {
                                <span>{{ action.label }}</span>
                            }
                        </button>
                    }
                }
                <!-- Optional custom controls projected into the header's right
                     side (e.g. a status pill), rendered after the declarative
                     action buttons. -->
                <ng-content select="[header-actions]" />
            </div>
        </div>
    `,
    styles: [`
        :host { display: block; }

        .page-header {
            /* container-type makes the @container queries below resolve
               against the page-header's own inline-size, not the
               viewport. This way the inline-mode switch happens when
               there's genuinely enough header width -- correct whether
               the right drawer is open, the sidebar is collapsed, or
               the user resizes the window. */
            container-type: inline-size;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            min-height: 52px;
            border-bottom: 1px solid var(--cms-border);
            background: var(--cms-surface);
            flex-shrink: 0;
        }
        /* With a subtitle, the header grows to fit two rows. Switch
           cross-axis alignment to flex-start so the title row sits
           where it does in the no-subtitle case (subtitle stacks under
           it), and pad top/bottom symmetrically so the block looks
           deliberate rather than crammed. */
        .page-header--with-subtitle {
            align-items: flex-start;
            padding-top: 10px;
            padding-bottom: 10px;
        }

        .page-header__main {
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
        }

        .page-header__title {
            display: flex;
            align-items: center;
            gap: 10px;

            .bi { font-size: 1.25rem; color: var(--cms-text-secondary); }
        }

        .cms-page-title {
            margin: 0;
            font-size: 1.125rem;
            font-weight: 600;
            color: var(--cms-text);
        }

        .page-header__subtitle {
            color: var(--cms-text-muted, #848b96);
            font-size: .8125rem;
            line-height: 1.35;
        }

        .page-header__actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        /* Pin actions to the title baseline (not the centre of the
           two-row block) when a subtitle is shown. */
        .page-header--with-subtitle .page-header__actions {
            margin-top: 2px;
        }

        /* When the page-header has at least 720px of inline-size,
           collapse the two-row layout back into a single row: title
           and subtitle sit side-by-side separated by a soft divider.
           This is the wide-monitor default; narrow viewports / open
           drawers fall back to the stacked layout automatically. */
        @container (min-width: 720px) {
            .page-header--with-subtitle {
                align-items: center;
                padding-top: 0;
                padding-bottom: 0;
            }
            .page-header--with-subtitle .page-header__main {
                flex-direction: row;
                align-items: baseline;
                gap: 14px;
                /* Allow the subtitle to truncate with ellipsis if a
                   pathological viewport width occurs between the
                   container threshold and the natural title width. */
                overflow: hidden;
            }
            .page-header--with-subtitle .page-header__subtitle {
                /* Soft visual divider before the subtitle so it reads
                   as related-but-secondary. The dot avoids the heavy
                   look of a pipe or border-left and reads as muted
                   typography by default. */
                position: relative;
                padding-left: 14px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .page-header--with-subtitle .page-header__subtitle::before {
                content: '·';
                position: absolute;
                left: 0;
                opacity: .6;
            }
            .page-header--with-subtitle .page-header__actions {
                margin-top: 0;
            }
        }
    `],
})
export class CmsPageHeaderComponent {
    readonly title       = input.required<string>();
    readonly icon        = input<string>('');
    /**
     * Optional one-line page subtitle rendered below the title. Keeps
     * the chrome consistent across modules that want a short page
     * description right under the title (e.g. Routing Inspector's
     * "Trace the SSR pipeline..."). Leave blank to render the standard
     * single-row header.
     */
    readonly subtitle    = input<string>('');
    readonly actions     = input<ToolbarAction[]>([]);
    readonly actionClick = output<string>();
}
