import { inject, Injectable } from '@angular/core';
import { LayoutHeaderAction, NaviGraphService } from '@coolms/core-angular';
import { ToolbarAction } from './page-toolbar.component';

/**
 * Turns layout-config actions (ADR-127) into rendered ToolbarActions.
 *
 * Two things live here that used to live in every page that has a
 * config-driven header or footer.
 *
 * The first is the MAPPING. Seven components carried a byte-identical private
 * `toToolbarAction`, so the day the shapes diverge is the day seven files need
 * the same edit.
 *
 * The second is the CONDITIONS, and they are the reason this is a service
 * rather than a function. A layout action could say what it is but not when it
 * applies, so each page bolted the "when" back on in TypeScript: cockpit
 * interpreted a `requires: state:*` vocabulary through a six-case switch,
 * schedules re-labelled `trigger` while dispatching, calendar re-computed
 * `delete`. Those are declarations wearing runtime clothes. They are
 * `showWhen` / `disabledWhen` / `busyWhen` / `busyLabel` / `activeWhen` on the
 * config
 * now -- the same words a NaviGraph toolbar node uses, evaluated by the same
 * evaluator against a context the page publishes.
 *
 * `requires` stays, and stays page-interpreted, because it asks about the
 * USER's capability rather than the record's state; the caller passes a
 * predicate for it. Anything that can be phrased about the record should be a
 * `showWhen` instead -- a token needs a branch in TypeScript, a condition does
 * not.
 */
@Injectable({ providedIn: 'root' })
export class LayoutActionsService {
    private readonly navi = inject(NaviGraphService);

    /**
     * @param actions  the layout's `headerActions` / `footerActions` (absent = none)
     * @param context  what the conditions are evaluated against, ADR-093 strict:
     *                 a condition naming a field the page never published is FALSE
     * @param allows   decides a `requires` token; omitted means every token passes,
     *                 so a config gate cannot silently hide an action from a page
     *                 that does not implement gating
     */
    resolve(
        actions: LayoutHeaderAction[] | undefined,
        context: Record<string, unknown> = {},
        allows?: (requires: string) => boolean,
    ): ToolbarAction[] {
        return (actions ?? [])
            .filter(a => undefined === a.requires || undefined === allows || allows(a.requires))
            .filter(a => this.navi.matchesShowWhen(a.showWhen, context))
            .map(a => this.toToolbarAction(a, context));
    }

    private toToolbarAction(a: LayoutHeaderAction, context: Record<string, unknown>): ToolbarAction {
        // Busy implies disabled; the two are separate conditions because the
        // reasons are: unavailable is a state of the record, busy is a state of
        // the request, and only the second belongs in the label.
        const busy = undefined !== a.busyWhen
            ? this.navi.matchesShowWhen(a.busyWhen, context)
            : undefined;
        // A condition wins over the static flag when the config states one;
        // `disabled: true` with no condition still means "always disabled".
        const unavailable = undefined !== a.disabledWhen
            ? this.navi.matchesShowWhen(a.disabledWhen, context)
            : a.disabled;
        const disabled = undefined === unavailable && undefined === busy
            ? undefined
            : true === unavailable || true === busy;
        const label = true === busy && undefined !== a.busyLabel ? a.busyLabel : a.label;

        return {
            id:   a.id,
            icon: a.icon ?? '',
            ...(undefined !== label       ? { label }                     : {}),
            ...(undefined !== a.title     ? { title: a.title }            : {}),
            ...(undefined !== a.primary   ? { primary: a.primary }        : {}),
            ...(undefined !== a.danger    ? { danger: a.danger }          : {}),
            ...(undefined !== disabled    ? { disabled }                  : {}),
            ...(undefined !== a.activeWhen
                ? { active: this.navi.matchesShowWhen(a.activeWhen, context) }
                : {}),
        };
    }
}
