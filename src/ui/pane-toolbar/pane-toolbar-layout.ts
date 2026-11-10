import { type PaneToolbarAction, type PaneToolbarLayout, type PaneToolbarWidths } from './cms-pane-toolbar.types';

const ALL_SHOWN: PaneToolbarLayout = { labelsHidden: false, bare: [], overflowed: [] };

/** The actions in their groups: groups in the order of their first action, each keeping its actions' order. */
export function groupsOf(actions: readonly PaneToolbarAction[]): PaneToolbarAction[][] {
    const groups = new Map<string | number, PaneToolbarAction[]>();
    for (const action of actions) {
        const group = groups.get(action.group);
        if (group) group.push(action);
        else groups.set(action.group, [action]);
    }

    return [...groups.values()];
}

/**
 * The steps by which actions go behind More actions: one step per overflow number, the lowest first, each holding
 * every action that shares it, in the row's order. An action with no number is in no step.
 */
export function overflowSteps(actions: readonly PaneToolbarAction[]): string[][] {
    const steps = new Map<number, string[]>();
    for (const action of actions) {
        if (action.overflow === undefined) continue;
        const step = steps.get(action.overflow);
        if (step) step.push(action.id);
        else steps.set(action.overflow, [action.id]);
    }

    return [...steps.entries()].sort(([a], [b]) => a - b).map(([, ids]) => ids);
}

/**
 * The steps by which labels hide: the overflow steps first, then each action with no overflow number alone, from the
 * end of the row as drawn back to its start.
 */
export function labelSteps(actions: readonly PaneToolbarAction[]): string[][] {
    const pinned = groupsOf(actions).flat().filter((a) => a.overflow === undefined).map((a) => [a.id]);

    return [...overflowSteps(actions), ...pinned.reverse()];
}

/** The width the row's actions take with these labels hidden (`bare`) and these actions behind More actions. */
export function rowWidth(
    actions: readonly PaneToolbarAction[],
    widths: PaneToolbarWidths,
    bare: ReadonlySet<string>,
    behind: ReadonlySet<string>,
): number {
    const shown = groupsOf(actions.filter((a) => !behind.has(a.id)));
    let total = 0;
    let items = 0;
    for (const group of shown) {
        for (const action of group) {
            total += (bare.has(action.id) ? widths.icon : widths.labelled).get(action.id) ?? 0;
            items++;
        }
    }
    const separators = Math.max(0, shown.length - 1);
    total += separators * widths.separator;
    items += separators;
    if (behind.size > 0) {
        total += widths.more;
        items++;
    }

    return total + Math.max(0, items - 1) * widths.gap;
}

/** The width the row's actions take, every label shown or every label hidden, with these actions behind More actions. */
export function actionsWidth(
    actions: readonly PaneToolbarAction[],
    widths: PaneToolbarWidths,
    labelled: boolean,
    behind: ReadonlySet<string>,
): number {
    return rowWidth(actions, widths, labelled ? new Set() : new Set(actions.map((a) => a.id)), behind);
}

/**
 * How the row gives way at this width: labels hide one step at a time (labelSteps), the fewest steps that let the row
 * fit; only once every label is hidden do actions go behind More actions by their overflow number, the fewest steps
 * that let the rest and More actions fit, and never one action alone -- More actions takes an icon's width itself, so
 * a menu of one saves no room. An action with no number never goes. Each width gives one answer from the measured
 * widths alone, so widening undoes the steps in the reverse order. A width not yet measured shows all.
 */
export function paneToolbarLayout(
    width: number | null,
    actions: readonly PaneToolbarAction[],
    widths: PaneToolbarWidths | null,
): PaneToolbarLayout {
    if (width === null || widths === null) return ALL_SHOWN;
    const none = new Set<string>();
    if (rowWidth(actions, widths, none, none) <= width) return ALL_SHOWN;
    let bare: string[] = [];
    for (const step of labelSteps(actions)) {
        bare = [...bare, ...step];
        if (rowWidth(actions, widths, new Set(bare), none) <= width) {
            return { labelsHidden: bare.length >= actions.length, bare, overflowed: [] };
        }
    }
    const all = new Set(bare);
    let behind: string[] = [];
    for (const step of overflowSteps(actions)) {
        behind = [...behind, ...step];
        if (behind.length < 2) continue;
        if (rowWidth(actions, widths, all, new Set(behind)) <= width) return { labelsHidden: true, bare, overflowed: behind };
    }

    return { labelsHidden: true, bare, overflowed: behind.length >= 2 ? behind : [] };
}
