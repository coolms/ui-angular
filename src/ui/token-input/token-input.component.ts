import {
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    forwardRef,
    input,
    signal,
    ViewChild,
} from '@angular/core';

import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface TokenDef {
    readonly id:      string;
    readonly label:   string;
    readonly example: string;
}

@Component({
    selector: 'app-token-input',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    providers: [
        {
            provide:     NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => TokenInputComponent),
            multi:       true,
        },
    ],
    template: `
        <!-- Editable area -->
        <div class="token-input-wrapper form-control"
             [class.is-invalid]="isInvalid()"
             (click)="editorRef.nativeElement.focus()">

            <div #editor
                 class="token-editor"
                 contenteditable="true"
                 spellcheck="false"
                 [attr.data-placeholder]="placeholder()"
                 (input)="onInput()"
                 (keydown)="onKeydown($event)"
                 (paste)="onPaste($event)">
            </div>
        </div>

        <!-- Live preview -->
        @if (preview()) {
            <div class="form-text text-muted small mt-1">
                Preview: <code>{{ preview() }}</code>
            </div>
        }

        <!-- Available tokens -->
        <div class="d-flex flex-wrap gap-1 mt-2">
            @for (token of tokens(); track token.id) {
                <button type="button"
                        class="cms-btn token-chip-btn"
                        (click)="insertToken(token)">
                    {{ token.label }}
                </button>
            }
            @if (separators().length > 0) {
                <span class="text-muted mx-1" style="font-size:.8rem">|</span>
                @for (sep of separators(); track sep) {
                    <button type="button"
                            class="cms-btn token-chip-btn"
                            (click)="insertText(sep)">
                        {{ sep }}
                    </button>
                }
            }
        </div>
    `,
    styles: [`
        .token-input-wrapper {
            min-height: 38px; height: auto;
            display: flex; align-items: center;
            padding: 4px 8px; cursor: text;
        }
        .token-editor {
            flex: 1; outline: none; min-width: 40px;
            white-space: nowrap; overflow: hidden;
        }
        .token-editor:empty::before {
            content: attr(data-placeholder);
            color: var(--cms-text-muted);
        }
        /* Token chips rendered inside contenteditable */
        :host ::ng-deep .token-chip {
            display: inline-flex; align-items: center; gap: 2px;
            background: var(--cms-info-subtle); color: var(--cms-info-text);
            border-radius: var(--cms-radius-sm, 4px); padding: 1px 6px;
            font-size: .8rem; user-select: none;
            cursor: default; margin: 0 2px;
        }
        :host ::ng-deep .token-chip-remove {
            cursor: pointer; opacity: .6;
            background: none; border: none;
            padding: 0; font-size: .7rem; line-height: 1;
            color: var(--cms-info-text);
        }
        :host ::ng-deep .token-chip-remove:hover { opacity: 1; }
        .token-chip-btn {
            font-size: .75rem; padding: 1px 8px;
            border-radius: var(--cms-radius-sm, 4px);
        }
    `],
})
export class TokenInputComponent implements ControlValueAccessor {
    tokens      = input<TokenDef[]>([]);
    separators  = input<string[]>(['_', '-', '.']);
    placeholder = input<string>('Enter pattern…');
    isInvalid   = input<boolean>(false);

    @ViewChild('editor') editorRef!: ElementRef<HTMLDivElement>;

    private onChange: (v: string) => void = () => {};
    private onTouched: () => void         = () => {};

    // Preview — replaces {const:token} with example values
    previewValue = signal('');
    preview      = computed(() => {
        const val = this.previewValue();
        if (!val) return '';
        let result = val;
        for (const token of this.tokens()) {
            result = result.replaceAll(`{const:${token.id}}`, token.example);
        }
        return result !== val ? result : '';
    });

    writeValue(value: string): void {
        // Convert stored pattern string to HTML with chip spans
        setTimeout(() => {
            if (this.editorRef) {
                this.editorRef.nativeElement.innerHTML = this.stringToHtml(value ?? '');
            }
            this.previewValue.set(value ?? '');
        });
    }

    registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
    registerOnTouched(fn: () => void): void         { this.onTouched = fn; }

    onInput(): void {
        const value = this.htmlToString();
        this.previewValue.set(value);
        this.onChange(value);
        this.onTouched();
    }

    onKeydown(event: KeyboardEvent): void {
        // Backspace on chip — remove entire chip
        if (event.key === 'Backspace') {
            const sel = window.getSelection();
            if (sel?.anchorNode?.parentElement?.classList.contains('token-chip')) {
                event.preventDefault();
                sel.anchorNode.parentElement.remove();
                this.onInput();
            }
        }
        // Prevent Enter (newlines are invalid in filenames / patterns)
        if (event.key === 'Enter') {
            event.preventDefault();
        }
    }

    onPaste(event: ClipboardEvent): void {
        event.preventDefault();
        // Only allow plain text paste — strip any HTML
        const text = event.clipboardData?.getData('text/plain') ?? '';
        document.execCommand('insertText', false, text);
    }

    insertToken(token: TokenDef): void {
        const chip = this.createChip(token);
        this.insertAtCursor(chip);
        this.onInput();
    }

    insertText(text: string): void {
        document.execCommand('insertText', false, text);
        this.onInput();
    }

    // ── Serialization ────────────────────────────────────────────────────────

    /**
     * Convert HTML (with chip spans) to a pattern string using {const:token} syntax.
     */
    private htmlToString(): string {
        const el = this.editorRef?.nativeElement;
        if (!el) return '';
        let result = '';
        for (const child of Array.from(el.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE) {
                result += child.textContent ?? '';
            } else if (child instanceof HTMLElement) {
                const tokenId = child.dataset['tokenId'];
                if (tokenId) {
                    result += `{const:${tokenId}}`;
                } else {
                    result += child.textContent ?? '';
                }
            }
        }
        return result;
    }

    /**
     * Convert a pattern string {const:token} to HTML with chip spans.
     */
    private stringToHtml(value: string): string {
        const tokenMap = new Map(this.tokens().map(t => [t.id, t]));
        return value.replace(/\{const:([^}]+)\}/g, (match, id: string) => {
            const token = tokenMap.get(id);
            return token ? this.chipHtml(token) : match;
        });
    }

    private chipHtml(token: TokenDef): string {
        return `<span class="token-chip" contenteditable="false" data-token-id="${token.id}">`
             + `${token.label}`
             + `<button class="token-chip-remove" onclick="this.parentElement.remove()">×</button>`
             + `</span>`;
    }

    private createChip(token: TokenDef): HTMLElement {
        const span           = document.createElement('span');
        span.className       = 'token-chip';
        span.contentEditable = 'false';
        span.dataset['tokenId'] = token.id;
        span.innerHTML = `${token.label}<button class="token-chip-remove">×</button>`;
        span.querySelector('.token-chip-remove')?.addEventListener('click', () => {
            span.remove();
            this.onInput();
        });
        return span;
    }

    private insertAtCursor(node: HTMLElement): void {
        const sel = window.getSelection();
        if (sel?.rangeCount) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(node);
            range.setStartAfter(node);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        } else {
            this.editorRef.nativeElement.appendChild(node);
        }
        this.editorRef.nativeElement.focus();
    }
}
