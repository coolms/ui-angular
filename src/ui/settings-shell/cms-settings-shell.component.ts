import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    ElementRef,
    inject,
    Injector,
    input,
    output,
    signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { CmsPageHeaderComponent } from '../cms-page-header.component';
import { CmsPaneSplitterComponent } from '../pane-splitter/cms-pane-splitter.component';
import { ToolbarAction } from '../page-toolbar.component';

/** One entry of the shell's section list. */
export interface CmsSettingsSection {
    readonly id: string;
    readonly label: string;
    /** The heading the entry sits under (a module in the global scope); entries without one are listed flat. */
    readonly group?: { readonly id: string; readonly label: string; readonly icon?: string };
    /** A marker after the label, e.g. "saved values override the defaults"; the title says what it means. */
    readonly marker?: string;
    /** A destructive pane (deleting the object), drawn last and in the danger colour. */
    readonly danger?: boolean;
    /** Extra words the filter matches (a setting's key), beyond the label and the group's label. */
    readonly keywords?: string;
}

interface SectionGroup {
    readonly id: string;
    readonly label: string;
    readonly icon?: string;
    readonly sections: CmsSettingsSection[];
}

/**
 * The frame every settings screen shares: a header (title, a scope line, actions), the section list on the left and
 * one pane at a time on the right (`cms-settings-pane`, projected).
 *
 * **It never chooses what is listed or which scope it is in.** The host passes the sections it may show and the one
 * selected, and is told when another is picked -- so the route decides the scope, and picking an entry can change
 * only the pane and the URL. A shell that decided anything from the entry picked is how picking another module's
 * setting once turned the global list into that module's.
 */
@Component({
    selector: 'cms-settings-shell',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CmsPageHeaderComponent, CmsPaneSplitterComponent, RouterLink],
    template: `
        <div class="cms-settings-shell">
            @if (backLink(); as back) {
                <a class="cms-settings-shell__back" [routerLink]="back.routerLink">
                    <i class="bi bi-arrow-left"></i><span>{{ back.label }}</span>
                </a>
            }
            <cms-page-header
                [title]="title()"
                [icon]="icon()"
                [subtitle]="scopeLine()"
                [actions]="actions()"
                (actionClick)="actionClick.emit($event)" />

            <div class="cms-settings-shell__body">
                <nav class="cms-settings-shell__list" [attr.aria-label]="listLabel()">
                    @if (filterable()) {
                        <input type="search"
                               class="cms-input cms-input-sm cms-settings-shell__filter"
                               [placeholder]="filterPlaceholder()"
                               [attr.aria-label]="filterPlaceholder()"
                               [value]="query()"
                               (input)="query.set($any($event.target).value)" />
                    }
                    @if (groups().length === 0) {
                        <p class="cms-settings-shell__empty">{{ query() ? 'Nothing matches.' : emptyText() }}</p>
                    }
                    @for (group of groups(); track group.id) {
                        <div class="cms-settings-shell__group">
                            @if (group.label) {
                                <div class="cms-settings-shell__group-head">
                                    @if (group.icon) {
                                        <i class="bi" [class]="'bi-' + group.icon"></i>
                                    }
                                    <span>{{ group.label }}</span>
                                </div>
                            }
                            @for (section of group.sections; track section.id) {
                                <button type="button"
                                        class="cms-settings-shell__item"
                                        [class.cms-settings-shell__item--active]="section.id === selectedId()"
                                        [class.cms-settings-shell__item--danger]="section.danger"
                                        [class.cms-settings-shell__item--nested]="!!group.label"
                                        [attr.aria-current]="section.id === selectedId() ? 'page' : null"
                                        (click)="pick(section)">
                                    <span class="cms-settings-shell__label">{{ section.label }}</span>
                                    @if (section.marker) {
                                        <span class="cms-settings-shell__marker" [title]="section.marker"></span>
                                    }
                                </button>
                            }
                        </div>
                    }
                </nav>

                <cms-pane-splitter [storageKey]="splitterKey()" [minWidth]="200" [maxWidth]="440" />

                <section class="cms-settings-shell__pane">
                    <ng-content />
                </section>
            </div>
        </div>
    `,
    styles: [`
        :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .cms-settings-shell { display: flex; flex-direction: column; flex: 1; min-height: 0; }

        .cms-settings-shell__back {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 8px 20px 0; font-size: .8125rem; color: var(--cms-text-muted); text-decoration: none;
        }
        .cms-settings-shell__back:hover { color: var(--cms-text); }

        .cms-settings-shell__body { display: flex; flex: 1; min-height: 0; }

        /* Left padding is the page header's 20px, so the entries share the title's line. */
        .cms-settings-shell__list {
            width: 260px; flex-shrink: 0; overflow-y: auto;
            padding: 4px 12px 12px 20px;
        }
        .cms-settings-shell__filter { width: 100%; margin: 0 0 12px; }
        .cms-settings-shell__empty { font-size: .8125rem; color: var(--cms-text-muted); padding: 8px 0; margin: 0; }

        .cms-settings-shell__group + .cms-settings-shell__group { margin-top: 14px; }
        .cms-settings-shell__group-head {
            display: flex; align-items: center; gap: 8px; padding: 4px 0;
            font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .03em;
            color: var(--cms-text-muted);
        }

        /* Pulled 10px left with a 2px rule and 8px padding, so the label lands on the list's line and a selected
           row reads as a band. Nested under a heading, it indents to sit under the heading's label. */
        .cms-settings-shell__item {
            display: flex; align-items: center; justify-content: space-between; gap: 8px;
            width: calc(100% + 20px); margin: 0 -10px; padding: 6px 10px 6px 8px;
            border: 0; border-left: 2px solid transparent; background: transparent;
            color: var(--cms-text); font-size: .8125rem; text-align: left; cursor: pointer;
        }
        .cms-settings-shell__item--nested { padding-left: 29px; }
        .cms-settings-shell__item:hover { background: var(--cms-hover-bg); }
        .cms-settings-shell__item:focus-visible { outline: 2px solid var(--cms-focus-ring); outline-offset: -2px; }
        .cms-settings-shell__item--active {
            background: var(--cms-selected-light); border-left-color: var(--cms-selected); font-weight: 600;
        }
        .cms-settings-shell__item--danger { color: var(--cms-danger); }
        .cms-settings-shell__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cms-settings-shell__marker {
            width: 6px; height: 6px; border-radius: 50%; background: var(--cms-accent); flex-shrink: 0;
        }

        .cms-settings-shell__pane { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    `],
})
export class CmsSettingsShellComponent {
    readonly title = input.required<string>();
    readonly icon = input<string>('sliders');
    /** What this screen covers: every module, one module, or one object. */
    readonly scopeLine = input<string>('');
    readonly actions = input<ToolbarAction[]>([]);
    /** In the object scope: back to the object the settings belong to. */
    readonly backLink = input<{ readonly label: string; readonly routerLink: string | readonly unknown[] } | null>(null);

