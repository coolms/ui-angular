import { type Observable } from 'rxjs';

/** A space the person may read, such as their own files. */
export interface FilesPickerSpace {
    readonly id: string;
    readonly name: string;
}

/** One row of a folder, as the host lists it. */
export interface FilesPickerEntry {
    readonly id: string;
    /** The entry's name in its folder: the next path segment when it is a folder. */
    readonly name: string;
    /** What to show instead of the name, when the host has a better one. */
    readonly label?: string | null;
    readonly kind: 'folder' | 'file';
    readonly size?: number | null;
    readonly mimeType?: string | null;
}

/** One page of a folder; `next` when more follow. */
export interface FilesPickerPage {
    readonly entries: readonly FilesPickerEntry[];
    readonly next?: string | null;
}

/** A chosen file, with the space and the folder path it was chosen in, so the host needs no second lookup. */
export interface FilesPickerChoice extends FilesPickerEntry {
    readonly space: string;
    readonly path: string;
}

/** What the host has spent of a limit before this choice; `cost` is what a file adds against it, its size by default. */
export interface FilesPickerBudget {
    readonly usedBytes: number;
    readonly limitBytes: number;
    readonly cost?: (entry: FilesPickerEntry) => number;
}

/** Thrown or emitted by `list` for a folder the person may not open: shown as denied in place. */
export class FilesPickerDenied extends Error {
    constructor(message = 'denied') {
        super(message);
        this.name = 'FilesPickerDenied';
    }
}

/** Thrown or emitted by `list` with the host's own words for a failure; anything else shows the kit's words. */
export class FilesPickerFailure extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FilesPickerFailure';
    }
}

/** The host's catalogue: a key, the English fallback, and the values to put in it. */
export type FilesPickerTranslate = (key: string, fallback: string, params?: Readonly<Record<string, string | number>>) => string;

/** Everything the picker is given when it opens. */
export interface FilesPickerOptions {
    readonly title?: string;
    /** In the host's order; the first is shown first. With one, no switch is drawn. */
    readonly spaces: readonly FilesPickerSpace[];
    /** One page of a folder of a space; the path is '' for the space's top, else its segments joined by '/'. */
    readonly list: (space: string, path: string, cursor?: string) => Observable<FilesPickerPage> | Promise<FilesPickerPage>;
    /** The host's own reason a file cannot be chosen, or nothing. */
    readonly disabledReason?: (entry: FilesPickerEntry) => string | null | undefined;
    readonly budget?: FilesPickerBudget | null;
    /** The confirm action's words for a count; by default the catalogue's `filesPicker.confirm` keys. */
    readonly confirmLabel?: (count: number) => string;
    /** A size in the person's language; by default a decimal size in the document's language. */
    readonly formatSize?: (bytes: number) => string;
    readonly translate?: FilesPickerTranslate;
    readonly onConfirm?: (chosen: readonly FilesPickerChoice[]) => void;
    readonly onCancel?: () => void;
}
