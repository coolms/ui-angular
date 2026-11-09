import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    ElementRef,
    inject,
    InjectionToken,
    Injector,
    input,
    type OnInit,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { from, isObservable, type Subscription } from 'rxjs';
import { StateComponent } from '../state/state.component';
import {
    FilesPickerDenied,
    FilesPickerFailure,
    type FilesPickerChoice,
    type FilesPickerEntry,
    type FilesPickerOptions,
    type FilesPickerTranslate,
} from './cms-files-picker.types';

type Listing =
    | { readonly status: 'loading' }
    | { readonly status: 'error'; readonly words: string }
    | { readonly status: 'denied' }
    | { readonly status: 'ready'; readonly entries: readonly FilesPickerEntry[]; readonly next: string | null; readonly paging: boolean;
        /** A later page failed: the rows and the cursor stay, and the failure is shown at the foot with Retry. */
        readonly pageFailed?: string | null };

/** How near the end of the list, in pixels, the following page is asked for. */
const PAGE_AHEAD_PX = 48;

let nextPickerId = 0;

/** The id the dialog that opens the picker is labelled by: given to the picker's title. */
export const FILES_PICKER_TITLE_ID = new InjectionToken<string>('FILES_PICKER_TITLE_ID');

const keyOf = (space: string, id: string): string => space + '\n' + id;

/** The English words, with each `{name}` filled from the values. */
const english: FilesPickerTranslate = (_key, fallback, params) =>
    fallback.replace(/\{(\w+)\}/g, (whole, name: string) => (params && name in params ? String(params[name]) : whole));

/** A decimal size, as a mailbox limit of 25,000,000 bytes is "25 MB". */
export function formatFilesPickerSize(bytes: number, locale?: string): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = Math.max(0, bytes);
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit++;
    }
    const digits = unit === 0 || value >= 10 ? 0 : 1;
    const text = new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);

    return text + ' ' + units[unit];
}

/**
 * Choosing files a person already has, in their spaces (contract component `file-picker`). The kit knows no API: the
 * host lists folders page by page and is given the chosen entries. The selection holds across folders and spaces; a
 * budget, when given, is counted here, so a file that would go over it is disabled with that reason. Up and Down move,
 * Enter opens a folder, Space ticks a file, Backspace goes up a folder, and Escape cancels.
 *
 * Opened by `CmsFilesPickerService`, which gives it the options and a CDK dialog (role, aria-modal, focus held inside
 * and returned on closing). It can also be placed with the `options` input, and then reports through `closed`.
 */
