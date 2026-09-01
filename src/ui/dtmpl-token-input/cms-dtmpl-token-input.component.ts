import {
    ChangeDetectionStrategy, Component, computed, ElementRef,
    input, model, signal, ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';

/**
 * Text input with `{`-triggered DTMPL-token autocomplete.
 *
 * Typing `{` opens an overlay panel listing the consumer-supplied
 * `availableTokens`. As the user keeps typing the panel filters by a
 * case-insensitive substring match. Selecting a token replaces the
 * span from the opening `{` (inclusive) to the current cursor with
 * the full token text, leaving the user's cursor at the end of the
 * inserted token. Esc or Tab dismiss the overlay without inserting.
 *
 * Stateless: the value is owned by the parent via the two-way
 * `value` model signal. The component does not maintain a separate
 * draft buffer.
 *
 * `availableTokens` are passed as fully-formed DTMPL tokens
 * (e.g., `{const:templateSlug}`, `{var:@user.id}`) so this component
 * does not need to know syntax beyond the `{` trigger.
 */
@Component({
    selector: 'cms-dtmpl-token-input',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, OverlayModule],
    template: `
        <input #inputEl
               type="text"
               class="cms-token-input__field"
               [id]="inputId()"
               [placeholder]="placeholder()"
               [ngModel]="value()"
               (ngModelChange)="onModelChange($event)"
               (keydown)="onKeydown($event)"
               (blur)="onBlur()"
               cdkOverlayOrigin
               #triggerOrigin="cdkOverlayOrigin" />

        <ng-template cdkConnectedOverlay
                     [cdkConnectedOverlayOrigin]="triggerOrigin"
                     [cdkConnectedOverlayOpen]="showOverlay() && filteredTokens().length > 0"
                     [cdkConnectedOverlayPositions]="overlayPositions"
                     [cdkConnectedOverlayHasBackdrop]="false"
                     (overlayOutsideClick)="closeOverlay()"
                     (detach)="closeOverlay()">
            <div class="cms-token-input__panel" role="listbox">
                @for (token of filteredTokens(); track token) {
                    <button type="button"
                            class="cms-token-input__option"
                            role="option"
                            (mousedown)="$event.preventDefault()"
                            (click)="selectToken(token)">
                        {{ token }}
                    </button>
                }
            </div>
        </ng-template>
    `,
    styles: [`
        :host { display: block; }

        .cms-token-input__field {
            display: block;
            width: 100%;
            padding: 6px 10px;
            border: 1px solid var(--cms-border);
            border-radius: var(--cms-radius-sm, 4px);
            background: var(--cms-surface);
            color: var(--cms-text);
            font-size: .9rem;
            font-family: inherit;
        }
        .cms-token-input__field:focus {
            outline: none;
            border-color: var(--cms-accent);
            box-shadow: 0 0 0 2px var(--cms-accent-light, #FEF7E6);
        }

        .cms-token-input__panel {
            min-width: 220px;
            max-height: 240px;
            overflow-y: auto;
            background: var(--cms-surface);
            border: 1px solid var(--cms-border);
            border-radius: var(--cms-radius-sm, 4px);
            box-shadow: var(--cms-shadow-md, 0 4px 12px rgba(0,0,0,.10));
            padding: 4px 0;
        }
        .cms-token-input__option {
            display: block;
            width: 100%;
            text-align: left;
            padding: 6px 12px;
            background: none;
            border: none;
            color: var(--cms-text);
            font-size: .85rem;
            font-family: inherit;
            cursor: pointer;
        }
        .cms-token-input__option:hover,
        .cms-token-input__option:focus {
            background: var(--cms-hover-bg, rgba(0, 0, 0, .04));
            outline: none;
        }
    `],
})
export class CmsDtmplTokenInputComponent {
    /** Two-way bound input text. */
    readonly value = model<string>('');

    /** List of DTMPL tokens shown in the overlay (each fully-formed, including braces). */
    readonly availableTokens = input.required<readonly string[]>();

    /** Placeholder shown when the input is empty. */
    readonly placeholder = input<string>('');

    /** DOM id to expose for label-for binding. */
    readonly inputId = input<string>('');

    @ViewChild('inputEl') protected readonly inputEl?: ElementRef<HTMLInputElement>;

