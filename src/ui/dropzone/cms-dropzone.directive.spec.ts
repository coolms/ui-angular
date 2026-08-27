import { Component, signal, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CmsDropzoneDirective, type CmsDropzoneConfig } from './cms-dropzone.directive';

/**
 * Jasmine specs for `CmsDropzoneDirective`.
 */

@Component({
    standalone: true,
    imports: [CmsDropzoneDirective],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: '<div [cmsDropzone]="config()" (filesDropped)="onFiles($event)"></div>',
})
class HostComponent {
    readonly config = signal<CmsDropzoneConfig>({});
    readonly directive = viewChild.required(CmsDropzoneDirective);
    received: File[] = [];

    onFiles(files: File[]): void {
        this.received = files;
    }
}

function makeFile(name: string, type: string): File {
    return new File(['x'], name, { type });
}

/**
 * Build a DragEvent with a configurable DataTransfer payload. Native
 * DataTransfer can't be constructed from script in all test runners,
 * so the spec stubs the fields the directive actually reads.
 */
function makeDragEvent(type: string, opts: { types?: string[]; files?: File[] } = {}): DragEvent {
    const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
    const fileList: FileList = {
        length: opts.files?.length ?? 0,
        item: (i: number) => opts.files?.[i] ?? null,
        [Symbol.iterator]: function* (this: FileList) {
            for (let i = 0; i < this.length; i += 1) {
                const f = this.item(i);
                if (f !== null) yield f;
            }
        },
    } as FileList;
    Object.defineProperty(event, 'dataTransfer', {
        value: { types: opts.types ?? [], files: fileList },
        writable: false,
    });
    return event;
}

describe('CmsDropzoneDirective', () => {
    function setup(config: CmsDropzoneConfig = {}) {
        TestBed.configureTestingModule({ imports: [HostComponent] });
        const fixture = TestBed.createComponent(HostComponent);
        // `config` is a plain writable signal on the host, NOT an `@Input()`,
        // so it is driven directly. (An earlier `componentRef.setInput()` call
        // here threw NG0303 for exactly that reason.)
        fixture.componentInstance.config.set(config);
        fixture.detectChanges();
        const hostEl: HTMLElement = fixture.nativeElement.querySelector('div');
        return { fixture, host: fixture.componentInstance, hostEl };
    }

    it('emits filesDropped with all files when no accept filter is set', () => {
        const { host, hostEl } = setup({});
        const f1 = makeFile('a.txt', 'text/plain');
        const f2 = makeFile('b.png', 'image/png');
        hostEl.dispatchEvent(makeDragEvent('drop', { types: ['Files'], files: [f1, f2] }));
        expect(host.received).toEqual([f1, f2]);
    });

    it('filters non-matching files when accept is `image/*`', () => {
        const { host, hostEl } = setup({ accept: ['image/*'] });
        const txt = makeFile('a.txt', 'text/plain');
        const img = makeFile('b.png', 'image/png');
        hostEl.dispatchEvent(makeDragEvent('drop', { types: ['Files'], files: [txt, img] }));
        expect(host.received).toEqual([img]);
    });

    it('matches exact MIME for `application/pdf`', () => {
        const { host, hostEl } = setup({ accept: ['application/pdf'] });
        const pdf = makeFile('a.pdf', 'application/pdf');
        const docx = makeFile('b.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        hostEl.dispatchEvent(makeDragEvent('drop', { types: ['Files'], files: [pdf, docx] }));
        expect(host.received).toEqual([pdf]);
    });

    it('takes only the first matching file when multiple is false', () => {
        const { host, hostEl } = setup({ multiple: false });
        const f1 = makeFile('a.txt', 'text/plain');
        const f2 = makeFile('b.txt', 'text/plain');
        hostEl.dispatchEvent(makeDragEvent('drop', { types: ['Files'], files: [f1, f2] }));
        expect(host.received).toEqual([f1]);
    });

    it('does not emit when disabled is true', () => {
        const { host, hostEl } = setup({ disabled: true });
        hostEl.dispatchEvent(makeDragEvent('drop', { types: ['Files'], files: [makeFile('a.txt', 'text/plain')] }));
        expect(host.received).toEqual([]);
    });

    it('ignores drags without `Files` in dataTransfer.types (CdkDrag coexistence)', () => {
        const { host, hostEl, fixture } = setup({});
        // CdkDrag in-app drag carries an empty or custom-mime types list — no `Files` entry.
        hostEl.dispatchEvent(makeDragEvent('dragenter', { types: [] }));
        fixture.detectChanges();
        expect(hostEl.classList.contains('cms-dropzone--active')).toBe(false);
        hostEl.dispatchEvent(makeDragEvent('drop', { types: [], files: [makeFile('a.txt', 'text/plain')] }));
        expect(host.received).toEqual([]);
    });

    it('keeps active class while dragging over a child element (enter-counter pattern)', () => {
        const { hostEl, fixture } = setup({});
        // Two dragenter (host then child), one dragleave (host → child boundary).
        hostEl.dispatchEvent(makeDragEvent('dragenter', { types: ['Files'] }));
        hostEl.dispatchEvent(makeDragEvent('dragenter', { types: ['Files'] }));
        hostEl.dispatchEvent(makeDragEvent('dragleave', { types: ['Files'] }));
        fixture.detectChanges();
        expect(hostEl.classList.contains('cms-dropzone--active')).toBe(true);
        // Second leave drops counter to zero.
        hostEl.dispatchEvent(makeDragEvent('dragleave', { types: ['Files'] }));
        fixture.detectChanges();
        expect(hostEl.classList.contains('cms-dropzone--active')).toBe(false);
    });

    it('accepts all files when accept pattern includes `*/*`', () => {
        const { host, hostEl } = setup({ accept: ['*/*'] });
        hostEl.dispatchEvent(makeDragEvent('drop', { types: ['Files'], files: [makeFile('a.bin', 'application/octet-stream')] }));
        expect(host.received.length).toBe(1);
    });

    it('does not emit when the drop carries no files', () => {
        const { host, hostEl } = setup({});
        hostEl.dispatchEvent(makeDragEvent('drop', { types: ['Files'], files: [] }));
        expect(host.received).toEqual([]);
    });
});
