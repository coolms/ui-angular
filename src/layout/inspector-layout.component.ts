import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    OnInit,
    computed,
    inject,
    input,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { ConfigService, LayoutConfig, LayoutHeaderAction, LayoutSection } from '@coolms/core-angular';
import { CmsPageHeaderComponent } from '../ui/cms-page-header.component';
import { CmsPageFooterComponent } from '../ui/cms-page-footer.component';
import { SlotComponent } from '../ui/slot.component';
import { PageActionsService } from '../ui/page-actions.service';
import { PageFooterService } from '../ui/page-footer.service';

/**
 * Inspector page layout shell (ADR-127 reference template).
 *
 * Renders a header (cms-page-header with optional subtitle + header
 * actions) followed by a vertical stack of body sections, each carrying
 * its own slot graph. Used by debug / audit / inspection pages where
 * the body is "show me the result of running this query/inspection
 * one row at a time" — Routing Inspector is the canonical adopter.
 *
 * ## How it composes
 *
 *  - Reads the layout config from the BE via `ConfigService.layout(id)`.
 *    The id resolves first from the `[layoutId]` input, falling back to
 *    `route.data.layoutId` so routes can opt in via:
 *    `data: { layoutId: 'web:routing-inspector' }`.
 *  - Iterates `sections` in YAML insertion order. Each section's
 *    `slots.content.main.component` is mounted via `<app-slot>`. Slot
 *    components are resolved from `ComponentRegistry` by name.
 *  - Provides `PageActionsService` + `PageFooterService` at component
 *    scope so slot components can register dynamic header actions and
 *    footer counts (same pattern as `cms-list-layout`).
 *
 * ## Inputs the layout YAML exposes (see ADR-127 §"The contract")
 *
 *  - title       (required)  — page title rendered in cms-page-header
 *  - subtitle    (optional)  — one-line description under the title
 *  - icon        (optional)  — bi-* icon name shown next to the title
 *  - headerActions[]         — buttons in the action bar; clicks routed
 *                              through PageActionsService.dispatch()
 *  - sections{}              — ordered map of body sections; each
 *                              section can have its own title + slot
 *                              graph
 *  - permissions[]           — hint; real gating lives on the data
 *                              APIs the slots call (layout endpoint
 *                              is public by design)
 *
 * ## Service ownership
 *
 * Unlike cms-list-layout (which expects the route wrapper to provide
 * the services), this layout provides them itself. Slot components
 * mounted via app-slot inherit the injector chain via ngComponentOutlet
 * and pick up the same instance — no wrapper component required.
 */
@Component({
    selector: 'cms-inspector-layout',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CmsPageHeaderComponent, CmsPageFooterComponent, SlotComponent],
    providers: [PageActionsService, PageFooterService],
    template: `
        <div class="inspector-layout">
            @if (pageTitle()) {
                <cms-page-header
                    [title]="pageTitle()"
                    [icon]="pageIcon()"
                    [subtitle]="pageSubtitle()"
                    [actions]="headerActions()"
                    (actionClick)="onHeaderAction($event)" />
            }
            <div class="inspector-layout__body">
                <div class="inspector-layout__content">
                    @for (entry of orderedSections(); track entry.key) {
                        <section class="inspector-layout__section"
                                 [class.inspector-layout__section--sticky]="entry.section.sticky">
                            @if (entry.section.title) {
                                <h2 class="inspector-layout__section-title">{{ entry.section.title }}</h2>
                            }
                            @if (mainSlotComponent(entry.section); as component) {
                                <app-slot [key]="component" />
                            }
                        </section>
                    }
                </div>
            </div>
            <cms-page-footer />
        </div>
    `,
    styles: [`
        :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }

        .inspector-layout {
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        /* The body is the SCROLL container -- full-width so the
           scrollbar appears at the right viewport edge (not at the
           x=max-width line). Inner __content carries the max-width +
           auto margins for readable line length, and the side padding
           lives there too (the outer coolms-main already provides 20px
           around the whole shell -- we don't double up). */
        .inspector-layout__body {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
        }

        .inspector-layout__content {
            max-width: 1100px;
            margin: 0 auto;
            /* Vertical breathing room only: top spaces the first
               section from the page-header's bottom border; bottom
               keeps content off the page-footer when scrolled to end. */
            padding: 16px 0 32px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .inspector-layout__section {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        /* Sections marked sticky: true in the layout YAML pin to the
           top of the scroll container so input forms / filters stay
           visible while operators scroll through results below. The
           background fill is mandatory -- without it, scrolled content
           bleeds through during overlap (sticky elements stay in flow
           but allow siblings to scroll underneath when z-index lifts). */
        .inspector-layout__section--sticky {
            position: sticky;
            top: 0;
            z-index: 1;
            background: var(--cms-bg, #f9fafb);
            padding-top: 8px;
            padding-bottom: 12px;
        }

        .inspector-layout__section-title {
            margin: 0;
            font-size: .95rem;
            font-weight: 600;
            color: var(--cms-text);
        }

        cms-page-footer { flex-shrink: 0; }
    `],
})
export class InspectorLayoutComponent implements OnInit {
    /**
     * Explicit layoutId input. When omitted, the shell falls back to
     * the value at `route.data.layoutId` so routes can opt in via:
     *   data: { layoutId: 'web:routing-inspector' }
     */
    readonly layoutId = input<string>('');