    protected readonly showOverlay = signal<boolean>(false);

    /**
     * Index of the most recent `{` typed while the overlay is open,
     * tracked from the start of the input value. The substring from
     * here to the cursor drives `filterText`.
     */
    private readonly triggerIndex = signal<number | null>(null);

    private readonly filterText = signal<string>('');

    protected readonly filteredTokens = computed(() => {
        const tokens = this.availableTokens();
        const filter = this.filterText().toLowerCase();
        if ('' === filter) {
            return tokens;
        }

        return tokens.filter((t) => t.toLowerCase().includes(filter));
    });

    /** CDK overlay anchored below the input, falls back to above when crowded. */
    protected readonly overlayPositions: ConnectedPosition[] = [
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 2 },
        { originX: 'start', originY: 'top',    overlayX: 'start', overlayY: 'bottom', offsetY: -2 },
    ];

    /**
     * Track cursor + value to decide whether the overlay should be
     * open and what filter text applies. Runs on every keystroke and
     * cursor move.
     */
    protected onModelChange(next: string): void {
        this.value.set(next);
        this.recomputeOverlay();
    }

    protected onKeydown(event: KeyboardEvent): void {
        if ('Escape' === event.key && this.showOverlay()) {
            event.preventDefault();
            this.closeOverlay();
            return;
        }
        if ('Tab' === event.key && this.showOverlay()) {
            this.closeOverlay();
            return;
        }
        // Defer the recompute until after the keypress mutates the
        // input value -- queueMicrotask runs after the synchronous
        // input event but before the next paint.
        queueMicrotask(() => this.recomputeOverlay());
    }

    protected onBlur(): void {
        // Blur after a click on an option fires before the click
        // handler resolves; the option's mousedown handler calls
        // preventDefault so blur does not fire in that path. For
        // genuine focus loss, close the overlay.
        this.closeOverlay();
    }

    protected selectToken(token: string): void {
        const input = this.inputEl?.nativeElement;
        const start = this.triggerIndex();
        if (!input || null === start) {
            this.closeOverlay();
            return;
        }
        const current = this.value();
        const cursor = input.selectionStart ?? current.length;
        const before = current.slice(0, start);
        const after = current.slice(cursor);
        const next = before + token + after;
        this.value.set(next);
        this.closeOverlay();
        queueMicrotask(() => {
            const focusable = this.inputEl?.nativeElement;
            if (focusable) {
                focusable.focus();
                const caret = before.length + token.length;
                focusable.setSelectionRange(caret, caret);
            }
        });
    }

    protected closeOverlay(): void {
        this.showOverlay.set(false);
        this.triggerIndex.set(null);
        this.filterText.set('');
    }

    /**
     * Inspect the current input value + cursor position and decide
     * whether the overlay should be open (and with what filter text).
     * Centralised so both `onModelChange` and the keydown microtask
     * use the same logic.
     */
    private recomputeOverlay(): void {
        const input = this.inputEl?.nativeElement;
        if (!input) {
            return;
        }
        const current = this.value();
        const cursor = input.selectionStart ?? current.length;
        const lastOpen = this.findOpenBraceBeforeCursor(current, cursor);
        if (null === lastOpen) {
            this.closeOverlay();
            return;
        }
        // Closing `}` between the `{` and the cursor means the token
        // is already complete -- no point auto-completing.
        const between = current.slice(lastOpen + 1, cursor);
        if (between.includes('}')) {
            this.closeOverlay();
            return;
        }
        this.triggerIndex.set(lastOpen);
        this.filterText.set(between);
        this.showOverlay.set(true);
    }

    /**
     * Walk backwards from the cursor to find the most recent `{` that
     * is not already followed by a closing `}` before the cursor. A
     * literal `{{` (DTMPL escape) does not trigger the overlay.
     */
    private findOpenBraceBeforeCursor(value: string, cursor: number): number | null {
        for (let i = cursor - 1; i >= 0; --i) {
            const ch = value[i];
            if ('}' === ch) {
                return null;
            }
            if ('{' === ch) {
                // Escape sequence `{{` -- skip both characters.
                if ('{' === value[i - 1]) {
                    return null;
                }
                return i;
            }
        }

        return null;
    }
}
