export interface VfsNodeDto {
    readonly id:          string;
    readonly name:        string;
    readonly type:        'file' | 'directory' | 'resource' | 'package' | 'symlink';
    readonly path:        string;
    readonly mode:        string;
    readonly modeString:  string;
    readonly size:        number;
    readonly humanSize:   string;
    readonly mimeType:    string | null;
    readonly extension:   string | null;
    readonly uid:         string;
    readonly gid:         string;
    readonly uname:       string;
    readonly gname:       string;
    readonly createdAt:      string;
    readonly updatedAt:      string;
    readonly isRendered:     boolean;
    /** True when the node has a physical presence in document_root. */
    readonly isMaterialized: boolean;
    /** True when the node is system-owned and cannot be deleted/moved/chmod'd. */
    readonly isSystem:       boolean;
    /** True when the node should be hidden from regular directory listings. */
    readonly isHidden:       boolean;
    /** True when the node can contain children (Directory, Package, or Resource). */
    readonly isContainer:    boolean;
    /**
     * Human-readable display label, resolved and persisted server-side.
     *
     * This is the DISPLAY name; `name` remains the identity used for paths,
     * lookups and rename. For `/home/{uuid}` the backend stamps the owner's
     * identifier here, which is why the grid can show "ada@example.com" for a
     * directory whose actual name is a UUID. Null when the node has no
     * display label, in which case callers fall back to `name`.
     */
    readonly title:          string | null;
    /** Free-text description from extras.description; null when not set. */
    readonly description:    string | null;
    /** Caller's effective permissions on this node. */
    readonly permissions: { readonly read: boolean; readonly write: boolean; readonly execute: boolean };
    /**
     * Module-owned metadata bag. Always been on the wire; declared here since
 * An earlier fix, where the DTMPL editor reads `documentNative` to know it is
     * opening an authored DOCUMENT rather than a page fragment.
     *
     * Optional and loosely typed on purpose: every module stamps its own keys,
     * so a reader must treat any given one as possibly absent — and a key added
     * before a node existed is absent on that node forever.
     */
    readonly extras?: Readonly<Record<string, unknown>> | null;
}

export type VfsViewMode = 'grid' | 'list';

export interface UploadItem {
    readonly id:       string;   // crypto.randomUUID(), client-side only
    readonly fileName: string;
    progress:          number;   // 0–100
    status:            'pending' | 'uploading' | 'done' | 'error';
    error?:            string;
}

export interface VfsBreadcrumb {
    readonly label: string;
    readonly path:  string;
}

/** Shape of the paginated DirectoryListProvider response. */
export interface VfsDirectoryPage {
    readonly member:     VfsNodeDto[];
    readonly hasMore:    boolean;
    readonly nextCursor: string | null;
}

/**
 * One entry in the New File menu, contributed by an installed module and served
 * by `GET /vfs/file-kinds`.
 *
 * The client stays generic: it never knows what a "Word template" IS, only that
 * creating one means POSTing to `endpoint` with the typed name under
 * `nameField` and the folder under `folderField`, plus `payload` verbatim.
 * Creation stays with the module that owns the rules.
 */
export interface VfsFileKind {
    readonly id:          string;
    readonly label:       string;
    /** Menu grouping — kinds from one module belong together. */
    readonly group:       string;
    readonly icon:        string;
    readonly endpoint:    string;
    /** Body field the typed name goes in: `name` for templates, `title` for documents. */
    readonly nameField:   string;
    readonly folderField: string;
    readonly payload:     Record<string, unknown>;
    /** A hint only — the server decides the real filename. */
    readonly extension:   string | null;
}
