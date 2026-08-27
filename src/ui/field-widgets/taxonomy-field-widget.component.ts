import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    computed,
    effect,
    inject,
    input,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TagInputComponent, TagOption } from '../tag-input.component';

interface TaxonomyNodeDto {
    readonly id: string;
    readonly label: string;
    readonly level: number;
}

/**
 * The `taxonomy` field widget (registered by the Taxonomy module via the
 * field-widget registry): a multi-select over a taxonomy tree's nodes — badge
 * chips + search (pick-only) plus an inline "create category" — storing an
 * array of node UUIDs in the node's `extras.{field}`.
 *
 * Reuses the shared {@link TagInputComponent} in label/value mode (chips render
 * each node's label indented by depth; the model holds node UUIDs). Scope, the
 * node-list URL, the create URL, and the resolved tree id all come from the
 * backend widget descriptor ({@link FieldWidgetInputs}.config).
 */
@Component({
    selector: 'app-taxonomy-field-widget',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, TagInputComponent],
    template: `
        <app-tag-input
            [ngModel]="model()"
            [ngModelOptions]="{ standalone: true }"
            [options]="options()"
            [allowFreeAdd]="false"
            placeholder="Pick categories…"
            (ngModelChange)="emit($event)" />

        @if (treeId()) {
            <div class="tfw-create">
                <input #newInput class="cms-input cms-input-sm" type="text"
                       placeholder="New category…"
                       (keydown.enter)="create(newInput.value); newInput.value = ''" />
                <button class="cms-btn cms-btn-sm" type="button"
                        [disabled]="creating()"
                        (click)="create(newInput.value); newInput.value = ''">
                    {{ creating() ? 'Adding…' : '+ Add' }}
                </button>
            </div>
        }
    `,
    styles: [`
        .tfw-create { display: flex; gap: 6px; margin-top: 6px; }
        .tfw-create input { flex: 1; }
    `],
})
export class TaxonomyFieldWidgetComponent {
    readonly value = input<unknown>();
    readonly config = input<Record<string, unknown>>({});
    readonly disabled = input(false);
    readonly valueChange = input<(value: unknown) => void>(() => {});

    private readonly http = inject(HttpClient);
    private readonly destroyRef = inject(DestroyRef);

    /** Selected node UUIDs — the bound value coerced to a string[]. */
    readonly model = computed<string[]>(() => {
        const v = this.value();
        return Array.isArray(v) ? v.map(String) : [];
    });

    /** Tree nodes as label/value options ({@link TagOption}.value = node UUID), label indented by depth. */
    readonly options = signal<readonly TagOption[]>([]);
    readonly creating = signal(false);

    private loadedUrl = '';

    readonly treeId = computed<string>(() => {
        const id = this.config()?.['treeId'];
        return typeof id === 'string' ? id : '';
    });

    constructor() {
        // Load the tree's nodes once the scoped list URL is known.
        effect(() => {
            const url = this.optionsUrl();
            if (url === '' || url === this.loadedUrl) {
                return;
            }
            this.loadedUrl = url;
            this.loadOptions(url);
        });
    }

    emit(value: string[]): void {
        this.valueChange()(value);
    }

    /** Create a new category node from the typed name, then select it. */
    create(typed: string): void {
        const label = typed.trim();
        const treeId = this.treeId();
        const createUrl = this.str('createUrl');
        if (label === '' || treeId === '' || createUrl === '' || this.creating()) {
            return;
        }
        const slug = this.slugify(label);
        if (slug === '') {
            return;
        }

        this.creating.set(true);
        this.http.post<{ id?: string }>(createUrl, { label, slug, treeId })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: res => {
                    this.creating.set(false);
                    if (typeof res.id === 'string' && res.id !== '') {
                        this.emit([...this.model(), res.id]);
                    }
                    this.loadOptions(this.optionsUrl()); // refresh so the new chip shows its label
                },
                error: () => this.creating.set(false),
            });
    }

    private optionsUrl(): string {
        const base = this.str('optionsUrl');
        const tree = this.str('tree');
        if (base === '') {
            return '';
        }
        return tree === '' ? base : `${base}?tree=${encodeURIComponent(tree)}`;
    }

    private loadOptions(url: string): void {
        if (url === '') {
            return;
        }
        this.http.get<{ member?: readonly TaxonomyNodeDto[] }>(url)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: res => this.options.set(
                    (res.member ?? []).map(n => ({
                        value: n.id,
                        label: '  '.repeat(Math.max(0, n.level)) + n.label,
                    })),
                ),
                error: () => this.options.set([]),
            });
    }

    private str(key: string): string {
        const v = this.config()?.[key];
        return typeof v === 'string' ? v : '';
    }

    private slugify(label: string): string {
        return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
}
