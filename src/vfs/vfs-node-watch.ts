import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';

/**
 * What happened to an open file elsewhere: saved by someone (its new version, when the event names one) or deleted.
 */
export interface VfsNodeChange {
    readonly kind: 'changed' | 'deleted';
    /** The file's version after the change, when the event carries it: an editor's own save is told apart by it. */
    readonly version?: string | null;
}

/** Watch one file for changes made elsewhere; completes or errors when the watch cannot go on. */
export type VfsNodeWatch = (node: { readonly id: string; readonly path: string }) => Observable<VfsNodeChange>;

/**
 * The host's file watch (Dmitry, 2026-10-14: "A file that is deleted or changed elsewhere while open: the editor says
 * so, from the VFS change event"). Optional: an editor with none provided only learns of a change when it saves (412 /
 * 404). The admin provides it from its live VFS events.
 */
export const VFS_NODE_WATCH = new InjectionToken<VfsNodeWatch>('VFS_NODE_WATCH');
