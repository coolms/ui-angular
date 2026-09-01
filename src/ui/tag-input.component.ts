import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    HostListener,
    ViewChild,
    computed,
    forwardRef,
    inject,
    input,
    output,
    signal,
} from '@angular/core';

import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * A selectable option for {@link TagInputComponent}'s label/value mode: the
 * `value` is what the model round-trips (e.g. a tag slug); the `label` is what
 * the chip and dropdown display (e.g. a human tag name).
 */
export interface TagOption {
    readonly value: string;
    readonly label: string;
}

/**
 * Reusable tag / multi-value input — badge chips with remove, free-add on
 * Enter/comma, and an optional searchable suggestions dropdown. A `ControlValueAccessor`
 * over `string[]`, so it drops into any reactive form.
 *
 * The richer sibling of {@link ChipInputComponent}: pass a `suggestions` list and
 * typing filters it into an autocomplete dropdown (selecting adds a chip);
 * free-add still works for values not in the list. With no `suggestions` it
 * behaves like a plain chip input. Not tag-specific — usable anywhere a
 * "search + badges" multi-select is wanted (the suggestions can be any string
 * vocabulary the caller feeds, static or async-populated).
 *
 * Two vocabulary modes, both round-tripping a `string[]` model:
 *   - **string** (`suggestions`): value === label, the simplest case.
 *   - **label/value** (`options`): supply `{value, label}` pairs — chips and the
 *     dropdown render `label` while the model holds `value`. Free-add of a value
 *     not in the list is converted via {@link createOption} (default: identity),
 *     so a caller with a derived value (e.g. a slug) can map typed text to it.
 *   `options` takes precedence over `suggestions` when both are given.
 */
@Component({
    selector: 'app-tag-input',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    providers: [{
        provide: NG_VALUE_ACCESSOR,
        useExisting: forwardRef(() => TagInputComponent),
        multi: true,
    }],
    template: `
        <div class="tagin-wrap" (click)="focusInput()">
            @for (value of tags(); track value) {
                <span class="tagin-chip">
                    {{ labelFor(value) }}
                    <button type="button" (click)="remove(value); $event.stopPropagation()">×</button>
                </span>
            }
            <input #inputEl
                   type="text"
                   class="tagin-field"
                   [placeholder]="tags().length === 0 ? placeholder() : ''"
                   (input)="onInput($event)"
                   (keydown)="onKeydown($event)"
                   (focus)="onFocus()"
                   (blur)="onBlur($event)" />
        </div>

        @if (open() && filtered().length > 0) {
            <div class="tagin-menu">
                @for (option of filtered(); track option.value) {
                    <button type="button"
                            class="tagin-menu-item"
                            (mousedown)="$event.preventDefault()"
                            (click)="pickSuggestion(option)">
                        {{ option.label }}
                    </button>
                }
            </div>
        }
    `,
    styles: [`
        :host { display: block; position: relative; }
        /* Was entirely on Bootstrap's palette — border, focus ring, chip and
           its close button (#2038). The focus ring in particular was Bootstrap
           blue while every other field in the admin rings amber. */
        .tagin-wrap {
            display: flex; flex-wrap: wrap; gap: 4px;
            border: 1px solid var(--cms-btn-border); border-radius: .375rem;
            padding: 4px 8px; min-height: 38px; cursor: text;
            background: var(--cms-input-bg);
        }
        .tagin-wrap:focus-within {
            border-color: var(--cms-accent);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--cms-accent) 15%, transparent);
        }
        .tagin-chip {
            display: inline-flex; align-items: center; gap: 4px;
            background: var(--cms-surface-muted); color: var(--cms-text);
            border-radius: var(--cms-radius-sm, 4px);
            padding: 1px 6px; font-size: .8rem;
        }
        .tagin-chip button {
            background: none; border: none; cursor: pointer;
            padding: 0; line-height: 1; color: var(--cms-text-secondary); font-size: .9rem;
        }
        .tagin-chip button:hover { color: var(--cms-danger); }
        /* The WRAP is the field; this is only the caret's home inside it. With
           no background of its own it fell through to the browser default,
           which is white — invisible in light mode, a white block in dark. */
        .tagin-field {
            border: none; outline: none; flex: 1;
            min-width: 80px; font-size: .875rem;
            background: transparent; color: inherit;
        }
        .tagin-menu {
            position: absolute; top: calc(100% + 2px); left: 0; right: 0; z-index: 1200;
            max-height: 200px; overflow-y: auto;
            background: var(--cms-surface); border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius, 4px); box-shadow: var(--cms-shadow-md, 0 4px 12px rgba(0,0,0,.12));
            padding: 2px;
        }
        .tagin-menu-item {
            display: block; width: 100%; text-align: left;
            padding: 6px 10px; background: none; border: none; cursor: pointer;
            border-radius: 3px; font-size: .8125rem; color: var(--cms-text, #111827);
        }
        .tagin-menu-item:hover { background: var(--cms-border-light, #f0f2f5); }
    `],
})
export class TagInputComponent implements ControlValueAccessor {
    readonly placeholder = input<string>('Add tag…');
    /** String-vocabulary candidates (value === label). Empty = plain free-add chip input. */
    readonly suggestions = input<readonly string[]>([]);
    /** Label/value-vocabulary candidates; takes precedence over `suggestions` when set. */
    readonly options = input<readonly TagOption[]>([]);
    /** When false, only values present in the vocabulary can be added (no typing-in new ones). */
    readonly allowFreeAdd = input<boolean>(true);
    /**
     * Converts free-typed text into the option to add (label/value mode). Return
     * null to reject. Defaults to identity (`value === label === typed text`).
     */
    readonly createOption = input<(typed: string) => TagOption | null>(
        (typed: string) => {
            const v = typed.trim();
            return v === '' ? null : { value: v, label: v };
        },
    );