@Component({
    selector: 'cms-files-picker',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [StateComponent],
    host: {
        'class': 'cms-files-picker',
        '[attr.aria-labelledby]': 'titleId',
        '(keydown)': 'onKeydown($event)',
    },
    template: `
        <header class="cms-fp__head">
            <h2 class="cms-fp__title" [id]="titleId">{{ title() }}</h2>
            <button type="button" class="cms-fp__icon-btn" data-test="fp-close" [attr.aria-label]="t('close', 'Close')"
                    (click)="cancel()"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
        </header>

        <div class="cms-fp__bar">
            @if (opts().spaces.length > 1) {
                <label class="cms-fp__space">
                    <span class="cms-fp__space-label">{{ t('space', 'Space') }}</span>
                    <select class="form-select form-select-sm" data-test="fp-space" [value]="space()" [style.min-width]="spaceMinWidth()"
                            (change)="switchSpace($any($event.target).value)">
                        @for (s of opts().spaces; track s.id) {
                            <option [value]="s.id" [selected]="s.id === space()">{{ s.name }}</option>
                        }
                    </select>
                </label>
            }
            <nav class="cms-fp__crumbs" [attr.aria-label]="t('path', 'Folder')">
                <button type="button" class="cms-fp__icon-btn" data-test="fp-up" [disabled]="segments().length === 0"
                        [attr.aria-label]="t('up', 'Up a folder')" (click)="up()">
                    <i class="bi bi-arrow-up" aria-hidden="true"></i>
                </button>
                <ol class="cms-fp__crumb-list">
                    <li><button type="button" class="cms-fp__crumb" data-test="fp-crumb"
                                [attr.aria-current]="segments().length === 0 ? 'location' : null"
                                (click)="goTo(0)">{{ spaceName() }}</button></li>
                    @for (seg of segments(); track $index) {
                        <li><button type="button" class="cms-fp__crumb" data-test="fp-crumb"
                                    [attr.aria-current]="$index === segments().length - 1 ? 'location' : null"
                                    (click)="goTo($index + 1)">{{ seg.label }}</button></li>
                    }
                </ol>
            </nav>
            @if (count() > 0) {
                <div class="cms-fp__chosen">
                    <button type="button" class="cms-fp__chip" data-test="fp-chip" [attr.aria-expanded]="showChosen()"
                            [attr.aria-controls]="chosenId" (click)="showChosen.set(!showChosen())">
                        {{ t('selected', '{count} selected', { count: count() }) }}
                        <i class="bi" [class.bi-chevron-down]="!showChosen()" [class.bi-chevron-up]="showChosen()" aria-hidden="true"></i>
                    </button>
                    @if (showChosen()) {
                        <div class="cms-fp__chosen-list" [id]="chosenId" data-test="fp-chosen">
                            <ul>
                                @for (c of chosenList(); track keyOf(c.space, c.id)) {
                                    <li>
                                        <span class="cms-fp__chosen-name">{{ c.label || c.name }}</span>
                                        <span class="cms-fp__size">{{ size(c.size ?? 0) }}</span>
                                        <button type="button" class="cms-fp__icon-btn" data-test="fp-unchoose"
                                                [attr.aria-label]="t('remove', 'Remove {name}', { name: c.label || c.name })"
                                                (click)="unchoose(c)"><i class="bi bi-x" aria-hidden="true"></i></button>
                                    </li>
                                }
                            </ul>
                            <button type="button" class="cms-btn cms-btn-sm" data-test="fp-clear" (click)="clear()">
                                {{ t('clear', 'Clear') }}</button>
                        </div>
                    }
                </div>
            }
        </div>

        <div class="cms-fp__body">
            @switch (listing().status) {
                @case ('loading') {
                    <cms-state kind="loading" placement="block" [title]="t('loading', 'Reading the folder')" />
                }
                @case ('error') {
                    <cms-state kind="error" placement="block" [title]="errorWords()"
                               [action]="{ label: t('retry', 'Retry'), run: retry }" />
                }
                @case ('denied') {
                    <cms-state kind="denied" placement="block" [title]="t('denied', 'You may not open this folder')" />
                }
                @default {
                    @if (rows().length === 0) {
                        <cms-state kind="empty" placement="block" [title]="t('empty', 'This folder is empty')" />
                    } @else {
                        <div #listbox class="cms-fp__list" role="listbox" tabindex="0" aria-multiselectable="true"
                             data-test="fp-list" [attr.aria-label]="t('files', 'Files')"
                             [attr.aria-activedescendant]="optionId(active())" (scroll)="onScroll()">
                            @for (row of rows(); track row.entry.id; let i = $index) {
                                <div class="cms-fp__row" role="option" data-test="fp-row" [id]="optionId(i)"
                                     [attr.data-kind]="row.entry.kind" [class.is-active]="i === active()"
                                     [attr.aria-selected]="row.entry.kind === 'file' ? row.chosen : null"
                                     [attr.aria-disabled]="row.reason ? true : null"
                                     (click)="activate(i)">
                                    @if (row.entry.kind === 'file') {
                                        <span class="cms-fp__tick" aria-hidden="true">
                                            <i class="bi" [class.bi-check-square-fill]="row.chosen" [class.bi-square]="!row.chosen"></i>
                                        </span>
                                    }
                                    <i class="bi cms-fp__kind" aria-hidden="true"
                                       [class.bi-folder-fill]="row.entry.kind === 'folder'"
                                       [class.bi-file-earmark]="row.entry.kind === 'file'"></i>
                                    <span class="cms-fp__name">
                                        <span class="cms-fp__name-text">{{ row.entry.label || row.entry.name }}</span>
                                        @if (row.reason) {
                                            <span class="cms-fp__reason" data-test="fp-reason">{{ row.reason }}</span>
                                        }
                                    </span>
                                    @if (row.entry.kind === 'file') {
                                        <span class="cms-fp__size">{{ size(row.entry.size ?? 0) }}</span>
                                    } @else {
                                        <i class="bi bi-chevron-right cms-fp__open" aria-hidden="true"></i>
                                    }
                                </div>
                            }
                            @if (paging()) {
                                <div class="cms-fp__paging" data-test="fp-paging">
                                    <cms-state kind="loading" placement="inline" [title]="t('paging', 'Reading more')" />
                                </div>
                            } @else if (pageFailed(); as words) {
                                <div class="cms-fp__paging" data-test="fp-page-failed">
                                    <cms-state kind="error" placement="inline" [title]="words"
                                               [action]="{ label: t('retry', 'Retry'), run: retryPage }" />
                                </div>
                            }
                        </div>
                    }
                }
            }
        </div>

        <footer class="cms-fp__foot">
            <div class="cms-fp__sums">
                <span data-test="fp-total">{{ t('total', '{count} files, {size}', { count: count(), size: size(totalBytes()) }) }}</span>
                @if (left() !== null) {
                    @if (overBudget()) {
                        <span class="cms-fp__over" data-test="fp-left">{{ t('overBudget', 'Over the message size limit') }}</span>
                    } @else {
                        <span data-test="fp-left">{{ t('left', '{left} of {limit} left after these',
                            { left: size(left() ?? 0), limit: size(opts().budget?.limitBytes ?? 0) }) }}</span>
                    }
                }
            </div>
            <div class="cms-fp__actions">
                <button type="button" class="cms-btn" data-test="fp-cancel" (click)="cancel()">{{ t('cancel', 'Cancel') }}</button>
                <button type="button" class="cms-btn cms-btn-primary" data-test="fp-confirm" [disabled]="!canConfirm()"
                        (click)="confirm()">{{ confirmText() }}</button>
            </div>
        </footer>
    `,
    styles: [`
        :host {
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            width: min(720px, 95vw);
            height: min(36rem, 90vh);
            background: var(--cms-surface);
            color: var(--cms-text);
            border: 1px solid var(--cms-border);
            border-radius: var(--cms-radius);
            overflow: hidden;
        }
        .cms-fp__head {
            display: flex;
            align-items: center;
            gap: var(--cms-space-2, 8px);
            padding: var(--cms-space-3, 12px) var(--cms-space-4, 16px);
            border-bottom: 1px solid var(--cms-border-light);
        }
        .cms-fp__title { flex: 1; margin: 0; font-size: 1rem; font-weight: 600; }
        .cms-fp__icon-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 2rem;
            min-height: 2rem;
            padding: 0;
            border: 0;
            border-radius: var(--cms-radius-sm);
            background: none;
            color: var(--cms-text-secondary);
        }
        .cms-fp__icon-btn:hover:not(:disabled) { background: var(--cms-bg-hover); color: var(--cms-text); }
        .cms-fp__icon-btn:disabled { opacity: .4; }
        .cms-fp__bar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: var(--cms-space-2, 8px);
            padding: var(--cms-space-2, 8px) var(--cms-space-4, 16px);
            border-bottom: 1px solid var(--cms-border-light);
        }
        .cms-fp__space { display: flex; align-items: center; gap: var(--cms-space-2, 8px); margin: 0; }
        /* As wide as its longest space name and the arrow, not Bootstrap's full width shrunk by the bar. */
        .cms-fp__space select { width: auto; flex: 0 0 auto; max-width: 18rem; padding-right: 2.25rem; }
        .cms-fp__space-label { font-size: var(--cms-font-size-meta, .8125rem); color: var(--cms-text-muted); }
        .cms-fp__crumbs { display: flex; align-items: center; gap: var(--cms-space-1, 4px); flex: 1; min-width: 0; }
        .cms-fp__crumb-list { display: flex; flex-wrap: wrap; align-items: center; margin: 0; padding: 0; list-style: none; min-width: 0; }
        .cms-fp__crumb-list li + li::before { content: '/'; margin: 0 2px; color: var(--cms-text-muted); }
        .cms-fp__crumb {
            border: 0;
            background: none;
            padding: 2px 4px;
            border-radius: var(--cms-radius-sm);
            color: var(--cms-accent-text);
            max-width: 16rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .cms-fp__crumb[aria-current] { color: var(--cms-text); font-weight: 600; }
        .cms-fp__crumb:hover { background: var(--cms-bg-hover); }
        .cms-fp__chosen { position: relative; }
        .cms-fp__chip {
            display: inline-flex;
            align-items: center;
            gap: var(--cms-space-1, 4px);
            padding: 2px 10px;
            border: 1px solid var(--cms-selected);
            border-radius: 999px;
            background: var(--cms-selected-light);
            color: var(--cms-selected-text);
            font-size: var(--cms-font-size-meta, .8125rem);
        }
        .cms-fp__chosen-list {
            position: absolute;
            right: 0;
            top: calc(100% + 4px);
            z-index: 2;
            width: min(22rem, 85vw);
            max-height: 16rem;
            overflow-y: auto;
            padding: var(--cms-space-2, 8px);
            background: var(--cms-surface);
            border: 1px solid var(--cms-border);
            border-radius: var(--cms-radius);
            box-shadow: var(--cms-shadow-md);
        }
        .cms-fp__chosen-list ul { margin: 0 0 var(--cms-space-2, 8px); padding: 0; list-style: none; }
        .cms-fp__chosen-list li { display: flex; align-items: center; gap: var(--cms-space-2, 8px); padding: 2px 0; }
        .cms-fp__chosen-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cms-fp__body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .cms-fp__body > cms-state { margin: auto 0; }
        .cms-fp__list { flex: 1; min-height: 0; overflow-y: auto; outline: none; padding: var(--cms-space-1, 4px) 0; }
        .cms-fp__list:focus-visible { box-shadow: inset 0 0 0 2px var(--cms-focus-ring); }
        .cms-fp__row {
            display: flex;
            align-items: center;
            gap: var(--cms-space-2, 8px);
            min-height: 2.25rem;
            padding: 4px var(--cms-space-4, 16px);
            cursor: pointer;
        }
        .cms-fp__row:hover { background: var(--cms-surface-hover); }
        .cms-fp__row.is-active { background: var(--cms-bg-hover); box-shadow: inset 3px 0 0 var(--cms-accent); }
        .cms-fp__row[aria-selected='true'] { background: var(--cms-selected-light); }
        .cms-fp__row[aria-disabled='true'] { cursor: not-allowed; }
        .cms-fp__row[aria-disabled='true'] .cms-fp__name-text,
        .cms-fp__row[aria-disabled='true'] .cms-fp__tick { opacity: .5; }
        .cms-fp__tick { color: var(--cms-accent-text); }
        .cms-fp__kind { color: var(--cms-text-muted); }
        .cms-fp__row[data-kind='folder'] .cms-fp__kind { color: var(--cms-warning-text); }
        .cms-fp__name { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .cms-fp__name-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cms-fp__reason { font-size: var(--cms-font-size-meta, .8125rem); color: var(--cms-text-muted); }
        .cms-fp__size { font-size: var(--cms-font-size-meta, .8125rem); color: var(--cms-text-muted); white-space: nowrap; }
        .cms-fp__open { color: var(--cms-text-muted); }
        .cms-fp__paging { padding: var(--cms-space-2, 8px) var(--cms-space-4, 16px); }
        .cms-fp__foot {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: var(--cms-space-2, 8px) var(--cms-space-4, 16px);
            padding: var(--cms-space-3, 12px) var(--cms-space-4, 16px);
            border-top: 1px solid var(--cms-border-light);
            background: var(--cms-surface);
        }
        .cms-fp__sums {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 10rem;
            font-size: var(--cms-font-size-meta, .8125rem);
            color: var(--cms-text-secondary);
        }
        .cms-fp__over { color: var(--cms-danger-text); font-weight: 600; }
        .cms-fp__actions { display: flex; gap: var(--cms-space-2, 8px); margin-left: auto; }

        /* Below breakpoint-md: the whole screen, the footer at the foot while the list scrolls, every target at least
           touch-target-min. */
        @media (max-width: 767.98px) {
            :host {
                position: fixed;
                inset: 0;
                width: 100vw;
                height: 100dvh;
                border: 0;
                border-radius: 0;
            }
            .cms-fp__icon-btn,
            .cms-fp__crumb,
            .cms-fp__chip,
            .cms-fp__foot .cms-btn,
            .cms-fp__chosen-list .cms-btn {
                min-width: var(--cms-touch-target-min, 44px);
                min-height: var(--cms-touch-target-min, 44px);
            }
            .cms-fp__row { min-height: var(--cms-touch-target-min, 44px); }
            .cms-fp__space { flex: 1 1 100%; }
            .cms-fp__space select { min-height: var(--cms-touch-target-min, 44px); flex: 1; }
            .cms-fp__foot { position: sticky; bottom: 0; padding-bottom: max(var(--cms-space-3, 12px), env(safe-area-inset-bottom)); }
            .cms-fp__actions { flex: 1 1 100%; }
            .cms-fp__actions .cms-btn { flex: 1; }
        }
    `],
})
export class CmsFilesPickerComponent implements OnInit {
    /** The options, when the picker is placed directly rather than opened by the service. */
    readonly options = input<FilesPickerOptions | null>(null);
    /** The chosen entries on confirm, or undefined on cancel; the service's dialog closes with the same. */
    readonly closed = output<readonly FilesPickerChoice[] | undefined>();

