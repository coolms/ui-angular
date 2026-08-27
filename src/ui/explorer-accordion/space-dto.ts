/**
 * Wire DTO for a single "space" entry in the explorer accordion.
 *
 * A space is a runtime-projected scope inside a library (Media, Document, …)
 * — a directory subtree the user can browse / upload to. The shape is
 * deliberately module-agnostic so the accordion component is reusable
 * across libraries. Backend producers (e.g. {@link MediaSpaceResource})
 * MUST project to this shape on the wire.
 */
export interface SpaceDto {
    readonly key:        string;       // 'personal' | 'shared' | 'site:<slug>'
    readonly label:      string;       // 'Personal' | 'Shared' | 'Site: default'
    readonly rootPath:   string;       // '/home/{uid}/media' | '/media' | '/content/{slug}/media'
    readonly badge:      string | null;
    readonly isWritable: boolean;
    readonly priority:   number;
    /**
     * Site the space belongs to, or null/absent when it belongs to none.
     *
     * Decoded server-side from the space key so no client ever has to split
     * `site:<slug>` or a VFS path apart — see `ArticleSpacesProvider`.
     * Optional because only the Articles producer projects it today; Media
     * and Document have no publishing flow that needs a site.
     */
    readonly siteSlug?:  string | null;
}
