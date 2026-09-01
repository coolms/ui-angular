import { Directive, HostBinding, HostListener, input, output } from '@angular/core';

/**
 * Per §1 — config inputs accepted on the directive selector.
 * `accept` is a list of MIME patterns; `'<type>/*'` wildcards match
 * any subtype, exact strings match exactly, empty/undefined accepts
 * all files.
 */
export interface CmsDropzoneConfig {
    accept?: string[];
    multiple?: boolean;
    disabled?: boolean;
}

/**
 * Shared dropzone primitive. Apply to any element via
 * `[cmsDropzone]`. Captures drag-drop of files from the OS, filters
 * by MIME, and emits `(filesDropped)`. Toggles the `cms-dropzone--active`
 * class while a file drag is over the host so consumers can style
 * the highlight state with their own scoped CSS.
 *
 * Gates on `event.dataTransfer.types.includes('Files')` so in-app
 * CdkDrag operations don't trigger the dropzone — only drags
 * originating from the OS shell (with the `Files` payload type)
 * activate it.
 *
 * Uses an enter-counter to handle the dragleave-fires-when-entering-
 * child quirk: increment on dragenter, decrement on dragleave,
 * only remove the active class when the counter hits zero.
 */
@Directive({ selector: '[cmsDropzone]', standalone: true })
export class CmsDropzoneDirective {
    readonly cmsDropzone = input<CmsDropzoneConfig>({});

    readonly filesDropped = output<File[]>();

    private active = false;
    private dragEnterCount = 0;

    @HostBinding('class.cms-dropzone--active')
    get isActive(): boolean {
        return this.active;
    }

    @HostListener('dragenter', ['$event'])
    onDragEnter(event: DragEvent): void {
        if (!this.shouldActivate(event)) {
            return;
        }
        event.preventDefault();
        this.dragEnterCount += 1;
        this.active = true;
    }

    @HostListener('dragover', ['$event'])
    onDragOver(event: DragEvent): void {
        if (!this.shouldActivate(event)) {
            return;
        }
        event.preventDefault();
        // dragover may fire without a preceding dragenter (some browsers
        // skip it on rapid re-entry); ensure active is set.
        this.active = true;
    }

    @HostListener('dragleave', ['$event'])
    onDragLeave(event: DragEvent): void {
        if (!this.shouldActivate(event)) {
            return;
        }
        this.dragEnterCount = Math.max(0, this.dragEnterCount - 1);
        if (this.dragEnterCount === 0) {
            this.active = false;
        }
    }

    @HostListener('drop', ['$event'])
    onDrop(event: DragEvent): void {
        if (!this.shouldActivate(event)) {
            return;
        }
        event.preventDefault();
        this.dragEnterCount = 0;
        this.active = false;

        const list = event.dataTransfer?.files;
        if (!list || list.length === 0) {
            return;
        }
        const cfg = this.cmsDropzone();
        const accept = cfg.accept;
        const multiple = cfg.multiple ?? true;

        const matched: File[] = [];
        for (let i = 0; i < list.length; i += 1) {
            const file = list.item(i);
            if (file === null) {
                continue;
            }
            if (this.matchesAccept(file, accept)) {
                matched.push(file);
                if (!multiple) {
                    break;
                }
            }
        }
        if (matched.length > 0) {
            this.filesDropped.emit(matched);
        }
    }

    /**
     * True when the directive should react to this drag event. Skips
     * disabled state and skips drags that don't carry OS files (e.g.
     * CdkDrag in-app drags whose `dataTransfer.types` is empty or
     * carries a custom mime).
     */
    private shouldActivate(event: DragEvent): boolean {
        if (this.cmsDropzone().disabled === true) {
            return false;
        }
        const types = event.dataTransfer?.types;
        if (!types) {
            return false;
        }
        // `types` is a DOMStringList in some browsers, array-like
        // elsewhere; Array.from normalises both.
        return Array.from(types).includes('Files');
    }

    private matchesAccept(file: File, accept: string[] | undefined): boolean {
        if (!accept || accept.length === 0) {
            return true;
        }
        const fileType = file.type || '';
        for (const pattern of accept) {
            if (pattern === '*/*' || pattern === '*') {
                return true;
            }
            if (pattern.endsWith('/*')) {
                const prefix = pattern.slice(0, -1); // 'image/' from 'image/*'
                if (fileType.startsWith(prefix)) {
                    return true;
                }
                continue;
            }
            if (pattern === fileType) {
                return true;
            }
        }
        return false;
    }
}
