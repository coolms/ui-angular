import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { Store } from '@ngxs/store';
import { NaviGraphService, NaviGraphNode, AppConfigState } from '@coolms/core-angular';
import {
    CmsTreePickerNode,
    CmsTreePickerSource,
} from '../ui/tree-picker/cms-tree-picker.types';

/**
 * Ship B.X.2 -- adapter that wraps a NaviGraph tree as a
 * `CmsTreePickerSource`. The wrapped tree is identified by slug
 * (e.g. `navi.admin`). Selectable leaves are active + visible nodes
 * that are not `action.logout` targets and carry either
 * `meta.routerLink` or a non-empty `path`; that mirrors
 * `NaviGraphService.handleClick`'s canonical fallback.
 *
 * Ships `{ href }` as the data payload so consumers can build a
 * downstream link object (e.g. `NotificationLink`) without
 * re-resolving the route.
 *
 * `@Injectable()` without `providedIn` so each consumer provides
 * its own instance via component-scoped `providers: [NaviGraphTreeSource]`;
 * this allows the `treeSlug` setter to be per-instance.
 */
@Injectable()
export class NaviGraphTreeSource implements CmsTreePickerSource<{ href: string }> {
    private readonly naviGraph = inject(NaviGraphService);
    private readonly appStore = inject(Store);

    /**
     * The slug of the NaviGraph tree to wrap. Consumers set this
     * before the picker first opens. An empty slug yields an empty
     * tree so the dropdown stays operable even when the consumer
     * forgets to wire the slug.
     */
    treeSlug: string = '';

    loadAll(): Observable<ReadonlyArray<CmsTreePickerNode<{ href: string }>>> {
        if (this.treeSlug === '') {
            console.error('[NaviGraphTreeSource] treeSlug is not set; returning an empty tree.');
            return of([]);
        }
        const pattern = this.appStore.selectSnapshot(AppConfigState.manifest)?.navi?.graphBySlug;
        if (!pattern) {
            console.error('[NaviGraphTreeSource] manifest.navi.graphBySlug is not configured; returning an empty tree.');
            return of([]);
        }
        const url = pattern.replace('{slug}', this.treeSlug);

        return this.naviGraph.loadTree(url).pipe(
            map((tree) => this.toPickerTree(tree)),
        );
    }

    /**
     * NaviGraph admin nodes are stored flat (every `parent_id IS
     * NULL`); the sidebar's visual nesting comes from `meta.section`
     * grouping, not from a parentId chain. Mirror that grouping
     * rule from `AdminLayoutComponent.filteredAdminNav` so the
     * picker shows separators as group headers with their items
     * indented underneath.
     *
     * Roots that already carry real children (truly nested data,
     * future-proof) pass through unchanged.
     */
    private toPickerTree(roots: ReadonlyArray<NaviGraphNode>): CmsTreePickerNode<{ href: string }>[] {
        const allFlat = roots.every((n) => !n.children || n.children.length === 0);
        if (!allFlat) {
            return roots.map((root) => this.mapNode(root));
        }

        // Index separators by path. Only `meta.type === 'separator'`
        // qualifies as a group anchor; other meta-less roots stay
        // un-sectioned.
        const separators = new Map<string, NaviGraphNode>();
        for (const n of roots) {
            if (this.isSeparator(n)) {
                separators.set(n.path, n);
            }
        }

        const itemsBySection = new Map<string, NaviGraphNode[]>();
        const unsectioned: NaviGraphNode[] = [];
        for (const n of roots) {
            if (this.isSeparator(n)) {
                continue;
            }
            const section = typeof n.meta['section'] === 'string' ? n.meta['section'] : null;
            if (section !== null && separators.has(section)) {
                const list = itemsBySection.get(section) ?? [];
                list.push(n);
                itemsBySection.set(section, list);
            } else {
                unsectioned.push(n);
            }
        }

        const out: CmsTreePickerNode<{ href: string }>[] = [];
        const sortedSeps = [...separators.values()].sort((a, b) => a.sortOrder - b.sortOrder);
        for (const sep of sortedSeps) {
            const items = itemsBySection.get(sep.path) ?? [];
            if (items.length === 0) {
                continue;
            }
            items.sort((a, b) => a.sortOrder - b.sortOrder);
            out.push({
                id: sep.id,
                label: sep.title,
                selectable: false,
                children: items.map((c) => this.mapLeaf(c)),
            });
        }
        unsectioned.sort((a, b) => a.sortOrder - b.sortOrder);
        for (const n of unsectioned) {
            out.push(this.mapLeaf(n));
        }
        return out;
    }

    private isSeparator(n: NaviGraphNode): boolean {
        return n.meta['type'] === 'separator';
    }

    private mapNode(n: NaviGraphNode): CmsTreePickerNode<{ href: string }> {
        const selectable = this.isSelectableLeaf(n);
        const href = this.routeHref(n);
        return {
            id: n.id,
            label: n.title,
            selectable,
            children: n.children?.map((c) => this.mapNode(c)),
            data: selectable ? { href } : undefined,
        };
    }

    private mapLeaf(n: NaviGraphNode): CmsTreePickerNode<{ href: string }> {
        const selectable = this.isSelectableLeaf(n);
        const href = this.routeHref(n);
        return {
            id: n.id,
            label: n.title,
            selectable,
            data: selectable ? { href } : undefined,
        };
    }

    private isSelectableLeaf(n: NaviGraphNode): boolean {
        if (!n.isActive || !n.isVisible) {
            return false;
        }
        if (n.meta.target === 'action.logout') {
            return false;
        }
        if (n.children && n.children.length > 0) {
            return false;
        }
        return this.routeHref(n).length > 0;
    }

    /**
     * Resolution chain mirrors `AdminLayoutComponent.routerLinkFor`
     * (the canonical sidebar path builder):
     *
     *   1. `meta.route` -- the PHP/YAML convention used by every
     *      navi.admin node. Returns it with a leading `/` if absent.
     *   2. `meta.routerLink` -- typed-field convention; same shape.
     *   3. `node.path` -- the breadcrumb path, which carries an
     *      `/admin/...` prefix that the Angular router (base-href
     *      `/admin/`) does NOT expect. Strip the `/admin` prefix
     *      before returning so the URL matches a registered route
     *      and the wildcard's `redirectTo: 'sections'` fall-through
     *      stays out of the way.
     */
    private routeHref(n: NaviGraphNode): string {
        const fromMeta = n.meta['route'] ?? n.meta.routerLink;
        if (typeof fromMeta === 'string' && fromMeta.length > 0) {
            return fromMeta.startsWith('/') ? fromMeta : `/${fromMeta}`;
        }
        const path = typeof n.path === 'string' ? n.path : '';
        if (path.length === 0) {
            return '';
        }
        const stripped = path.replace(/^\/admin/, '');
        return stripped.length > 0 ? stripped : '/';
    }
}
