import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { CmsSectionHeaderComponent } from '../cms-section-header.component';

/**
 * One pane of a settings screen: a header (title, owning module, help), the body in a left-aligned readable column,
 * and a footer with the setting's key on the left and Discard and Save on the right.
 *
 * Each pane saves on its own. Save and Discard stay disabled until the pane is dirty: with nothing changed there is
 * nothing to save or throw away, and a live Save on a clean pane invites a write that changes nothing. Whatever else
 * the pane can do (Reset to defaults, Test connection) is projected into `[paneActions]`, left of Discard.
 *
 * A danger pane (deleting the object) has no Save or Discard: its one action is projected, and the body says what
 * goes.
 */
@Component({
    selector: 'cms-settings-pane',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CmsSectionHeaderComponent],
    template: `
        <div class="cms-settings-pane__head">
            <cms-section-header [icon]="icon()" [title]="title()" [subtitle]="owner()" [flush]="true" />
            @if (help()) {
                <p class="cms-settings-pane__help">{{ help() }}</p>
            }
        </div>

        <div class="cms-settings-pane__body">
            <div class="cms-settings-pane__column">
                <ng-content />
            </div>
        </div>

        <div class="cms-settings-pane__foot">
            <div class="cms-settings-pane__meta">
                @if (settingKey()) {
                    <code>{{ settingKey() }}</code>
                }
                @if (meta()) {
                    <span>{{ meta() }}</span>
                }
            </div>
            <div class="cms-settings-pane__buttons">
                <ng-content select="[paneActions]" />
                @if (!danger()) {
                    <button type="button" class="cms-btn" [disabled]="!dirty() || saving()" (click)="discard.emit()">
                        Discard
                    </button>
                    <button type="button" class="cms-btn cms-btn-primary"
                            [disabled]="!dirty() || saving()" (click)="save.emit()">
                        {{ saving() ? 'Saving…' : saveLabel() }}
                    </button>
                }
            </div>
        </div>
    `,
    styles: [`
        :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }

        .cms-settings-pane__head { flex-shrink: 0; padding: 12px 20px; border-bottom: 1px solid var(--cms-border); }
        .cms-settings-pane__help { margin: 6px 0 0; font-size: .8125rem; color: var(--cms-text-muted); max-width: 720px; }

        .cms-settings-pane__body { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px; }
        /* Left-aligned and capped at a readable measure: a full-width input on a wide screen is as hard to read as
           a narrow centred column is to scan. */
        .cms-settings-pane__column { max-width: 720px; }

        .cms-settings-pane__foot {
            display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
            flex-shrink: 0; padding: 10px 20px; border-top: 1px solid var(--cms-border);
        }
        .cms-settings-pane__meta {
            display: flex; align-items: center; gap: 10px; min-width: 0;
            font-size: .75rem; color: var(--cms-text-muted);
        }
        .cms-settings-pane__meta code { word-break: break-all; color: var(--cms-text-muted); }
        .cms-settings-pane__buttons { display: flex; align-items: center; gap: 8px; margin-left: auto; }
    `],
})
export class CmsSettingsPaneComponent {
    readonly title = input.required<string>();
    readonly icon = input<string>('sliders');
    /** The module the setting belongs to. */
    readonly owner = input<string>('');
    readonly help = input<string>('');
    /** The setting's key, muted in the footer (e.g. `call.originate`). */
    readonly settingKey = input<string>('');
    /** A muted note beside the key (where the values are stored). */
    readonly meta = input<string>('');
    readonly dirty = input<boolean>(false);
    readonly saving = input<boolean>(false);
    readonly saveLabel = input<string>('Save');
    /** A destructive pane: no Save or Discard; its action is projected into `[paneActions]`. */
    readonly danger = input<boolean>(false);

    readonly save = output<void>();
    readonly discard = output<void>();
}