    /**
     * Emits the live typed text as the user types — lets a parent drive an ASYNC
     * suggestions source (debounce → fetch → feed the result back via `options`).
     * With only a static `suggestions`/`options` vocabulary this can be ignored.
     */
    readonly queryChange = output<string>();

    /** The model: the selected option *values* (slugs in label/value mode). */
    readonly tags  = signal<string[]>([]);
    readonly query = signal('');
    readonly open  = signal(false);

    /** Labels for free-added values not present in the supplied vocabulary. */
    private readonly extraOptions = signal<readonly TagOption[]>([]);

    @ViewChild('inputEl') inputEl!: ElementRef<HTMLInputElement>;
    private readonly host = inject(ElementRef<HTMLElement>);

    private onChange  = (_: string[]) => {};
    private onTouched = () => {};

    /** The active vocabulary as label/value options (`options` wins over `suggestions`). */
    readonly optionList = computed<readonly TagOption[]>(() => {
        const opts = this.options();
        return opts.length > 0 ? opts : this.suggestions().map(s => ({ value: s, label: s }));
    });

    /** value → label, merging the vocabulary with any free-added labels. */
    private readonly labelByValue = computed<Map<string, string>>(() => {
        const map = new Map<string, string>();
        for (const o of this.optionList()) map.set(o.value, o.label);
        for (const o of this.extraOptions()) if (!map.has(o.value)) map.set(o.value, o.label);
        return map;
    });