    private readonly dialogData = inject<FilesPickerOptions | null>(DIALOG_DATA, { optional: true });
    private readonly dialogRef = inject<DialogRef<readonly FilesPickerChoice[] | undefined>>(DialogRef, { optional: true });
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly injector = inject(Injector);

    private readonly listbox = viewChild<ElementRef<HTMLElement>>('listbox');

    readonly titleId = inject(FILES_PICKER_TITLE_ID, { optional: true }) ?? 'cms-fp-title-' + ++nextPickerId;
    readonly chosenId = this.titleId + '-chosen';
    readonly keyOf = keyOf;

    readonly opts = computed<FilesPickerOptions>(() => this.options() ?? this.dialogData ?? { spaces: [], list: () => Promise.resolve({ entries: [] }) });

    readonly space = signal('');
    /** The folders from the space's top down to the one shown. */
    readonly segments = signal<ReadonlyArray<{ readonly name: string; readonly label: string }>>([]);
    readonly listing = signal<Listing>({ status: 'loading' });
    readonly active = signal(0);
    readonly showChosen = signal(false);
    private readonly chosen = signal<ReadonlyMap<string, FilesPickerChoice>>(new Map());

    private read: Subscription | null = null;
    private readCount = 0;

    readonly title = computed(() => this.opts().title ?? this.t('title', 'Choose files'));
    readonly spaceName = computed(() => this.opts().spaces.find((s) => s.id === this.space())?.name ?? '');
    /** Room for the longest space name, the select's padding and its arrow, so no name runs under the arrow. */
    readonly spaceMinWidth = computed(() => {
        const longest = Math.max(0, ...this.opts().spaces.map((s) => s.name.length));

        return 'calc(' + longest + 'ch + 3.25rem)';
    });
    readonly path = computed(() => this.segments().map((s) => s.name).join('/'));