    readonly sections = input<readonly CmsSettingsSection[]>([]);
    readonly selectedId = input<string | null>(null);
    /** A filter field above the list (the global scope, where the list is long). */
    readonly filterable = input<boolean>(false);
    readonly filterPlaceholder = input<string>('Filter settings');
    readonly emptyText = input<string>('Nothing to show here.');
    readonly listLabel = input<string>('Sections');
    /** Where the list's width is remembered, per screen. */
    readonly splitterKey = input<string>('cms.settings.listW');

    /** An entry was picked; the host routes to it (and asks about a dirty pane first). */
    readonly select = output<string>();
    readonly actionClick = output<string>();

    readonly query = signal('');

    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly injector = inject(Injector);

    constructor() {
        // A deep link can open a setting far down a long list; bring its entry into view once it is drawn, without
        // moving the page when it is already visible.
        effect(() => {
            if (null === this.selectedId() || 0 === this.groups().length) {
                return;
            }
            afterNextRender(() => this.host.nativeElement
                .querySelector('.cms-settings-shell__item--active')
                ?.scrollIntoView({ block: 'nearest' }), { injector: this.injector });
        });
    }

    readonly groups = computed((): SectionGroup[] => {
        const q = this.query().trim().toLowerCase();
        const shown = this.sections().filter(s => '' === q || [s.label, s.group?.label ?? '', s.keywords ?? '']
            .some(text => text.toLowerCase().includes(q)));
        const out: SectionGroup[] = [];
        for (const s of shown) {
            const id = s.group?.id ?? '';
            let group = out.find(g => g.id === id);
            if (undefined === group) {
                group = { id, label: s.group?.label ?? '', icon: s.group?.icon, sections: [] };
                out.push(group);
            }
            group.sections.push(s);
        }

        return out;
    });

    pick(section: CmsSettingsSection): void {
        if (section.id !== this.selectedId()) {
            this.select.emit(section.id);
        }
    }
}
