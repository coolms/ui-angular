import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    DestroyRef,
    TemplateRef,
    computed,
    contentChild,
    inject,
    input,
    model,
    output,
    signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
    CdkDrag,
    CdkDragDrop,
    CdkDragHandle,
    CdkDragPlaceholder,
    CdkDropList,
    moveItemInArray,
} from '@angular/cdk/drag-drop';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { defer, EMPTY, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ToastService } from '../toast.service';

/** One opaque element in the ordered list. The builder never inspects its
 *  shape — the consumer renders the body and supplies `factory`/`labelOf`. */
export type OrderedElement = Record<string, unknown>;

/** A palette entry: click to append, or drag onto the list to place. `id` is
 *  passed to the consumer's `factory` to mint a fresh element of that type. */
export interface OrderedPaletteEntry {
    readonly id: string;
    readonly label: string;
}

/** Mints a fresh element for a palette `id`, or null to refuse. */
export type OrderedElementFactory = (id: string) => OrderedElement | null;

/** The persistence callback: given the current elements, returns a save stream. */
export type OrderedSaveFn = (elements: OrderedElement[]) => Observable<unknown>;

/**
 * Generic **ordered-element Builder** substrate (Track D).
 *
 * A Builder edits an ordered list of typed elements through a palette +
 * per-element inspector + drag-drop + dirty/Save plumbing. This component owns
 * the *generic machinery only* — the palette (click-append + drag-to-place),
 * the CDK drag-drop list (reorder + insert-from-palette), move ↑/↓, remove,
 * dirty/saving state, and the Save flow — and is blind to what an "element" is.
 *
 * The consumer supplies the element *body* via a content-projected
 * `<ng-template let-element let-i="index">`, plus pure config: the `palette`,
 * a `factory(id)`, a `labelOf(el)` for the card head, and a `saveFn(els)`.
 * Structural ops mutate the two-way `elements` model immutably and mark the
 * builder dirty; the consumer calls {@link markDirty} on content edits and
 * {@link markPristine} after a fresh load.
 *
 * First extracted from the landing Page Builder (`block-editor.component.ts`);
 * second consumer is the Form Builder.
 */