    readonly chosenList = computed(() => [...this.chosen().values()]);
    readonly count = computed(() => this.chosen().size);
    readonly totalBytes = computed(() => this.chosenList().reduce((sum, c) => sum + (c.size ?? 0), 0));

    /** What is left of the budget after the selection, or null without a budget. */
    readonly left = computed<number | null>(() => {
        const budget = this.opts().budget;
        if (!budget) return null;
        const spent = this.chosenList().reduce((sum, c) => sum + this.cost(c), 0);

        return budget.limitBytes - budget.usedBytes - spent;
    });
    readonly overBudget = computed(() => (this.left() ?? 0) < 0);
    readonly canConfirm = computed(() => this.count() > 0 && !this.overBudget());

    readonly paging = computed(() => {
        const l = this.listing();

        return l.status === 'ready' && l.paging;
    });

    readonly errorWords = computed(() => {
        const l = this.listing();

        return l.status === 'error' ? l.words : '';
    });

    /** The rows shown: each entry, whether it is chosen, and why it cannot be (the host's reason first, then the budget's). */
    readonly rows = computed(() => {
        const l = this.listing();
        if (l.status !== 'ready') return [];
        const chosen = this.chosen();
        const left = this.left();
        const space = this.space();

        return l.entries.map((entry) => {
            const isChosen = entry.kind === 'file' && chosen.has(keyOf(space, entry.id));
            let reason: string | null = null;
            if (entry.kind === 'file' && !isChosen) {
                reason = this.opts().disabledReason?.(entry) || null;
                if (!reason && left !== null && this.cost(entry) > left) {
                    reason = this.t('overBudget', 'Over the message size limit');
                }
            }

            return { entry, chosen: isChosen, reason };
        });
    });

