/**
 * How an explorer's main pane renders its items (#1709).
 *
 * ONE vocabulary for every explorer. Before this, each module invented its own:
 * Documents had `grid | list`, Media had `large | medium | small | list`, Pages
 * had `list | grid` — three names for the same control, in which `grid` meant
 * "tiles" in two modules and `list` meant "table" in one and "tile-row" in the
 * other. A user switching between Media and Pages met the same buttons meaning
 * different things.
 *
 * The set is the file-manager one (Windows Explorer, Finder), because that is
 * what an explorer IS and the vocabulary is already in every user's hands:
 *
 *  - `large`   — big thumbnails; recognise content by its picture
 *  - `medium`  — the middle thumbnail size
 *  - `small`   — compact thumbnails; scan many items at once
 *  - `content` — one wide row per item: thumbnail, name, and a line or two of
 *                detail. The middle ground — more than a name, less than a table
 *  - `details` — the DataGrid: columns, sorting, filtering, column picking
 *
 * Which of them a given explorer offers is DECLARED IN ITS LAYOUT YAML, not
 * hardcoded per module. The set is a SUPERSET each layout picks from, which is
 * why `medium` is here at all: Media has shipped three thumbnail sizes since
 * before this vocabulary existed, and folding it into two would have moved
 * every stored preference for the sake of a tidier enum. Pages offers four,
 * Media five, a list of definitions may want only `details`.
 */
export type ExplorerViewMode = 'large' | 'medium' | 'small' | 'content' | 'details';

/** Every mode, in the order a switcher should present them. */
export const EXPLORER_VIEW_MODES: readonly ExplorerViewMode[] = [
    'large',
    'medium',
    'small',
    'content',
    'details',
] as const;

/** Bootstrap icon + label per mode, so every switcher looks the same. */
export const EXPLORER_VIEW_MODE_META: Readonly<Record<ExplorerViewMode, { icon: string; label: string }>> = {
    large:   { icon: 'grid-3x3-gap-fill', label: 'Large icons' },
    medium:  { icon: 'grid-fill',         label: 'Medium icons' },
    small:   { icon: 'grid-3x3-gap',      label: 'Small icons' },
    content: { icon: 'card-list',         label: 'Content' },
    details: { icon: 'list-ul',           label: 'Details' },
};

/**
 * Narrow an unvalidated string (YAML, a stored preference) to a mode.
 *
 * Returns null rather than a default so the caller decides what "unknown"
 * means — a bad config entry should be dropped from the offered set, whereas a
 * stale preference should fall back to the layout's default.
 */
export function toExplorerViewMode(value: unknown): ExplorerViewMode | null {
    return EXPLORER_VIEW_MODES.includes(value as ExplorerViewMode)
        ? value as ExplorerViewMode
        : null;
}
