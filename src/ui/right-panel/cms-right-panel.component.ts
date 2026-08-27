import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    output,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { type NaviGraphNode } from '@coolms/core-angular';
/**
 * Shared chrome for module right-side detail panels.
 *
 * Approach B per the right-panel investigation: each module
 * keeps its own body component (projected via `<ng-content>`)
 * but the header chrome (icon + title + close X + optional
 * extra-actions slot) lives here so all panels look identical
 * and so the header content can be driven by the NaviGraph
 * node that triggered the open.
 *
 * Used by Document Library, Media Library, and VFS File
 * Manager today; Domain Explorer / Pages / Dynamic Entities
 * pick this up for free when they add right-panel surfaces.
 *
 * Usage:
 *   <cms-right-panel [node]="state.panelNode()" (closed)="state.closePanel()">
 *       <button extra-actions title="Permissions" (click)="…">…</button>
 *       <module-body [item]="…" />
 *   </cms-right-panel>
 */
@Component({
    selector: 'cms-right-panel',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgClass],
    template: `
        <header class="cms-right-panel__header">
            <i class="bi cms-right-panel__icon" [ngClass]="'bi-' + icon()"></i>
            <span class="cms-right-panel__title">{{ title() }}</span>
            <span class="cms-right-panel__spacer"></span>

            <!-- Module-specific extra header actions, projected from consumer. -->
            <ng-content select="[extra-actions]" />

            <button
                type="button"
                class="cms-right-panel__close"
                (click)="onClose()"
                aria-label="Close panel"
                title="Close"
            >
                <i class="bi bi-x-lg"></i>
            </button>
        </header>

        <div class="cms-right-panel__body">
            <ng-content />
        </div>
    `,
    styles: [`
        :host {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
            overflow: hidden;
            background: var(--cms-surface);
        }
        .cms-right-panel__header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px var(--cms-panel-padding);
            border-bottom: 1px solid var(--cms-border);
            background: var(--cms-surface);
            font-size: .8125rem;
            font-weight: 600;
            color: var(--cms-text);
            flex-shrink: 0;
        }
        .cms-right-panel__icon {
            color: var(--cms-accent);
            font-size: .875rem;
        }
        .cms-right-panel__title {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .cms-right-panel__spacer {
            flex: 1;
        }
        .cms-right-panel__close {
            background: none;
            border: 0;
            cursor: pointer;
            color: var(--cms-text-muted);
            padding: 2px 6px;
            border-radius: var(--cms-radius-sm);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: background .1s, color .1s;
        }
        .cms-right-panel__close:hover {
            color: var(--cms-text);
            background: var(--cms-border-light);
        }
        .cms-right-panel__body {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
        }
    `],
})
export class CmsRightPanelComponent {
    /** NaviGraph node that opened the panel; drives header icon + title. */
    readonly node = input<NaviGraphNode | null>(null);

    /** Fallback icon when no node is bound (e.g. early-load race). */
    readonly defaultIcon = input<string>('info-circle');

    /** Fallback title when no node is bound. */
    readonly defaultTitle = input<string>('Properties');

    /** Fires on Close X click. Consumers handle their own panel-state mutation. */
    readonly closed = output<void>();

    protected readonly icon = computed<string>(() => {
        const meta = this.node()?.meta;
        const raw = meta?.['icon'];
        return typeof raw === 'string' && raw !== '' ? raw : this.defaultIcon();
    });

    protected readonly title = computed<string>(() => {
        const node = this.node();
        if (!node) return this.defaultTitle();
        const metaLabel = node.meta?.['label'];
        if (typeof metaLabel === 'string' && metaLabel !== '') return metaLabel;
        if (typeof node.title === 'string' && node.title !== '') return node.title;
        return this.defaultTitle();
    });

    protected onClose(): void {
        this.closed.emit();
    }
}
