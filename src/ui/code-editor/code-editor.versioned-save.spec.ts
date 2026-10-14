import { ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Store } from '@ngxs/store';
import { Subject } from 'rxjs';
import { ThemeService } from '@coolms/core-angular';
import { CodeEditorComponent } from './code-editor.component';
import { ToastService } from '../toast.service';
import { NativeDialogService } from '../dialog/native-dialog.service';
import { VFS_NODE_WATCH, type VfsNodeChange } from '../../vfs/vfs-node-watch';
import type { VfsNodeDto } from '../../vfs/vfs.types';

/**
 * The code editor's save names the version it opened (Dmitry, 2026-10-14: "Save never silently recreates the file or
 * overwrites a newer version. Save sends the version it opened (If-Match); on 404 or 412 it offers to save as a copy").
 * Built directly over stubs; the CodeMirror view is a stand-in that holds the text, so nothing here loads CodeMirror.
 */
describe('CodeEditorComponent -- a save names the version it opened', () => {
    const CONTENT = '/api/v1/vfs/files/content?path=%2Fdocs%2Fa.txt';
    const BINARY = '/api/v1/vfs/files/binary';
    let http: HttpTestingController;
    let toast: { success: jasmine.Spy; error: jasmine.Spy };
    let input: jasmine.Spy;
    let changes: Subject<VfsNodeChange>;
    let editor: CodeEditorComponent;

    beforeEach(() => {
        toast = { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') };
        input = jasmine.createSpy('input').and.resolveTo('a (copy).txt');
        changes = new Subject<VfsNodeChange>();
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: DIALOG_DATA, useValue: { node: { id: 'n1', name: 'a.txt', path: '/docs/a.txt', mimeType: 'text/plain' } as VfsNodeDto } },
                { provide: DialogRef, useValue: { close: (): void => undefined } },
                { provide: Store, useValue: { selectSnapshot: () => ({ vfs: { fileContentUrl: '/api/v1/vfs/files/content?path={path}', binaryWriteUrl: BINARY } }) } },
                { provide: ThemeService, useValue: { resolved: signal('light') } },
                { provide: ToastService, useValue: toast },
                { provide: NativeDialogService, useValue: { input } },
                { provide: VFS_NODE_WATCH, useValue: () => changes },
                { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
            ],
        });
        http = TestBed.inject(HttpTestingController);
        editor = TestBed.runInInjectionContext(() => new CodeEditorComponent());
        // No CodeMirror: initEditor is replaced by a view holding the text, as the real one would.
        spyOn(editor as never, 'initEditor').and.callFake(((content: string) => {
            (editor as unknown as { editorView: unknown }).editorView = { state: { doc: { toString: () => content + ' edited' } } };
        }) as never);
        editor.ngAfterViewInit();
    });

    afterEach(() => http.verify());

    function opened(version: string | null): void {
        http.expectOne({ method: 'GET', url: CONTENT }).flush({ content: 'text', contentHash: version });
        editor.dirty.set(true);
    }

    it('keeps the version the file was read at, and the save sends it as If-Match', () => {
        opened('h1');
        editor.save();
        const put = http.expectOne({ method: 'PUT', url: CONTENT });
        expect(put.request.headers.get('If-Match')).toBe('"h1"');
        put.flush({ contentHash: 'h2' });
        expect(editor.target().version).withContext('the version the save answered').toBe('h2');
        expect(editor.dirty()).toBeFalse();

        editor.dirty.set(true);
        editor.save();
        expect(http.expectOne({ method: 'PUT', url: CONTENT }).request.headers.get('If-Match')).toBe('"h2"');
    });

    it('a 412 says the file changed and offers a copy, written with overwrite off -- never over the file', async () => {
        opened('h1');
        editor.save();
        http.expectOne({ method: 'PUT', url: CONTENT }).flush({ detail: 'changed' }, { status: 412, statusText: 'Precondition Failed' });
        expect(editor.notice()).toBe('changed');
        await Promise.resolve();
        await Promise.resolve();
        expect(input).toHaveBeenCalledTimes(1);
        const post = http.expectOne({ method: 'POST', url: BINARY });
        const form = post.request.body as FormData;
        expect(form.get('path')).toBe('/docs/a (copy).txt');
        expect(form.get('overwrite')).toBe('0');
        post.flush({ contentHash: 'c1' });
        expect(editor.target()).toEqual({ path: '/docs/a (copy).txt', version: 'c1' });
        expect(editor.notice()).toBeNull();
    });

    it('a 404 says the file was deleted and offers a copy; declined, nothing is written and the edits stay', async () => {
        input.and.resolveTo(null);
        opened('h1');
        editor.save();
        http.expectOne({ method: 'PUT', url: CONTENT }).flush({ detail: 'gone' }, { status: 404, statusText: 'Not Found' });
        expect(editor.notice()).toBe('deleted');
        await Promise.resolve();
        await Promise.resolve();
        expect(input).toHaveBeenCalledTimes(1);
        http.expectNone({ method: 'POST', url: BINARY });
        expect(editor.dirty()).withContext('the edits stay').toBeTrue();
    });

    it('once the file moved on, Save never goes to it again: it offers the copy instead', async () => {
        opened('h1');
        changes.next({ kind: 'deleted' });
        editor.save();
        http.expectNone({ method: 'PUT', url: CONTENT });
        await Promise.resolve();
        expect(input).toHaveBeenCalledTimes(1);
        http.match({ method: 'POST', url: BINARY }).forEach(r => r.flush({ contentHash: 'c1' }));
    });

    it('a change elsewhere is said at once; the editor\'s own save, told apart by its version, is not', () => {
        opened('h1');
        editor.save();
        http.expectOne({ method: 'PUT', url: CONTENT }).flush({ contentHash: 'h2' });
        changes.next({ kind: 'changed', version: 'h2' });
        expect(editor.notice()).withContext('its own save').toBeNull();
        changes.next({ kind: 'changed', version: 'h3' });
        expect(editor.notice()).toBe('changed');
    });

    it('a file that could not be read is not opened empty, and Save never writes it', () => {
        http.expectOne({ method: 'GET', url: CONTENT }).flush({ detail: 'no' }, { status: 403, statusText: 'Forbidden' });
        expect(editor.notice()).toBe('unreadable');
        editor.dirty.set(true);
        editor.save();
        http.expectNone({ method: 'PUT', url: CONTENT });
    });
});