    readonly confirmText = computed(() => {
        const n = this.count();
        const own = this.opts().confirmLabel;
        if (own) return own(n);

        return n === 0
            ? this.t('confirm.none', 'Choose files')
            : this.t(n === 1 ? 'confirm.one' : 'confirm', n === 1 ? 'Choose {count} file' : 'Choose {count} files', { count: n });
    });

    readonly retry = (): void => this.load();
    readonly retryPage = (): void => this.loadMore();

    /** The words of a later page that failed, shown at the foot of the list; null when none did. */
    readonly pageFailed = computed(() => {
        const l = this.listing();

        return l.status === 'ready' ? l.pageFailed ?? null : null;
    });

    constructor() {
        inject(DestroyRef).onDestroy(() => this.read?.unsubscribe());
    }

    ngOnInit(): void {
        this.space.set(this.opts().spaces[0]?.id ?? '');
        this.load();
    }

    t(key: string, fallback: string, params?: Readonly<Record<string, string | number>>): string {
        return (this.opts().translate ?? english)('filesPicker.' + key, fallback, params);
    }

    size(bytes: number): string {
        return (this.opts().formatSize ?? ((b: number) => formatFilesPickerSize(b, this.host.nativeElement.ownerDocument?.documentElement?.lang || undefined)))(bytes);
    }

