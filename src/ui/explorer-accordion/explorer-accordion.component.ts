import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    EventEmitter,
    inject,
    input,
    OnInit,
    Output,
    signal,
    untracked,
} from '@angular/core';
import { UserPreferencesService } from '@coolms/core-angular';
import { SpaceDto } from './space-dto';

/**
 * Generic accordion shell for library "spaces" (Media, Document, …).
 *
 * Renders each {@link SpaceDto} as a collapsible section. One section
 * is "active" at a time; clicking a section header emits
 * `(spaceChange)` with the selected key. Expansion state is persisted
 * per-namespace via {@link UserPreferencesService} (key:
 * `accordion.{persistKey}.expanded` → `string[]`).
 *
 * Body content is projected via `<ng-content>`; the host page is
 * responsible for rendering the active space's subtree (e.g. the
 * existing CollectionsTree).
 *
 * Multi-expand is allowed (each section toggles independently) so
 * sibling subtrees can be open simultaneously — matches the file-manager
 * accordion pattern.
 */
@Component({
    selector: 'app-explorer-accordion',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="accordion-shell">
            @for (space of orderedSpaces(); track space.key) {
                <div class="accordion-section"
                     [class.active]="space.key === activeKey()">
                    <button type="button"
                            class="accordion-header"
                            [class.expanded]="isExpanded(space.key)"
                            [title]="space.rootPath"
                            (contextmenu)="onHeaderContextMenu(space, $event)"
                            (click)="onHeaderClick(space)">
                        <span class="accordion-caret">
                            {{ showsBody(space.key) ? '▾' : '▸' }}
                        </span>
                        <i class="bi bi-folder2 accordion-icon"></i>
                        <span class="accordion-label text-truncate">{{ space.label }}</span>
                        @if (space.badge) {
                            <span class="accordion-badge">{{ space.badge }}</span>
                        }
                        @if (!space.isWritable) {
                            <i class="bi bi-lock-fill accordion-readonly"
                               title="Read-only"></i>
                        }
                    </button>
                    @if (showsBody(space.key)) {
                        <div class="accordion-body">
                            <ng-content></ng-content>
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: [`
        :host { display: block; }
        .accordion-shell {
            display: flex; flex-direction: column;
        }
        .accordion-section + .accordion-section {
            border-top: 1px solid var(--cms-border);
        }
        .accordion-header {
            display: flex; align-items: center; gap: 6px;
            width: 100%; padding: 6px 8px;
            background: none; border: none;
            font-size: .8125rem; font-weight: 600;
            color: var(--cms-text-secondary);
            cursor: pointer; user-select: none;
            text-align: left; white-space: nowrap;
            transition: background .1s, color .1s;
            &:hover { background: var(--cms-border-light); color: var(--cms-text); }
        }
        .accordion-section.active > .accordion-header {
            color: var(--cms-text);
            background: var(--cms-accent-light);
            box-shadow: inset 2px 0 0 var(--cms-accent);
        }
        .accordion-caret {
            display: inline-block; width: 12px;
            font-size: .7rem; color: var(--cms-text-muted);
        }
        .accordion-icon { font-size: .8125rem; color: var(--cms-accent); }
        .accordion-label { flex: 1; min-width: 0; }
        .accordion-badge {
            font-size: .65rem; font-weight: 600;
            padding: 1px 6px; border-radius: 999px;
            background: var(--cms-accent); color: var(--cms-accent-fg, #1a1a1a);
            text-transform: uppercase; letter-spacing: .04em;
        }
        .accordion-readonly { font-size: .75rem; color: var(--cms-text-muted); }
        .accordion-body {
            display: flex; flex-direction: column;
            border-top: 1px solid var(--cms-border-light);
        }
    `],
})
export class ExplorerAccordionComponent implements OnInit {
    private readonly prefs = inject(UserPreferencesService);

    /** Namespace under `accordion.{persistKey}.expanded`. */
    readonly persistKey = input<string>('explorer');
    /** Spaces to render. Re-sorted by `priority` ascending. */
    readonly spaces     = input<readonly SpaceDto[]>([]);
    /** Currently active space key (drives body projection + highlight). */
    readonly activeKey  = input<string>('');

    /** Emits the new active space key. */
    @Output() readonly spaceChange = new EventEmitter<string>();

    /**
     * Right-click on a space header (#1679). The accordion is shared by
     * Documents / Articles / Media, and each has its own action vocabulary —
     * so it only reports the gesture and the space, and the consumer decides
     * what the menu contains. Consumers that ignore it keep the browser's
     * native menu, which is why the handler does NOT preventDefault here.
     */
    @Output() readonly spaceContextMenu = new EventEmitter<{ space: SpaceDto; event: MouseEvent }>();

    // Set of expanded section keys
    private readonly expandedKeys = signal<Set<string>>(new Set());

    readonly orderedSpaces = computed(() =>
        [...this.spaces()].sort((a, b) =>
            (a.priority - b.priority) || a.key.localeCompare(b.key)),
    );

    constructor() {
        // Keep the ACTIVE space expanded. The body only renders when a
        // section is both expanded and active (see the template), so an
        // active-but-collapsed section shows an empty pane -- no tree, no
        // hint that anything is wrong.
        //
        // This must be an effect, not a one-shot read in ngOnInit: the
        // active key arrives from an async spaces fetch, so at init it is
        // still '' and a read there silently does nothing. Same trap as
        // #1588 -- init-time reads of async-derived state see the
        // bootstrap value, and the failure is invisible.
        //
        // Only `activeKey` is tracked, so a user who deliberately collapses
        // the active section is not fought by this effect; it re-expands
        // only when the active space actually changes.
        effect(() => {
            const key = this.activeKey();
            if ('' === key) {
                return;
            }

            untracked(() => {
                if (!this.expandedKeys().has(key)) {
                    this.expandedKeys.update(set => new Set(set).add(key));
                }
            });
        });
    }

    ngOnInit(): void {
        const stored = this.prefs.getPageState<{ expanded?: string[] }>(`accordion.${this.persistKey()}`);
        // Restored expansion only. The active space is handled by the
        // effect above -- adding it here as well would read '' and mislead
        // the next reader into thinking init-time is when that happens.
        this.expandedKeys.set(new Set<string>(stored?.expanded ?? []));
    }

    protected isExpanded(key: string): boolean {
        return this.expandedKeys().has(key);
    }

    /**
     * Whether this section actually renders its body — and therefore what
     * the caret must show.
     *
     * There is a single `<ng-content>`, so only the ACTIVE section can ever
     * project anything. A section that is in the expanded set but not active
     * shows nothing, and drawing `▾` on it was the caret claiming content
     * that cannot exist. Deriving both the caret and the body from one
     * predicate makes them incapable of disagreeing.
     */
    protected showsBody(key: string): boolean {
        return this.isExpanded(key) && key === this.activeKey();
    }

    protected onHeaderContextMenu(space: SpaceDto, event: MouseEvent): void {
        this.spaceContextMenu.emit({ space, event });
    }

    protected onHeaderClick(space: SpaceDto): void {
        // Toggle expansion and make this the active space.
        this.expandedKeys.update(set => {
            const next = new Set(set);
            if (next.has(space.key)) {
                next.delete(space.key);
            } else {
                next.add(space.key);
            }
            this.persistExpansion(next);
            return next;
        });
        if (space.key !== this.activeKey()) {
            this.spaceChange.emit(space.key);
        }
    }

    private persistExpansion(set: ReadonlySet<string>): void {
        this.prefs.setPageState(`accordion.${this.persistKey()}`, {
            expanded: Array.from(set),
        });
    }
}