    private readonly route       = inject(ActivatedRoute);
    private readonly configSvc   = inject(ConfigService);
    private readonly destroyRef  = inject(DestroyRef);
    private readonly pageActions = inject(PageActionsService);

    // Raw YAML body, populated when the BE responds.
    private readonly cfg = signal<LayoutConfig | null>(null);

    readonly pageIcon       = computed(() => this.cfg()?.icon ?? '');
    readonly pageSubtitle   = computed(() => this.cfg()?.subtitle ?? '');
    /** Title precedence: dynamic (slot-set) > YAML > '' */
    readonly pageTitle      = computed(() => this.pageActions.title() || (this.cfg()?.title ?? ''));
    /** YAML-declared header actions; slot components can override via PageActionsService. */
    readonly headerActions  = computed(() => {
        const fromSlot = this.pageActions.actions();
        if (fromSlot.length > 0) return fromSlot;
        const yaml: LayoutHeaderAction[] = this.cfg()?.headerActions ?? [];
        return yaml.map(a => ({
            id:       a.id,
            label:    a.label ?? '',
            icon:     a.icon ?? '',
            title:    a.title ?? a.label ?? '',
            primary:  a.primary ?? false,
            disabled: a.disabled ?? false,
        }));
    });

    /**
     * Sections in YAML insertion order. We rely on the BE returning the
     * parsed YAML map ordering (Symfony Yaml preserves it); we just key
     * the @for by entry index to keep the iteration stable.
     */
    readonly orderedSections = computed(() => {
        const sections = this.cfg()?.sections ?? {};
        return Object.entries(sections).map(([key, section]) => ({ key, section }));
    });

    ngOnInit(): void {
        const explicitId = this.layoutId();
        const routeId    = (this.route.snapshot.data['layoutId'] as string | undefined) ?? '';
        const id         = explicitId || routeId;

        if (!id) {
            // Mis-wired route is a developer bug, not a user-facing
            // condition -- log and render nothing rather than silently
            // showing an empty page.
            console.error('cms-inspector-layout: no layoutId provided via [layoutId] input or route.data.layoutId');
            return;
        }

        this.configSvc.layout(id).pipe(
            catchError(() => of({} as LayoutConfig)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(cfg => this.cfg.set(cfg));
    }

    /**
     * Resolve `slots.content.main.component` from a section. Inspector
     * sections are single-slot today; multi-slot sections are a future
     * extension (cms-detail-layout shape).
     */
    mainSlotComponent(section: LayoutSection): string | null {
        const slots = (section.slots ?? {}) as Record<string, { component?: string } | undefined>;
        return slots['content.main']?.component ?? null;
    }

    onHeaderAction(actionId: string): void {
        this.pageActions.dispatch(actionId);
    }
}