    optionId(i: number): string | null {
        return this.rows().length > 0 ? this.titleId + '-opt-' + i : null;
    }

    switchSpace(id: string): void {
        if (id === this.space()) return;
        this.space.set(id);
        this.segments.set([]);
        this.load();
    }

    up(): void {
        const segs = this.segments();
        if (segs.length === 0) return;
        this.segments.set(segs.slice(0, -1));
        this.load();
    }

    goTo(depth: number): void {
        if (depth === this.segments().length) return;
        this.segments.set(this.segments().slice(0, depth));
        this.load();
    }

    open(entry: FilesPickerEntry): void {
        this.segments.set([...this.segments(), { name: entry.name, label: entry.label || entry.name }]);
        this.load();
    }

    /** A click or Enter on a row: a folder opens, a file ticks. */
    activate(i: number): void {
        const row = this.rows()[i];
        if (!row) return;
        this.active.set(i);
        if (row.entry.kind === 'folder') {
            this.open(row.entry);
        } else {
            this.toggle(i);
        }
    }

    toggle(i: number): void {
        const row = this.rows()[i];
        if (!row || row.entry.kind !== 'file') return;
        const key = keyOf(this.space(), row.entry.id);
        const next = new Map(this.chosen());
        if (next.has(key)) {
            next.delete(key);
        } else {
            if (row.reason) return;
            next.set(key, { ...row.entry, space: this.space(), path: this.path() });
        }
        this.chosen.set(next);
    }

    unchoose(c: FilesPickerChoice): void {
        const next = new Map(this.chosen());
        next.delete(keyOf(c.space, c.id));
        this.chosen.set(next);
        if (next.size === 0) this.showChosen.set(false);
    }

    clear(): void {
        this.chosen.set(new Map());
        this.showChosen.set(false);
    }

    cancel(): void {
        this.opts().onCancel?.();
        this.closed.emit(undefined);
        this.dialogRef?.close(undefined);
    }

    confirm(): void {
        if (!this.canConfirm()) return;
        const chosen = this.chosenList();
        this.opts().onConfirm?.(chosen);
        this.closed.emit(chosen);
        this.dialogRef?.close(chosen);
    }

    onKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.cancel();