@Component({
    selector: 'app-ordered-builder',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgTemplateOutlet, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder],
    template: `
        <div class="ob">
            <!-- Palette / action bar: click a type to append, or drag it onto the
                 list to drop it at a position. Connected drag source with copy
                 semantics — dropping never removes a chip. -->
            <div class="ob__palette" cdkDropList cdkDropListSortingDisabled
                 [cdkDropListConnectedTo]="[canvasList]">
                <span class="ob__palette-label"><i class="bi bi-plus-square"></i> {{ paletteLabel() }}</span>
                @for (entry of palette(); track entry.id) {
                    <button type="button" class="ob__chip" cdkDrag [cdkDragData]="entry"
                            (click)="append(entry.id)"
                            title="Click to append, or drag onto the list to place it">
                        {{ entry.label }}
                    </button>
                }
            </div>

            @if (elements().length === 0) {
                <div class="ob__empty">{{ emptyText() }}</div>
            }

            <div class="ob__list" cdkDropList #canvasList="cdkDropList"
                 (cdkDropListDropped)="onDrop($event)">
                @for (element of elements(); track $index; let i = $index) {
                    <div class="ob__card" cdkDrag>
                        <div class="ob__card-ph" *cdkDragPlaceholder></div>
                        <div class="ob__card-head">
                            <span class="ob__card-type">
                                <span class="ob__grip" cdkDragHandle title="Drag to reorder">
                                    <i class="bi bi-grip-vertical"></i>
                                </span>
                                {{ labelOf()(element) }}
                            </span>
                            <div class="ob__card-actions">
                                <button class="cms-btn cms-btn-sm" title="Move up"
                                        [disabled]="i === 0" (click)="move(i, -1)">
                                    <i class="bi bi-arrow-up"></i>
                                </button>
                                <button class="cms-btn cms-btn-sm" title="Move down"
                                        [disabled]="i === elements().length - 1" (click)="move(i, 1)">
                                    <i class="bi bi-arrow-down"></i>
                                </button>
                                <button class="cms-btn cms-btn-sm ob__danger" title="Remove"
                                        (click)="remove(i)">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </div>

                        <div class="ob__body">
                            <ng-container
                                [ngTemplateOutlet]="bodyTpl() ?? null"
                                [ngTemplateOutletContext]="{ $implicit: element, index: i }" />
                        </div>
                    </div>
                }
            </div>

            @if (!embedded()) {
                <div class="ob__foot">
                    <button class="cms-btn cms-btn-primary cms-btn-sm"
                            [disabled]="!dirty() || saving()"
                            (click)="save()">
                        {{ saving() ? 'Saving…' : saveLabel() }}
                    </button>
                </div>
            }
        </div>
    `,
    styles: [`
        :host { display: block; }
        .ob { display: flex; flex-direction: column; gap: 10px; width: 100%; }
        .ob__empty {
            padding: 12px; text-align: center; font-size: .8125rem;
            color: var(--cms-text-muted); border: 1px dashed var(--cms-border);
            border-radius: var(--cms-radius, 6px);
        }
        .ob__card {
            border: 1px solid var(--cms-border);
            border-radius: var(--cms-radius, 6px);
            background: var(--cms-surface);
            overflow: hidden;
        }
        .ob__card-head {
            display: flex; align-items: center; justify-content: space-between;
            padding: 6px 10px; background: var(--cms-border-light);
            border-bottom: 1px solid var(--cms-border);
        }
        .ob__card-type {
            font-size: .8125rem; font-weight: 600; text-transform: capitalize;
            display: flex; align-items: center; gap: 6px;
        }
        .ob__card-actions { display: flex; gap: 4px; }
        .ob__danger { color: var(--cms-danger, #dc2626); }
        .ob__body { display: flex; flex-wrap: wrap; gap: 10px; padding: 10px; }
        .ob__foot { display: flex; align-items: center; justify-content: flex-end; }
        /* Palette / action bar. Pinned to the top of the scrolling list (the host
           is the overflow container) so it stays reachable while editing further
           down. Opaque bg + low z-index keep scrolling cards behind it; the shadow
           reads the "content scrolls under a bar" affordance. */
        .ob__palette {
            position: sticky; top: 0; z-index: 2;
            display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
            padding: 8px; border: 1px solid var(--cms-border);
            border-radius: var(--cms-radius, 6px); background: var(--cms-border-light);
            box-shadow: var(--cms-shadow-sm, 0 1px 3px rgba(0,0,0,.08));
        }
        .ob__palette-label {
            font-size: .75rem; font-weight: 600; color: var(--cms-text-muted);
            display: inline-flex; align-items: center; gap: 4px; margin-right: 2px;
        }
        .ob__chip {
            font-size: .75rem; padding: 3px 10px; cursor: grab;
            border: 1px solid var(--cms-border); border-radius: 999px;
            background: var(--cms-surface); color: var(--cms-text);
            white-space: nowrap; transition: background .12s, border-color .12s;
        }
        .ob__chip:hover { background: var(--cms-primary, #2563eb); border-color: var(--cms-primary, #2563eb); color: var(--cms-text-inverse); }
        .ob__chip:active { cursor: grabbing; }
        .ob__chip.cdk-drag-preview { box-shadow: var(--cms-shadow-md, 0 4px 12px rgba(0,0,0,.10)); opacity: .95; }
        .ob__chip.cdk-drag-placeholder { opacity: .35; }
        .ob__list { display: flex; flex-direction: column; gap: 10px; }
        .ob__grip { cursor: grab; display: inline-flex; color: var(--cms-text-muted); }
        .ob__grip:active { cursor: grabbing; }
        /* CDK drag-drop visuals */
        .ob__card.cdk-drag-preview {
            box-shadow: var(--cms-shadow-md, 0 4px 12px rgba(0,0,0,.10));
            border-radius: var(--cms-radius, 6px);
        }
        .ob__card.cdk-drag-placeholder { opacity: 0; }
        .ob__card-ph {
            height: 38px; border: 1px dashed var(--cms-primary, #2563eb);
            border-radius: var(--cms-radius, 6px); background: var(--cms-border-light);
        }
        .ob__list.cdk-drop-list-dragging .ob__card:not(.cdk-drag-placeholder) {
            transition: transform 180ms cubic-bezier(0, 0, .2, 1);
        }
        .cdk-drag-animating { transition: transform 220ms cubic-bezier(0, 0, .2, 1); }
    `],
})
export class OrderedBuilderComponent {
    private readonly toast = inject(ToastService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly cdr = inject(ChangeDetectorRef);

    /** The ordered list, two-way bound to the consumer's source signal. */
    readonly elements = model<OrderedElement[]>([]);

    /** Palette entries (`{ id, label }`); click to append, drag to place. */
    readonly palette = input<readonly OrderedPaletteEntry[]>([]);
    /** Mints a fresh element from a palette id. */
    readonly factory = input<OrderedElementFactory>(() => null);
    /** Card-head label for an element. */
    readonly labelOf = input<(el: OrderedElement) => string>(el => String(el['type'] ?? 'Item'));
    /** Persistence callback; when null, Save is a no-op. */
    readonly saveFn = input<OrderedSaveFn | null>(null);

    /** Hide the built-in Save button so a host drives save via {@link save}. */
    readonly embedded = input(false);
    readonly paletteLabel = input('Add element');
    readonly emptyText = input('Nothing here yet — add one from the palette above (click or drag).');
    readonly saveLabel = input('Save');
    readonly savedMessage = input('Saved');
    readonly saveFailedMessage = input('Save failed');

    /** Emitted after a successful save. */
    readonly saved = output<void>();

    /** The per-element body, projected by the consumer as `<ng-template>`. */
    readonly bodyTpl = contentChild(TemplateRef);

    readonly dirty = signal(false);
    readonly saving = signal(false);

    /** True the consumer should call after content edits (the builder can't see
     *  inside an element, so it can't know a field changed on its own). */
    markDirty(): void {
        this.dirty.set(true);
    }

    /** Reset dirty after a fresh load (a parent → child `elements` write does
     *  not itself mark dirty, but a re-load over a dirtied builder needs this). */
    markPristine(): void {
        this.dirty.set(false);
    }

    // ── Structural mutations (immutable on the model) ───────────────────────

    /** Append a fresh element of `id` (palette click). */
    append(id: string): void {
        const fresh = this.factory()(id);
        if (!fresh) return;
        this.elements.update(els => [...els, fresh]);
        this.markDirty();
    }

    /** Insert a fresh element of `id` at `index` (palette drag-to-place). */
    insertAt(id: string, index: number): void {
        const fresh = this.factory()(id);
        if (!fresh) return;
        this.elements.update(els => {
            const next = [...els];
            next.splice(Math.max(0, Math.min(index, next.length)), 0, fresh);
            return next;
        });
        this.markDirty();
    }

    remove(i: number): void {
        this.elements.update(els => els.filter((_, idx) => idx !== i));
        this.markDirty();
    }

    move(i: number, dir: -1 | 1): void {
        const j = i + dir;
        this.elements.update(els => {
            if (j < 0 || j >= els.length) return els;
            const next = [...els];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
        this.markDirty();
    }

    /**
     * Drop onto the list. Within the list (grip handle) it reorders; from the
     * palette (a connected source) it inserts a fresh element of the dragged
     * type at the drop position.
     */
    onDrop(event: CdkDragDrop<OrderedElement[]>): void {
        if (event.previousContainer === event.container) {
            if (event.previousIndex === event.currentIndex) return;
            this.elements.update(els => {
                const next = [...els];
                moveItemInArray(next, event.previousIndex, event.currentIndex);
                return next;
            });
            this.markDirty();
            return;
        }
        const entry = event.item.data as OrderedPaletteEntry | undefined;
        if (entry?.id) {
            this.insertAt(entry.id, event.currentIndex);
        }
    }

    // ── Persistence ─────────────────────────────────────────────────────────

    /**
     * The save as a **cold** Observable, for an embedded host that has to
     * *sequence* this write against other writers (see the page editor's
     * `saveAll`: the landing blocks and the post Fields panel both merge-patch
     * the SAME node's one `extras` JSON column, so overlapping them loses an
     * update). Owns the builder's `saving`/`dirty` state and the `saved`
     * output; the host owns the toast, so one Save reports once.
     *
     * Nothing to save (no `saveFn`, pristine, or already in flight) yields an
     * empty stream — safe to drop into a `concat` chain.
     */
    save$(): Observable<unknown> {
        const fn = this.saveFn();
        if (!fn || !this.dirty() || this.saving()) return EMPTY;
        // `defer` so the flag flips and the elements are read at SUBSCRIBE
        // time — in a sequential chain this op starts long after it was built.
        return defer(() => {
            this.saving.set(true);
            return fn(this.elements());
        }).pipe(
            tap({
                next: () => {
                    this.saving.set(false);
                    this.dirty.set(false);
                    this.saved.emit();
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.saving.set(false);
                    this.cdr.markForCheck();
                },
            }),
        );
    }

    /** The built-in Save button: {@see save$} plus this builder's own toast. */
    save(): void {
        this.save$()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => this.toast.success(this.savedMessage()),
                error: () => this.toast.error(this.saveFailedMessage()),
            });
    }
}
