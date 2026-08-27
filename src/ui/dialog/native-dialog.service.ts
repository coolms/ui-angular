import { inject, Injectable } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { InputDialogComponent }   from './input-dialog.component';
import type { InputDialogChoice, InputDialogResult } from './input-dialog.component';

export type { InputDialogChoice } from './input-dialog.component';

export interface ConfirmOptions {
    title?:        string;
    message:       string;
    confirmLabel?: string;
    cancelLabel?:  string;
    danger?:       boolean;
}

export interface InputOptions {
    title?:        string;
    label?:        string;
    placeholder?:  string;
    initialValue?: string;
    confirmLabel?: string;
    cancelLabel?:  string;
    required?:     boolean;
    /** Optional synchronous validator. Return error message or null. */
    validator?:    (val: string) => string | null;
    /**
     * Render a textarea rather than a single-line field.
     *
     * For a value that is genuinely multi-line — a list with one item per line,
     * a note, a block of options. Without it such a caller gets a field that
     * silently joins the lines, which is how a "one per line" prompt shipped
     * as an unusable single-line box.
     */
    multiline?:    boolean;
}

/**
 * {@link NativeDialogService.inputWithSelect} options — an {@link InputOptions}
 * plus the select that sits above the text field.
 */
export interface InputWithSelectOptions extends InputOptions {
    /**
     * The options to choose from. Pass a list built at runtime (from a
     * capability endpoint, say) rather than a literal, and the dialog keeps
     * up with the backend on its own.
     */
    choices:      InputDialogChoice[];
    selectLabel?: string;
    /** Pre-selected value; defaults to the first choice. */
    initialChoice?: string;
}

/** What {@link NativeDialogService.inputWithSelect} resolves with. */
export interface InputWithSelectResult {
    value:  string;
    choice: string;
}

@Injectable({ providedIn: 'root' })
export class NativeDialogService {
    private readonly dialog = inject(Dialog);

    /**
     * Show a confirmation dialog.
     * Resolves true if confirmed, false if cancelled or dismissed.
     *
     * A3 convergence: opened through CDK `Dialog` so it renders the
     * platform `<app-modal>` (`cms-dialog`) chrome — a sibling of every
     * form dialog — instead of the old bespoke native `<dialog>`. The
     * X / backdrop / Esc all close with `undefined`, which resolves false.
     */
    confirm(options: ConfirmOptions): Promise<boolean> {
        const ref = this.dialog.open<boolean>(ConfirmDialogComponent, {
            data: {
                title:        options.title        ?? 'Confirm',
                message:      options.message,
                confirmLabel: options.confirmLabel ?? 'Confirm',
                cancelLabel:  options.cancelLabel  ?? 'Cancel',
                danger:       options.danger       ?? false,
            },
            backdropClass: 'cdk-overlay-dark-backdrop',
        });
        return new Promise(resolve => {
            ref.closed.subscribe(result => resolve(result === true));
        });
    }

    /**
     * Show an input dialog.
     * Resolves the trimmed string value if confirmed, null if cancelled or dismissed.
     *
     * A3 convergence: opened through CDK `Dialog` so it renders the platform
     * `<app-modal>` chrome. The X / backdrop / Esc close with `undefined`,
     * mapped to `null`.
     */
    input(options: InputOptions): Promise<string | null> {
        return this.openInput(options, [], '', undefined).then(
            result => result?.value ?? null,
        );
    }

    /**
     * Input dialog with a select above the text field: resolves
     * `{ value, choice }` if confirmed, `null` if cancelled or dismissed.
     *
     * The point of collecting both here rather than splitting the caller's
     * affordance into one button per choice is that `choices` can be computed
     * — from a capability endpoint, a registry, whatever the backend
     * advertises — so a new option shows up without a frontend edit. Callers
     * with exactly one choice should still call {@link input}; a select with
     * one option is noise.
     */
    inputWithSelect(options: InputWithSelectOptions): Promise<InputWithSelectResult | null> {
        return this.openInput(
            options,
            options.choices,
            options.selectLabel ?? '',
            options.initialChoice,
        ).then(result => {
            // `choice` is only null when the dialog had no select, which this
            // method never does — narrowing rather than defaulting so a future
            // empty `choices` fails loudly at the call site instead of
            // silently reporting an option nobody picked.
            if (null === result || null === result.choice) {
                return null;
            }

            return { value: result.value, choice: result.choice };
        });
    }

    private openInput(
        options: InputOptions,
        choices: InputDialogChoice[],
        selectLabel: string,
        initialChoice: string | undefined,
    ): Promise<InputDialogResult | null> {
        const ref = this.dialog.open<InputDialogResult | null>(InputDialogComponent, {
            data: {
                title:        options.title        ?? 'Input',
                label:        options.label        ?? '',
                placeholder:  options.placeholder  ?? '',
                initialValue: options.initialValue ?? '',
                confirmLabel: options.confirmLabel ?? 'OK',
                cancelLabel:  options.cancelLabel  ?? 'Cancel',
                required:     options.required     ?? false,
                validator:    options.validator    ?? null,
                choices,
                selectLabel,
                initialChoice: initialChoice ?? null,
                multiline:    options.multiline    ?? false,
            },
            backdropClass: 'cdk-overlay-dark-backdrop',
        });
        return new Promise(resolve => {
            ref.closed.subscribe(result => resolve(result ?? null));
        });
    }
}