            return;
        }
        const target = event.target as HTMLElement | null;
        // Only from the list (the listbox, or a row in it): a focused button, chip or field keeps its own Backspace.
        const inList = target?.closest('[role="listbox"]') != null;
        if (event.key === 'Backspace' && inList) {
            event.preventDefault();
            this.up();

            return;
        }
        if (!inList) return;
        const n = this.rows().length;
        if (n === 0) return;
        const move = (to: number): void => {
            this.active.set(Math.max(0, Math.min(n - 1, to)));
            this.revealActive();
            if (this.active() >= n - 3) this.loadMore();
        };
        switch (event.key) {
            case 'ArrowDown': event.preventDefault(); move(this.active() + 1); break;
            case 'ArrowUp': event.preventDefault(); move(this.active() - 1); break;
            case 'Home': event.preventDefault(); move(0); break;
            case 'End': event.preventDefault(); move(n - 1); break;
            case 'Enter': {
                event.preventDefault();
                const row = this.rows()[this.active()];
                if (row?.entry.kind === 'folder') this.open(row.entry);
                break;
            }
            case ' ': event.preventDefault(); this.toggle(this.active()); break;
        }
    }

    onScroll(): void {
        const el = this.listbox()?.nativeElement;
        if (!el) return;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - PAGE_AHEAD_PX) this.loadMore();
    }

    /** The following page, kept below what is shown; asked once at a time. */
    loadMore(): void {
        const l = this.listing();
        if (l.status !== 'ready' || !l.next || l.paging) return;
        this.listing.set({ ...l, paging: true, pageFailed: null });
        const token = this.readCount;
        this.subscribe(l.next, (page) => {
            if (token !== this.readCount) return;
            const now = this.listing();
            const shown = now.status === 'ready' ? now.entries : l.entries;
            this.listing.set({ status: 'ready', entries: [...shown, ...page.entries], next: page.next ?? null, paging: false });
        }, (err) => {
            if (token !== this.readCount) return;
            // What is shown stays, with the same cursor: the next scroll near the end, or Retry, asks again.
            const now = this.listing();
            const failure = this.failed(err);
            const words = failure.status === 'error' ? failure.words
                : this.t('error', 'The folder could not be read');
            this.listing.set({ ...(now.status === 'ready' ? now : l), paging: false, pageFailed: words });
        });
    }

    private load(): void {
        const token = ++this.readCount;
        this.active.set(0);
        this.listing.set({ status: 'loading' });
        this.subscribe(undefined, (page) => {
            if (token !== this.readCount) return;
            this.listing.set({ status: 'ready', entries: page.entries, next: page.next ?? null, paging: false });
            this.focusListSoon();
        }, (err) => {
            if (token !== this.readCount) return;
            this.listing.set(this.failed(err));
        });
    }

    private subscribe(cursor: string | undefined, ok: (page: { entries: readonly FilesPickerEntry[]; next?: string | null }) => void, fail: (err: unknown) => void): void {
        if (cursor === undefined) this.read?.unsubscribe();
        let answer: ReturnType<FilesPickerOptions['list']>;
        try {
            answer = this.opts().list(this.space(), this.path(), cursor);
        } catch (err) {
            fail(err);

            return;
        }
        const source = isObservable(answer) ? answer : from(answer);
        const sub = source.subscribe({ next: ok, error: fail });
        if (cursor === undefined) this.read = sub;
    }

    private failed(err: unknown): Listing {
        if (err instanceof FilesPickerDenied) return { status: 'denied' };
        if (err instanceof FilesPickerFailure && err.message) return { status: 'error', words: err.message };

        return { status: 'error', words: this.t('error', 'The folder could not be read') };
    }

    private cost(entry: FilesPickerEntry): number {
        const fn = this.opts().budget?.cost;

        return fn ? fn(entry) : (entry.size ?? 0);
    }

    private revealActive(): void {
        const id = this.optionId(this.active());
        const el = id ? this.host.nativeElement.ownerDocument.getElementById(id) : null;
        el?.scrollIntoView?.({ block: 'nearest' });
    }

    /** After a folder is read, the list takes focus when focus was in the picker, so the keys keep working. */
    private focusListSoon(): void {
        afterNextRender(() => {
            const doc = this.host.nativeElement.ownerDocument;
            const frame = this.host.nativeElement.closest('.cdk-dialog-container') ?? this.host.nativeElement;
            const inside = doc.activeElement === doc.body || frame.contains(doc.activeElement);
            const el = this.host.nativeElement.querySelector<HTMLElement>('[role="listbox"]');
            if (inside && el && doc.activeElement !== el && !(doc.activeElement instanceof HTMLSelectElement)) el.focus();
        }, { injector: this.injector });
    }
}
