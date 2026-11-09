/**
 * The icons a server's NaviGraph node may name, by their Bootstrap Icons name, and the kit's icon for each. This kit
 * draws Bootstrap Icons (`bi bi-<icon>`), so each kit icon is the class name it draws. A name not in the table has no
 * icon here: the action shows its label alone.
 */
export const BOOTSTRAP_ICONS: Readonly<Record<string, string>> = {
    'reply': 'reply',
    'reply-all': 'reply-all',
    'forward': 'forward',
    'envelope': 'envelope',
    'envelope-open': 'envelope-open',
    'star': 'star',
    'star-fill': 'star-fill',
    'folder-symlink': 'folder-symlink',
    'folder': 'folder',
    'trash': 'trash',
    'archive': 'archive',
    'arrow-clockwise': 'arrow-clockwise',
    'download': 'download',
    'printer': 'printer',
    'three-dots': 'three-dots',
};

/** The kit's icon for a Bootstrap Icons name, or null when the table has none. */
export function iconForName(name: string | null | undefined): string | null {
    return typeof name === 'string' && Object.prototype.hasOwnProperty.call(BOOTSTRAP_ICONS, name) ? BOOTSTRAP_ICONS[name] : null;
}
