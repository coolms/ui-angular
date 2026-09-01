import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    input,
    OnInit,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ConfigService, LayoutConfig } from '@coolms/core-angular';
import { SlotComponent } from '../ui/slot.component';
import { CmsPageHeaderComponent } from '../ui/cms-page-header.component';
import { CmsPageFooterComponent } from '../ui/cms-page-footer.component';
import { PageActionsService } from '../ui/page-actions.service';
import { PageFooterService } from '../ui/page-footer.service';

/**
 * Generic "list" layout: fixed page header + full-width scrollable main area.
 *
 * Used by pages that only need a single content zone (no resizable panels).
 *
 * ## Service ownership
 * PageActionsService and PageFooterService are intentionally NOT provided here.
 * They must be provided by the page component that owns this layout, so that
 * both the layout (which renders the header/footer) and the content component
 * (which registers actions and footer counts) share the same instances.
 *
 * ## Content projection
 * The `content.main` slot can be filled in two ways:
 *  1. Via YAML config (`layoutId` -> ConfigService -> `slots.content.main.component`)
 *     which renders a registered component through `<app-slot>`.
 *  2. Via direct content projection: `<cms-list-layout><foo slot="content.main" /></cms-list-layout>`.
 *     Used when the content component needs dynamic inputs (e.g. route params).
 * Both can coexist; when a YAML slot is configured it renders first.
 */
@Component({
    selector: 'cms-list-layout',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SlotComponent, CmsPageHeaderComponent, CmsPageFooterComponent],
    template: `
        <div class="list-layout">
            @if (pageTitle() || headerActions().length) {
                <cms-page-header
                    [title]="pageTitle()"
                    [icon]="pageIcon()"
                    [actions]="headerActions()"
                    (actionClick)="onHeaderAction($event)" />
            }
            <div class="list-layout__main">
                @if (mainSlot()) {
                    <app-slot [key]="mainSlot()!.component" />
                }
                <ng-content select="[slot='content.main']" />
            </div>
            <cms-page-footer />
        </div>
    `,
    styles: [`
        :host { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
        .list-layout { display: flex; flex-direction: column; height: 100%; gap: 8px; }
        .list-layout__main { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
        cms-page-footer { flex-shrink: 0; }
    `],
})
export class ListLayoutComponent implements OnInit {
    readonly layoutId = input.required<string>();

    private readonly configSvc   = inject(ConfigService);
    private readonly destroyRef  = inject(DestroyRef);
    private readonly pageActions = inject(PageActionsService);

    readonly mainSlot   = signal<{ component: string } | null>(null);
    private readonly _yamlTitle = signal<string>('');
    readonly pageIcon   = signal<string>('');

    /**
     * Resolved page title: PageActionsService.title() (set dynamically by content
     * components after async loads) takes priority over the YAML-config title.
     */
    readonly pageTitle  = computed(() =>
        this.pageActions.title() || this._yamlTitle()
    );

    /** Populated by slot-rendered content components via PageActionsService. */
    readonly headerActions = this.pageActions.actions;

    ngOnInit(): void {
        this.configSvc.layout(this.layoutId()).pipe(
            catchError(() => of({} as LayoutConfig)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(cfg => {
            const slots = (cfg['slots'] ?? {}) as Record<string, { component: string }>;
            this.mainSlot.set(slots['content.main'] ?? null);
            this._yamlTitle.set((cfg['title'] as string) ?? '');
            this.pageIcon.set((cfg['icon'] as string) ?? '');
        });
    }

    onHeaderAction(actionId: string): void {
        this.pageActions.dispatch(actionId);
    }
}
