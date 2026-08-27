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

/**
 * The `tags` field widget (registered by the Tag module via the field-widget
 * registry): a badge-chip multi-value input with `/tags?q=` autocomplete, over
 * a `string[]` of tag *slugs* stored in the node's `extras.{field}`.
 *
 * Chips and suggestions display each tag's human **label**, while the model
 * round-trips its **slug** — so existing `extras.tags` slug arrays stay correct
 * and backend tag-sync (which keys on slug) is unaffected. Free-add of a new
 * tag slugifies the typed label client-side (mirroring the backend
 * `AsciiSlugger`), since `extras.tags` is persisted verbatim with no
 * server-side normalization on content save.
 *
 * Wraps the shared {@link TagInputComponent}; receives its value + change
 * callback through {@link FieldWidgetInputs} (so it renders generically via
 * `NgComponentOutlet`), and lazily loads the label/value vocabulary from the
 * backend `suggestionsUrl` carried in the widget descriptor.
 */
@Component({
    selector: 'app-tag-field-widget',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, TagInputComponent],
    template: `
        <app-tag-input
            [ngModel]="model()"
            [ngModelOptions]="{ standalone: true }"
            [options]="options()"
            [createOption]="createOption"
            (ngModelChange)="emit($event)" />
    `,
})
export class TagFieldWidgetComponent {
    readonly value = input<unknown>();
    readonly config = input<Record<string, unknown>>({});
    readonly disabled = input(false);
    readonly valueChange = input<(value: unknown) => void>(() => {});

    private readonly http = inject(HttpClient);
    private readonly destroyRef = inject(DestroyRef);

    /** Current chips — the bound value coerced to a string[]. */
    readonly model = computed<string[]>(() => {
        const v = this.value();
        return Array.isArray(v) ? v.map(String) : [];
    });

    /** Tag vocabulary as label/value options ({@link TagOption}.value = slug). */
    readonly options = signal<readonly TagOption[]>([]);

    private loadedUrl = '';

    constructor() {
        // Lazily fetch the tag vocabulary once the suggestions URL is known.
        effect(() => {
            const url = this.config()?.['suggestionsUrl'];
            if (typeof url !== 'string' || url === '' || url === this.loadedUrl) {
                return;
            }
            this.loadedUrl = url;
            this.http.get<{ member?: ReadonlyArray<{ slug?: string; label?: string }> }>(`${url}?limit=200`)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe({
                    next: res => this.options.set(
                        (res.member ?? [])
                            .map(t => ({ value: t.slug ?? '', label: t.label || (t.slug ?? '') }))
                            .filter(o => o.value !== ''),
                    ),
                    error: () => this.options.set([]),
                });
        });
    }

    /**
     * Free-add: slugify the typed label so the stored value stays a slug
     * (mirrors the backend `AsciiSlugger` for ASCII input), keeping the typed
     * text as the displayed label.
     */
    readonly createOption = (typed: string): TagOption | null => {
        const label = typed.trim();
        const value = label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return value === '' ? null : { value, label };
    };

    emit(value: string[]): void {
        this.valueChange()(value);
    }
}