    /** Options matching the query (by label or value), minus already-selected ones. */
    readonly filtered = computed<readonly TagOption[]>(() => {
        const q = this.query().trim().toLowerCase();
        const selected = new Set(this.tags());
        return this.optionList()
            .filter(o => !selected.has(o.value)
                && (q === '' || o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)))
            .slice(0, 50);
    });

    /** Display label for a selected value (falls back to the value itself). */
    labelFor(value: string): string {
        return this.labelByValue().get(value) ?? value;
    }

    focusInput(): void {
        this.inputEl?.nativeElement.focus();
        if (this.optionList().length > 0) this.open.set(true);
    }

    onFocus(): void {
        if (this.optionList().length > 0) this.open.set(true);
    }

    onInput(event: Event): void {
        this.query.set((event.target as HTMLInputElement).value);
        this.queryChange.emit(this.query());
        // Open unconditionally: with an async source the matching options may not
        // have arrived yet, so gating on the CURRENT vocabulary would hide the menu
        // for the response. `filtered()` empty ⇒ the menu still renders nothing.
        this.open.set(true);
    }

    onKeydown(event: KeyboardEvent): void {
        const inputEl = event.target as HTMLInputElement;
        const value = inputEl.value.trim();

        if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            if (value && this.commitTyped(value)) {
                this.clearInput(inputEl);
            } else if (value && this.filtered().length >= 1) {
                // No exact match / free-add disabled: accept the top suggestion.
                this.addOption(this.filtered()[0]);
                this.clearInput(inputEl);
            }
            return;
        }
        if (event.key === 'Backspace' && !value && this.tags().length > 0) {
            this.remove(this.tags().at(-1)!);
        }
        if (event.key === 'Escape') {
            this.open.set(false);
        }
    }

    onBlur(event: FocusEvent): void {
        // Suggestion clicks preventDefault on mousedown so they don't blur the
        // input first — so a blur here means the user clicked away: commit any
        // free-typed value (matching ChipInput's behaviour).
        const inputEl = event.target as HTMLInputElement;
        const value = inputEl.value.trim();
        if (value && this.commitTyped(value)) {
            this.clearInput(inputEl);
        }
        this.onTouched();
    }

    pickSuggestion(option: TagOption): void {
        this.addOption(option);
        if (this.inputEl) this.clearInput(this.inputEl.nativeElement);
        this.open.set(false);
        this.inputEl?.nativeElement.focus();
    }

    remove(value: string): void {
        this.tags.update(t => t.filter(x => x !== value));
        this.onChange(this.tags());
    }

    /**
     * Resolve typed text to an option and add it: prefer an exact vocabulary
     * match (by label or value), else free-add via {@link createOption}. Returns
     * whether anything was committed.
     */
    private commitTyped(typed: string): boolean {
        const lower = typed.toLowerCase();
        const match = this.optionList().find(o =>
            o.value.toLowerCase() === lower || o.label.toLowerCase() === lower);
        if (match) {
            this.addOption(match);
            return true;
        }
        if (!this.allowFreeAdd()) return false;
        const created = this.createOption()(typed);
        if (created && created.value.trim() !== '') {
            this.addOption(created);
            return true;
        }
        return false;
    }

    private addOption(option: TagOption): void {
        const value = option.value.replace(/,/g, '').trim();
        if (value === '' || this.tags().includes(value)) return;
        // Remember a free-added label so the chip shows it (not the raw value).
        if (option.label && option.label !== value && !this.labelByValue().has(value)) {
            this.extraOptions.update(o => [...o, { value, label: option.label }]);
        }
        this.tags.update(t => [...t, value]);
        this.onChange(this.tags());
    }

    private clearInput(el: HTMLInputElement): void {
        el.value = '';
        this.query.set('');
        this.queryChange.emit('');
    }

    @HostListener('document:click', ['$event.target'])
    onDocClick(target: EventTarget | null): void {
        // `$event.target` is an EventTarget; narrow it once so the DOM
        // containment check below stays a real check.
        const node = target instanceof Node ? target : null;
        if (this.open() && !this.host.nativeElement.contains(node)) {
            this.open.set(false);
        }
    }

    writeValue(val: string[]): void {
        this.tags.set(Array.isArray(val) ? val : []);
    }
    registerOnChange(fn: (_: string[]) => void): void { this.onChange = fn; }
    registerOnTouched(fn: () => void): void { this.onTouched = fn; }
}
