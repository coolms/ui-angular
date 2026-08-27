import { Directive, HostListener, output, signal } from '@angular/core';

@Directive({
    selector: '[appDropZone]',
    standalone: true,
    exportAs: 'appDropZone',
    host: { '[class.drop-active]': 'dragOver()' },
})
export class DropZoneDirective {
    filesDropped = output<File[]>();

    dragOver = signal(false);
    private counter = 0;

    @HostListener('dragenter', ['$event'])
    onDragEnter(event: DragEvent): void {
        event.preventDefault();
        if (!event.dataTransfer?.types.includes('Files')) return;
        this.counter++;
        this.dragOver.set(true);
    }

    @HostListener('dragover', ['$event'])
    onDragOver(event: DragEvent): void {
        event.preventDefault();
    }

    @HostListener('dragleave', ['$event'])
    onDragLeave(_event: DragEvent): void {
        this.counter--;
        if (this.counter <= 0) {
            this.counter = 0;
            this.dragOver.set(false);
        }
    }

    @HostListener('drop', ['$event'])
    onDrop(event: DragEvent): void {
        event.preventDefault();
        this.counter = 0;
        this.dragOver.set(false);
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length > 0) this.filesDropped.emit(files);
    }
}
