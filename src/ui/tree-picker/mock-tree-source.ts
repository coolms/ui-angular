import { type Observable, of } from 'rxjs';

import { type CmsTreePickerNode, type CmsTreePickerSource } from './cms-tree-picker.types';

export interface MockNodeData {
    readonly href: string;
}

/**
 * Reusable test / demo adapter for `CmsTreePickerComponent`. Returns
 * a small static tree with one populated group ("Documents") and
 * one empty group ("Empty group") so spec files can pin both the
 * happy path and the empty-prune behavior.
 */
export class MockTreeSource implements CmsTreePickerSource<MockNodeData> {
    constructor(
        private readonly nodes: ReadonlyArray<CmsTreePickerNode<MockNodeData>> = defaultTree(),
    ) {
    }

    loadAll(): Observable<ReadonlyArray<CmsTreePickerNode<MockNodeData>>> {
        return of(this.nodes);
    }
}

function defaultTree(): ReadonlyArray<CmsTreePickerNode<MockNodeData>> {
    return [
        {
            id: 'docs',
            label: 'Documents',
            selectable: false,
            children: [
                {
                    id: 'docs.tpl',
                    label: 'Templates',
                    selectable: true,
                    data: { href: '/admin/documents/templates' },
                },
                {
                    id: 'docs.inst',
                    label: 'Instances',
                    selectable: true,
                    data: { href: '/admin/documents/instances' },
                },
            ],
        },
        {
            id: 'identity',
            label: 'Identity',
            selectable: false,
            children: [
                {
                    id: 'identity.users',
                    label: 'Users',
                    selectable: true,
                    data: { href: '/admin/identity/users' },
                },
                {
                    id: 'identity.groups',
                    label: 'Groups',
                    selectable: true,
                    data: { href: '/admin/identity/groups' },
                },
            ],
        },
        {
            id: 'empty',
            label: 'Empty group',
            selectable: false,
            children: [],
        },
    ];
}
