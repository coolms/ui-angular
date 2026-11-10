/**
 * One action of a pane's row, as the server's NaviGraph node gives it. The host passes only the actions it has a
 * handler for; the row knows nothing of what an action does.
 */
export interface PaneToolbarAction {
    readonly id: string;
    /** Its accessible name always; shown beside the icon, or as its tooltip once labels hide. */
    readonly label: string;
    /** A Bootstrap Icons name without `bi-`: 'reply', 'trash'. */
    readonly icon: string;
    /** Groups follow the order of their first action; a separator is drawn between two. */
    readonly group: string | number;
    /**
     * Where it stands in going behind More actions: the lowest goes first, and actions sharing a number go together
     * (a toggle's two states). No number: it never goes. 0: menu only, behind More actions at every width.
     */
    readonly overflow?: number;
    /** Drawn as danger, in the row and in the menu. */
    readonly danger?: boolean;
    readonly disabled?: boolean;
    /** Why it is disabled: its tooltip, and said after its name. */
    readonly reason?: string;
    /** Its work is under way: a spinner in the icon's place, and a second press does nothing. */
    readonly busy?: boolean;
}

/** The widths the row is made of, measured in the page: each action with its label and as its icon alone, in px. */
export interface PaneToolbarWidths {
    readonly labelled: ReadonlyMap<string, number>;
    readonly icon: ReadonlyMap<string, number>;
    readonly more: number;
    readonly separator: number;
    readonly gap: number;
}

/** How the row is drawn at a width: whose labels are hidden, and which actions are behind More actions. */
export interface PaneToolbarLayout {
    /** Every action's label is hidden. */
    readonly labelsHidden: boolean;
    /** The actions whose labels are hidden, in the order they hid. */
    readonly bare: readonly string[];
    readonly overflowed: readonly string[];
}
