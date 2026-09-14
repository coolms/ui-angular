import { DestroyRef, Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Store } from '@ngxs/store';
import { ElevationService } from '@coolms/core-angular';
import { Subject } from 'rxjs';
import { VfsWriteAccessService } from './vfs-write-access.service';
import type { VfsNodeDto } from './vfs.types';

/**
 * The editor must agree with the listing at every step.
 *
 * ADR-184's client requirement, point 4: the flags and the prompt read ONE
 * source, the server. The spec that matters here is the one that fails if
 * this service ever starts INFERRING writability -- `flag || elevated` would
 * pass a naive happy-path test and be wrong the moment the server disagrees,
 * which is exactly the second decider the requirement forbids.
 */
describe('VfsWriteAccessService', () => {
    let service: VfsWriteAccessService;
    let httpMock: HttpTestingController;
    let changes$: Subject<unknown>;
    let injector: Injector;
    let offered: number;

    const STAT = '/api/v1/vfs/files?path=%2Fdocs%2Ftemplate.dtmpl';

    const node = (write: boolean): VfsNodeDto => ({
        path: '/docs/template.dtmpl',
        permissions: { read: true, write, execute: false },
    } as unknown as VfsNodeDto);

    beforeEach(() => {
        changes$ = new Subject<unknown>();
        offered = 0;
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: Store, useValue: { selectSnapshot: () => ({ apiBase: '/api/v1' }) } },
                {
                    provide: ElevationService,
                    useValue: {
                        changes$,
                        offerFor: () => {
                            offered++;

                            return new Subject<boolean>();
                        },
                    },
                },
            ],
        });
        service = TestBed.inject(VfsWriteAccessService);
        httpMock = TestBed.inject(HttpTestingController);
        injector = TestBed.inject(Injector);
    });

    afterEach(() => httpMock.verify());

    const track = (write: boolean): ReturnType<VfsWriteAccessService['forNode']> =>
        runInInjectionContext(injector, () =>
            service.forNode(node(write), TestBed.inject(DestroyRef)));

    it('starts from the flag the listing handed it, asking nothing', () => {
        const access = track(false);

        expect(access.writable()).toBe(false);
        httpMock.expectNone(STAT);
    });

    it('re-asks the SERVER on an elevation change and takes its answer', () => {
        const access = track(false);

        changes$.next({ kind: 'granted' });
        httpMock.expectOne(STAT).flush({ permissions: { read: true, write: true, execute: false } });

        expect(access.writable()).toBe(true);
    });

    it('reverts when the server says so on a drop', () => {
        const access = track(false);

        changes$.next({ kind: 'granted' });
        httpMock.expectOne(STAT).flush({ permissions: { read: true, write: true, execute: false } });
        expect(access.writable()).toBe(true);

        changes$.next({ kind: 'dropped' });
        httpMock.expectOne(STAT).flush({ permissions: { read: true, write: false, execute: false } });

        expect(access.writable()).toBe(false);
    });

    /**
     * THE TEETH. An implementation that derived writability from the
     * elevation state instead of re-asking would report true here, because
     * the session IS elevated -- and would disagree with a listing that shows
     * the file read-only. Only the server's answer may decide.
     */
    it('stays read-only when the session is elevated but the server still says no', () => {
        const access = track(false);

        changes$.next({ kind: 'granted' });
        httpMock.expectOne(STAT).flush({ permissions: { read: true, write: false, execute: false } });

        expect(access.writable()).toBe(false);
    });

    it('offers the SAME prompt rather than a second one', () => {
        const access = track(false);

        access.request().subscribe();

        expect(offered).toBe(1);
    });

    it('leaves the flag alone when the stat fails, rather than guessing', () => {
        const access = track(true);

        changes$.next({ kind: 'observed' });
        httpMock.expectOne(STAT).flush('boom', { status: 500, statusText: 'Server Error' });

        expect(access.writable()).toBe(true);
    });
});
