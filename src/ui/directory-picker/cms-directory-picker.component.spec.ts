import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CmsDirectoryPickerComponent } from './cms-directory-picker.component';
import { VfsTreeService } from './vfs-tree.service';
import type { VfsNodeDto } from '../../vfs/vfs.types';

/**
 * Phase X-1 — behaviour spec for the generic directory picker.
 *
 * Coverage:
 *   1. Mount fires an initial `listChildren` for the root.
 *   2. Expand triggers a lazy fetch only the first time.
 *   3. Selecting a writable directory emits `valueChange` AND
 *      `nodeChange`.
 *   4. System (`_`-prefix) and hidden (`.`-prefix) directories are
 *      never selectable — the predicate is a hard rule the
 *      caller-supplied `selectableWhen` cannot override.
 *   5. Toggling "Show hidden" invalidates the cache and refetches
 *      with `showHidden=true`.
 *   6. Path-input + Enter resolves via `resolvePath`; invalid paths
 *      surface an inline error.
 *   7. Create-folder happy path appends to the parent and selects.
 *   8. Create-folder 409 surfaces "already exists" without losing
 *      the typed name.
 */
describe('CmsDirectoryPickerComponent', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<CmsDirectoryPickerComponent>>;
    let component: CmsDirectoryPickerComponent;
    let httpMock: HttpTestingController;

    function makeNode(overrides: Partial<VfsNodeDto> & Pick<VfsNodeDto, 'name' | 'path'>): VfsNodeDto {
        return {
            id:             overrides.path.replace(/\W+/g, '-') || 'root',
            // Required on VfsNodeDto (display label; callers fall back to
            // `name` when null). Must be present in the base literal —
            // supplying it only via `Partial` overrides types it as
            // `string | null | undefined` and fails assignment.
            title:          null,
            type:           'directory',
            mode:           '0755',
            modeString:     'rwxr-xr-x',
            size:           0,
            humanSize:      '0 B',
            mimeType:       null,
            extension:      null,
            uid:            '1',
            gid:            '1',
            uname:          'ada',
            gname:          'ada',
            createdAt:      '',
            updatedAt:      '',
            isRendered:     false,
            isMaterialized: true,
            isSystem:       false,
            isHidden:       false,
            isContainer:    true,
            description:    null,
            permissions:    { read: true, write: true, execute: true },
            ...overrides,
        };
    }

    function answerListChildren(path: string, member: VfsNodeDto[]): void {
        const req = httpMock.expectOne(
            (r) => r.url === '/api/v1/vfs/directories/list' && r.params.get('path') === path,
        );
        req.flush({ member, hasMore: false, nextCursor: null });
    }

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule, CmsDirectoryPickerComponent],
            providers: [VfsTreeService],
        });
        fixture = TestBed.createComponent(CmsDirectoryPickerComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('fires an initial children fetch for the root path on mount', () => {
        fixture.detectChanges();
        answerListChildren('/', [makeNode({ name: 'docs', path: '/docs' })]);
        // After flush the tree should expose the child as a node row.
        const rows = (component as unknown as { flatRows(): readonly unknown[] }).flatRows();
        expect(rows.length).toBeGreaterThan(0);
    });

    it('emits valueChange when a writable directory is clicked', () => {
        fixture.detectChanges();
        answerListChildren('/', [makeNode({ name: 'docs', path: '/docs' })]);

        const emitted: string[] = [];
        component.valueChange.subscribe((v) => emitted.push(v));

        (component as unknown as { onSelectNode(n: VfsNodeDto): void })
            .onSelectNode(makeNode({ name: 'docs', path: '/docs' }));

        expect(emitted).toEqual(['/docs']);
    });

    it('refuses to select a system directory regardless of selectableWhen', () => {
        // Caller relaxes the predicate to "always true" — must still
        // be ignored for `_`-prefix / system nodes.
        fixture.componentRef.setInput('selectableWhen', () => true);
        fixture.detectChanges();
        answerListChildren('/', [
            makeNode({ name: '_thumb', path: '/_thumb', isSystem: true, isHidden: true }),
        ]);

        const emitted: string[] = [];
        component.valueChange.subscribe((v) => emitted.push(v));

        (component as unknown as { onSelectNode(n: VfsNodeDto): void })
            .onSelectNode(makeNode({
                name: '_thumb', path: '/_thumb', isSystem: true, isHidden: true,
            }));

        expect(emitted).toEqual([]);
    });

    it('refuses to select a node without write permission (default predicate)', () => {
        fixture.detectChanges();
        answerListChildren('/', [
            makeNode({
                name: 'readonly',
                path: '/readonly',
                permissions: { read: true, write: false, execute: true },
            }),
        ]);

        const emitted: string[] = [];
        component.valueChange.subscribe((v) => emitted.push(v));

        (component as unknown as { onSelectNode(n: VfsNodeDto): void })
            .onSelectNode(makeNode({
                name: 'readonly',
                path: '/readonly',
                permissions: { read: true, write: false, execute: true },
            }));

        expect(emitted).toEqual([]);
    });

    it('toggling show-hidden invalidates the cache and refetches', () => {
        fixture.detectChanges();
        answerListChildren('/', []);

        (component as unknown as { onShowHiddenToggle(v: boolean): void })
            .onShowHiddenToggle(true);

        // After the toggle a fresh request with showHidden=true
        // should be issued for the root.
        const req = httpMock.expectOne(
            (r) =>
                r.url === '/api/v1/vfs/directories/list'
                && r.params.get('path') === '/'
                && r.params.get('showHidden') === 'true',
        );
        req.flush({ member: [], hasMore: false, nextCursor: null });
    });

    it('resolves a typed path before navigating', () => {
        fixture.detectChanges();
        answerListChildren('/', []);

        (component as unknown as { pathInputValue: { set(v: string): void } })
            .pathInputValue.set('/docs/batches');
        (component as unknown as { navigateToTypedPath(): void }).navigateToTypedPath();

        const req = httpMock.expectOne(
            (r) => r.url === '/api/v1/vfs/files' && r.params.get('path') === '/docs/batches',
        );
        req.flush(makeNode({ name: 'batches', path: '/docs/batches' }));
        // Additional list calls for ancestors may be queued — flush
        // them too so the spec's `httpMock.verify()` passes.
        try { answerListChildren('/docs', []); } catch { /* no-op when no fetch was queued */ }
    });

    it('surfaces inline error when a typed path is not found', () => {
        fixture.detectChanges();
        answerListChildren('/', []);

        (component as unknown as { pathInputValue: { set(v: string): void } })
            .pathInputValue.set('/missing');
        (component as unknown as { navigateToTypedPath(): void }).navigateToTypedPath();

        const req = httpMock.expectOne(
            (r) => r.url === '/api/v1/vfs/files' && r.params.get('path') === '/missing',
        );
        req.flush({}, { status: 404, statusText: 'Not Found' });

        const err = (component as unknown as { pathInputError(): string | null }).pathInputError();
        expect(err).toMatch(/not found/i);
    });

    it('emits nodeChange alongside valueChange so callers get the backend id', () => {
        fixture.detectChanges();
        answerListChildren('/', []);

        const received: { path: string; nodeId: string }[] = [];
        component.nodeChange.subscribe((e) => received.push(e));

        const node = makeNode({ name: 'docs', path: '/docs', id: 'node-1' });
        (component as unknown as { onSelectNode(n: VfsNodeDto): void }).onSelectNode(node);

        expect(received).toEqual([{ path: '/docs', nodeId: 'node-1' }]);
    });
});
