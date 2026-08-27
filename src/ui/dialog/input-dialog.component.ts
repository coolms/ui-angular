import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    inject,
    signal,
    ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ModalComponent } from '../modal/modal.component';

/**
 * One option in the dialog's optional select.
 */
export interface InputDialogChoice {
    /** Value handed back in {@link InputDialogResult.choice}. */
    value: string;
    /** Option text. */
    label: string;
}

/**
 * What the dialog closes with. `choice` is null whenever the dialog was
 * opened without a select — {@link NativeDialogService.input} unwraps to
 * the bare string so its callers never see this shape.
 */
export interface InputDialogResult {
    value:  string;
    choice: string | null;
}

/**
 * Data passed in by {@link NativeDialogService.input} via CDK
 * `Dialog.open(..., { data })`. All fields pre-resolved.
 */
export interface InputDialogContentData {
    title:        string;
    label:        string;
    placeholder:  string;
    initialValue: string;
    confirmLabel: string;
    cancelLabel:  string;
    required:     boolean;
    /** Optional synchronous validator: returns error message string or null. */
    validator:    ((val: string) => string | null) | null;
    /**
     * Options for the select rendered ABOVE the text field. Empty means no
     * select at all, which is the `input()` case — the dialog then behaves
     * exactly as it did before the select existed.
     */
    choices:      InputDialogChoice[];
    selectLabel:  string;
    /** Pre-selected option value; ignored when `choices` is empty. */
    initialChoice: string | null;
    /** Render a textarea instead of a single-line field. */
    multiline:    boolean;
}

/**
 * A3 dialog convergence — the input dialog now renders the platform
 * `<app-modal>` chrome (CDK overlay, `cms-dialog` shape), a sibling of every
 * form dialog instead of the old bespoke native `<dialog>`.
 *
 * Opened by {@link NativeDialogService} through CDK `Dialog.open()`.
 * The X / backdrop / Esc close with `undefined`, which the service maps to
 * `null` (cancel). `NativeDialogService.input`'s public contract — resolves
 * the trimmed value or `null` — is unchanged.
 *
 * A caller may also pass `choices`, which adds a select above the text field
 * and makes the dialog answer "name it AND classify it" in one step. That is
 * one dialog rather than two chained ones (pick a kind, then name it), and it
 * beats the alternative of splitting the calling affordance into one button
 * per kind: the option list can then be built at runtime from whatever the
 * backend advertises, so a new kind needs no new button. The component always
 * closes with {@link InputDialogResult}; `input()` unwraps it so the no-select
 * callers keep their string.
 */
@Component({
    selector: 'app-input-dialog',
    standalone: true,
    imports: [FormsModule, ModalComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-modal [title]="data.title">
            @if (data.choices.length) {
                <label class="input-label" for="input-dialog-choice">
                    {{ data.selectLabel }}
                </label>
                <select id="input-dialog-choice"
                        class="cms-select"
                        [(ngModel)]="choice">
                    @for (opt of data.choices; track opt.value) {
                        <option [value]="opt.value">{{ opt.label }}</option>
                    }
                </select>
            }
            @if (data.label) {
                <label class="input-label" for="input-dialog-value">
                    {{ data.label }}
                </label>
            }
            <!-- A TEXTAREA when the value is genuinely multi-line, because an
                 <input> is single-line by definition: a caller asking for one
                 item per line got a field that silently joined them, and its
                 own placeholder rendered as one run-on word. Enter is NOT
                 bound here — in a paragraph it must insert a newline, not
                 submit the dialog. -->
            @if (data.multiline) {
                <textarea #inputEl
                          id="input-dialog-value"
                          rows="5"
                          class="cms-input"
                          [class.cms-input--invalid]="validationError()"
                          [placeholder]="data.placeholder"
                          [(ngModel)]="value"
                          (ngModelChange)="onValueChange($event)"></textarea>
            } @else {
                <input #inputEl
                       id="input-dialog-value"
                       type="text"
                       class="cms-input"
                       [class.cms-input--invalid]="validationError()"
                       [placeholder]="data.placeholder"
                       [(ngModel)]="value"
                       (ngModelChange)="onValueChange($event)"
                       (keydown.enter)="onEnter()" />
            }
            @if (validationError(); as err) {
                <div class="input-error">{{ err }}</div>
            }

            <div footer>
                <button type="button" class="cms-btn" (click)="cancel()">
                    {{ data.cancelLabel }}
                </button>
                <button type="button"
                        class="cms-btn cms-btn-primary"
                        [disabled]="(data.required && !value.trim()) || !!validationError()"
                        (click)="submit()">
                    {{ data.confirmLabel }}
                </button>
            </div>
        </app-modal>
    `,
    styles: [`
        .input-label        { display: block; font-size: .8rem; font-weight: 600; color: var(--cms-text); margin-bottom: 5px; }
        .input-label + .cms-select { margin-bottom: 12px; }
        .cms-input          { display: block; width: 100%; }
        .cms-select         { display: block; width: 100%; }
        .cms-input--invalid { border-color: var(--cms-danger) !important; }
        .input-error        { margin-top: 4px; font-size: .8rem; color: var(--cms-danger); }
    `],
})
export class InputDialogComponent implements AfterViewInit {
    readonly data = inject<InputDialogContentData>(DIALOG_DATA);
    private readonly dialogRef = inject<DialogRef<InputDialogResult | null>>(DialogRef);

    /** Either field — both support `focus()` and `select()`, which is all this needs. */
    @ViewChild('inputEl') private readonly inputEl?: ElementRef<HTMLInputElement | HTMLTextAreaElement>;

    value = this.data.initialValue;

    /**
     * Defaults to the FIRST option rather than empty: a select whose initial
     * state is "nothing" makes the confirm button lie about what it will do,
     * and every caller so far has a sensible primary choice.
     */
    choice = this.data.initialChoice ?? this.data.choices[0]?.value ?? null;

    readonly validationError = signal<string | null>(null);

    ngAfterViewInit(): void {
        // CDK auto-focuses the first tabbable (the modal X); override to the
        // input on the next tick + select its contents for quick replace.
        setTimeout(() => {
            const el = this.inputEl?.nativeElement;
            if (el) { el.focus(); el.select(); }
        }, 0);
    }

    onValueChange(val: string): void {
        const v = this.data.validator;
        this.validationError.set(v && val ? v(val) : null);
    }

    onEnter(): void {
        if (!this.data.required || this.value.trim()) {
            this.submit();
        }
    }

    submit(): void {
        const val = this.value;
        if (val) {
            const err = this.data.validator ? this.data.validator(val) : null;
            if (err) { this.validationError.set(err); return; } // don't close
        }
        const trimmed = val.trim();
        this.dialogRef.close(trimmed ? { value: trimmed, choice: this.choice } : null);
    }

    cancel(): void {
        this.dialogRef.close(null);
    }
}
