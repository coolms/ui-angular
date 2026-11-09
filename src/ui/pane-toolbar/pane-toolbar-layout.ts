import { type PaneToolbarAction, type PaneToolbarLayout, type PaneToolbarWidths } from './cms-pane-toolbar.types';

const ALL_SHOWN: PaneToolbarLayout = { labelsHidden: false, overflowed: [] };

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

/** The width the row's actions take, labels shown or not, with these actions behind More actions. */
export function actionsWidth(
    actions: readonly PaneToolbarAction[],
    widths: PaneToolbarWidths,
    labelled: boolean,
    behind: ReadonlySet<string>,
): number {
    const shown = groupsOf(actions.filter((a) => !behind.has(a.id)));
    const each = labelled ? widths.labelled : widths.icon;
    let total = 0;
    let items = 0;
    for (const group of shown) {
        for (const action of group) {
            total += each.get(action.id) ?? 0;
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

/**
 * How the row gives way at this width: every label first, all at once; then actions go behind More actions by their
 * overflow number, the fewest steps that let the rest and More actions fit, and never one action alone -- More actions
 * takes an icon's width itself, so a menu of one saves no room. An action with no number never goes. A width not yet
 * measured shows all.
 */
export function paneToolbarLayout(
    width: number | null,
    actions: readonly PaneToolbarAction[],
    widths: PaneToolbarWidths | null,
): PaneToolbarLayout {
    if (width === null || widths === null) return ALL_SHOWN;
    if (actionsWidth(actions, widths, true, new Set()) <= width) return ALL_SHOWN;
    if (actionsWidth(actions, widths, false, new Set()) <= width) return { labelsHidden: true, overflowed: [] };
    const steps = overflowSteps(actions);
    let behind: string[] = [];
    for (const step of steps) {
        behind = [...behind, ...step];
        if (behind.length < 2) continue;
        if (actionsWidth(actions, widths, false, new Set(behind)) <= width) return { labelsHidden: true, overflowed: behind };
    }

    return { labelsHidden: true, overflowed: behind.length >= 2 ? behind : [] };
}
