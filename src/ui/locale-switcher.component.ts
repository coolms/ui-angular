import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    HostListener,
    computed,
    inject,
    input,
    output,
    signal,
} from '@angular/core';

import { Store } from '@ngxs/store';
import { AppConfigState } from '@coolms/core-angular';
/**
 * Panel-level locale switcher for the resolve-on-read / scope-on-write model:
 * one strip that drives whichever localized fields a panel shows, loading ONE
 * locale at a time. Used by the Media asset Properties panel, the collection
 * Properties panel, and any future node-property panel.
 *
 * Scales past a handful of locales: the first {@link maxInline} render as tabs,
 * the rest collapse into a "+N ▾" dropdown (the dropdown button highlights when
 * the active locale lives in the overflow). Self-hides when the deployment has a
 * single locale.
 *
 * Stateless about WHICH field is dirty — the parent owns reload/dirty logic and
 * passes the active locale in (`activeLocale`) + reacts to `localeChange`. The
 * switcher never mutates the active locale itself, so the parent can run a
 * dirty-guard before committing the switch.
 */
@Component({
    selector: 'app-locale-switcher',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    template: `
        @if (multiLocale()) {
            <div class="locsw">
                <span class="locsw-label">{{ label() }}</span>

                @for (loc of inline(); track loc.code) {
                    <button type="button"
                            class="cms-btn locsw-tab"
                            [class.cms-btn-primary]="activeLocale() === loc.code"
                            [disabled]="loading()"
                            [title]="loc.label"
                            (click)="pick(loc.code)">
                        {{ loc.code.toUpperCase() }}
                        @if (activeLocale() === loc.code && dirty()) { <span class="locsw-dot"></span> }
                    </button>
                }

                @if (overflow().length > 0) {
                    <div class="locsw-more">
                        <button type="button"
                                class="cms-btn locsw-tab"
                                [class.cms-btn-primary]="activeInOverflow()"
                                [disabled]="loading()"
                                [title]="overflowTitle()"
                                (click)="toggle($event)">
                            {{ activeInOverflow() ? activeLocale().toUpperCase() : ('+' + overflow().length) }}
                            <i class="bi bi-chevron-down locsw-caret"></i>
                            @if (activeInOverflow() && dirty()) { <span class="locsw-dot"></span> }
                        </button>
                        @if (open()) {
                            <div class="locsw-menu">
                                @for (loc of overflow(); track loc.code) {
                                    <button type="button"
                                            class="locsw-menu-item"
                                            [class.is-active]="activeLocale() === loc.code"
                                            (click)="pick(loc.code)">
                                        <span class="locsw-code">{{ loc.code.toUpperCase() }}</span>
                                        <span class="locsw-name">{{ loc.label }}</span>
                                    </button>
                                }
                            </div>
                        }
                    </div>
                }

                @if (loading()) { <span class="small text-muted ms-1">loading…</span> }
            </div>
        }
    `,
    styles: [`
        :host { display: contents; }
        .locsw { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: .5rem; }
        .locsw-label { font-size: .75rem; font-weight: 600; margin-right: 2px; }
        .locsw-tab { font-size: .7rem; padding: 1px 6px; display: inline-flex; align-items: center; gap: 3px; }
        .locsw-caret { font-size: .55rem; }
        .locsw-dot {
            display: inline-block; width: 6px; height: 6px; margin-left: 2px;
            border-radius: 50%; background: currentColor; vertical-align: middle;
        }
        .locsw-more { position: relative; display: inline-block; }
        .locsw-menu {
            position: absolute; top: calc(100% + 2px); left: 0; z-index: 1200;
            min-width: 160px; max-height: 240px; overflow-y: auto;
            background: var(--cms-surface); border: 1px solid var(--cms-border, #e5e7eb);
            border-radius: var(--cms-radius, 4px); box-shadow: var(--cms-shadow-md, 0 4px 12px rgba(0,0,0,.12));
            padding: 2px;
        }
        .locsw-menu-item {
            display: flex; align-items: baseline; gap: 6px; width: 100%;
            padding: 5px 8px; background: none; border: none; text-align: left;
            border-radius: 3px; cursor: pointer; font-size: .8rem;
            color: var(--cms-text, #111827);
        }
        .locsw-menu-item:hover { background: var(--cms-border-light, #f0f2f5); }
        .locsw-menu-item.is-active { font-weight: 600; }
        .locsw-code { font-variant: small-caps; min-width: 2.5em; color: var(--cms-text-secondary, #6b7280); }
        .locsw-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `],
})
export class LocaleSwitcherComponent {
    /** The locale currently shown (one-way; the parent owns the value). */
    readonly activeLocale = input<string>('en');
    /** Show a dirty dot on the active tab. */
    readonly dirty = input(false);
    /** Disable tabs + show a "loading…" hint while the parent reloads a locale. */
    readonly loading = input(false);
    readonly label = input<string>('Locale');
    /** How many locales render as inline tabs before the rest fold into "+N ▾". */
    readonly maxInline = input(4);

    /** Emitted when the user picks a different locale (parent guards + commits). */
    readonly localeChange = output<string>();

    private readonly store = inject(Store);
    private readonly host = inject(ElementRef<HTMLElement>);

    readonly open = signal(false);

    readonly locales = computed(() =>
        this.store.selectSnapshot(AppConfigState.manifest)?.supportedLocales
            ?? [{ code: 'en', label: 'English' }],
    );
    readonly multiLocale = computed(() => this.locales().length > 1);
    readonly inline = computed(() => this.locales().slice(0, this.maxInline()));
    readonly overflow = computed(() => this.locales().slice(this.maxInline()));
    readonly activeInOverflow = computed(() => this.overflow().some(l => l.code === this.activeLocale()));
    readonly overflowTitle = computed(() => this.overflow().map(l => l.label).join(', '));

    pick(code: string): void {
        this.open.set(false);
        if (this.loading() || code === this.activeLocale()) return;
        this.localeChange.emit(code);
    }

    toggle(event: Event): void {
        event.stopPropagation();
        if (!this.loading()) this.open.update(o => !o);
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
}
