import { inject, Injectable, Type } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { BottomDrawerService } from '../layout/bottom-drawer.service';
import { VfsNodeDto } from '../vfs/vfs.types';

export interface FileEditorDescriptor {
    component: Type<unknown>;
    /**
     * 'dialog'  — opened as a CDK full-screen dialog (DIALOG_DATA injection).
     *             Use this for existing editors built around @angular/cdk/dialog.
     * 'drawer'  — opened in the resizable bottom panel (NgComponentOutlet inputs).
     *             Use this for new editors that accept @Input() properties.
     */
    mode?: 'dialog' | 'drawer';
}

/**
 * Registry that maps VFS node types and MIME patterns to editor components.
 *
 * Registration (typically in a feature's routes file):
 *   FileEditorRegistry.register('package', { component: PageEditorComponent, mode: 'dialog' });
 *   FileEditorRegistry.register('text/*', { component: CodeEditorComponent, mode: 'drawer' });
 *
 * Resolution order: exact MIME → wildcard MIME (text/*) → NodeType → null.
 */
@Injectable({ providedIn: 'root' })
export class FileEditorRegistry {
    private static readonly map = new Map<string, FileEditorDescriptor>();

    private readonly dialog       = inject(Dialog);
    private readonly bottomDrawer = inject(BottomDrawerService);

    static register(key: string, descriptor: FileEditorDescriptor): void {
        FileEditorRegistry.map.set(key, descriptor);
    }

    static resolve(node: VfsNodeDto): FileEditorDescriptor | null {
        const mime = node.mimeType ?? '';

        if (mime && FileEditorRegistry.map.has(mime)) {
            return FileEditorRegistry.map.get(mime)!;
        }

        const wildcardKey = mime.includes('/') ? mime.split('/')[0] + '/*' : '';
        if (wildcardKey && FileEditorRegistry.map.has(wildcardKey)) {
            return FileEditorRegistry.map.get(wildcardKey)!;
        }

        if (FileEditorRegistry.map.has(node.type)) {
            return FileEditorRegistry.map.get(node.type)!;
        }

        return null;
    }

    resolve(node: VfsNodeDto): FileEditorDescriptor | null {
        return FileEditorRegistry.resolve(node);
    }

    /**
     * Whether an EDITOR is installed for `mime`, without needing a node.
     *
     * Callers that hold a MIME but no `VfsNodeDto` — the Documents library
     * decides between labelling its action "View" or "Edit" (#1678) — would
     * otherwise have to fabricate a node just to ask. Same resolution order
     * as `resolve()` minus the NodeType fallback, which needs a node.
     */
    static hasEditorForMime(mime: string | null): boolean {
        if (null === mime || '' === mime) return false;
        if (FileEditorRegistry.map.has(mime)) return true;

        const wildcardKey = mime.includes('/') ? mime.split('/')[0] + '/*' : '';
        return wildcardKey !== '' && FileEditorRegistry.map.has(wildcardKey);
    }

    hasEditorForMime(mime: string | null): boolean {
        return FileEditorRegistry.hasEditorForMime(mime);
    }

    /**
     * Open the registered editor for `node`, routed by the descriptor's mode.
     *
     * Returns true when a registered editor was found and opened, false when
     * no editor is registered for this node (caller decides the fallback).
     */
    openFor(node: VfsNodeDto): boolean {
        const descriptor = FileEditorRegistry.resolve(node);
        if (!descriptor) return false;

        if ((descriptor.mode ?? 'dialog') === 'drawer') {
            this.bottomDrawer.open(descriptor.component, { node });
        } else {
            this.dialog.open(descriptor.component, {
                data:       { node },
                panelClass: 'cms-editor-dialog',
            });
        }
        return true;
    }
}
