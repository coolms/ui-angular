import { type Observable } from 'rxjs';

/**
 * Ship B.X.1 -- generic hierarchical-select primitive (ADR-106).
 *
 * One node in the picker tree, generic over an adapter-specific
 * payload `T` that the adapter ships through unchanged. Adopters
 * typically populate `data` with the original domain object so the
 * `valueChange` listener can route on it directly.
 */
export interface CmsTreePickerNode<T = unknown> {
    readonly id: string;
    readonly label: string;
    readonly selectable: boolean;
    readonly children?: ReadonlyArray<CmsTreePickerNode<T>>;
    readonly data?: T;
}

/**
 * Adapter the consumer provides. Implement `loadAll` for eager mode
 * or `loadChildren` for lazy mode. `searchAll` is optional and used
 * primarily in lazy mode for server-side search. Eager mode applies
 * the search filter client-side against the cached tree.
 */
export interface CmsTreePickerSource<T = unknown> {
    loadAll?(): Observable<ReadonlyArray<CmsTreePickerNode<T>>>;
    loadChildren?(parentId: string | null): Observable<ReadonlyArray<CmsTreePickerNode<T>>>;
    searchAll?(query: string): Observable<ReadonlyArray<CmsTreePickerNode<T>>>;
}

/**
 * Selection event payload. `breadcrumb` is the chain of ancestor
 * labels including the selected leaf's own label as the last entry,
 * so consumers can render "Identity > Users" without re-walking
 * the tree.
 */
export interface CmsTreePickerSelection<T = unknown> {
    readonly node: CmsTreePickerNode<T>;
    readonly breadcrumb: ReadonlyArray<string>;
}
