import {
    ChangeDetectionStrategy,
    Component,
    EventEmitter,
    Input,
    Output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * A raw layout node, mirroring the backend `LayoutNode` VO (which the render
 * builder's `parseLayoutNode` produces from `formOptions.layout`):
 *   { type, name?, description?, compact?, width?, children?, showWhen? }
 * `children` mixes nested container objects and plain field-alias STRINGS
 * (a field leaf). We keep field leaves as strings on the wire.
 */
export type LayoutNode = Record<string, unknown>;

/** A `showWhen` visibility condition. */
interface ShowWhen { field: string; operator: string; value?: unknown }

/**
 * Recursive editor for a form's `formOptions.layout` (Form Builder richness FB-3).
 *
 * Edits the container tree (tabs → tab → group → grid → column) + places field
 * aliases into containers. Self-recurses via an `<ng-template>` outlet (a
 * standalone component can't list itself in `imports`, so template recursion is
 * the clean approach) — ONE component owns all mutation logic operating on a
 * locally-cloned `model`, emitting the whole tree on every edit.
 *
 * `availableFields` (the UNPLACED fields = all fields minus those already
 * referenced as a leaf anywhere in the tree) is computed by the HOST and passed
 * down to every level, so the "+ field" picker only offers unplaced fields and
 * the tray shows what's left. Reorder/placement is button-driven (drag-drop is a
 * deferred polish — recursive CDK connected drop-lists are notoriously fiddly).
 */
@Component({
    selector: 'app-layout-tree-editor',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgTemplateOutlet, FormsModule],
    template: `
        <div class="lte">
            @if (availableFields.length) {
                <div class="lte__tray">
                    <span class="lte__tray-label">Unplaced fields</span>
                    @for (f of availableFields; track f) {
                        <span class="lte__chip lte__chip--avail">{{ f }}</span>
                    }
                    <small class="lte__hint">Use “+ field” inside a container to place them.</small>
                </div>
            } @else if (allFields.length) {
                <div class="lte__tray lte__tray--done">
                    <span class="lte__tray-label">All fields placed ✓</span>
                </div>
            }

            <div class="lte__addrow">
                <span class="lte__addlabel">Add to root:</span>
                @for (t of containerTypes; track t) {
                    <button type="button" class="cms-btn cms-btn-sm" (click)="addContainer(model, t)">+ {{ t }}</button>
                }
            </div>

            @for (node of model; track $index; let i = $index) {
                <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: node, parent: model, index: i }"></ng-container>
            }

            @if (model.length === 0) {
                <div class="lte__empty">No layout yet — add a container above. Fields render in declaration order until then.</div>
            }
        </div>

        <ng-template #nodeTpl let-node let-parent="parent" let-index="index">
            @if (isContainer(node)) {
                <div class="lte__node">
                    <div class="lte__node-head">
                        <span class="lte__type">{{ nodeType(node) }}</span>
                        <input class="cms-input cms-input-sm lte__name" placeholder="name / title"
                               [ngModel]="str(node, 'name')" (ngModelChange)="setProp(node, 'name', $event)" />
                        <label class="lte__w" title="Bootstrap column width 1–12">
                            w<input type="number" min="1" max="12" class="cms-input cms-input-sm"
                                    [ngModel]="num(node, 'width', 12)" (ngModelChange)="setWidth(node, $event)" />
                        </label>
                        <label class="lte__compact" title="Compact spacing">
                            <input type="checkbox" [ngModel]="bool(node, 'compact')" (ngModelChange)="setProp(node, 'compact', $event)" /> compact
                        </label>
                        <span class="lte__spacer"></span>
                        <button type="button" class="cms-btn cms-btn-sm" title="Move up" (click)="move(parent, index, -1)">↑</button>
                        <button type="button" class="cms-btn cms-btn-sm" title="Move down" (click)="move(parent, index, 1)">↓</button>
                        <button type="button" class="cms-btn cms-btn-sm lte__danger" title="Remove (unplaces its fields)" (click)="removeAt(parent, index)">✕</button>
                    </div>

                    <input class="cms-input cms-input-sm lte__desc" placeholder="description (optional)"
                           [ngModel]="str(node, 'description')" (ngModelChange)="setProp(node, 'description', $event)" />

                    <div class="lte__when">
                        <label class="lte__when-toggle">
                            <input type="checkbox" [ngModel]="hasShowWhen(node)" (ngModelChange)="toggleShowWhen(node, $event)" /> Conditional (showWhen)
                        </label>
                        @if (hasShowWhen(node)) {
                            <div class="lte__when-row">
                                <select class="cms-input cms-input-sm" [ngModel]="showWhenField(node)" (ngModelChange)="setShowWhen(node, 'field', $event)">
                                    <option value="">— field —</option>
                                    @for (f of allFields; track f) { <option [value]="f">{{ f }}</option> }
                                </select>
                                <select class="cms-input cms-input-sm" [ngModel]="showWhenOp(node)" (ngModelChange)="setShowWhen(node, 'operator', $event)">
                                    @for (op of operators; track op.id) { <option [value]="op.id">{{ op.label }}</option> }
                                </select>
                                @if (showWhenNeedsValue(node)) {
                                    <input class="cms-input cms-input-sm" placeholder="value"
                                           [ngModel]="showWhenValue(node)" (ngModelChange)="setShowWhen(node, 'value', $event)" />
                                }
                            </div>
                        }
                    </div>

                    <div class="lte__addrow">
                        @for (t of containerTypes; track t) {
                            <button type="button" class="cms-btn cms-btn-sm" (click)="addContainer(children(node), t)">+ {{ t }}</button>
                        }
                        <select class="cms-input cms-input-sm lte__fieldpick" [ngModel]="''" (ngModelChange)="addField(node, $event)">
                            <option value="">+ field…</option>
                            @for (f of availableFields; track f) { <option [value]="f">{{ f }}</option> }
                        </select>
                    </div>

                    <div class="lte__children">
                        @for (child of children(node); track $index; let j = $index) {
                            @if (isFieldLeaf(child)) {
                                <span class="lte__chip lte__chip--placed">
                                    {{ leafAlias(child) }}
                                    <button type="button" class="lte__chipx" title="Unplace" (click)="removeAt(children(node), j)">×</button>
                                </span>
                            } @else {
                                <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: child, parent: children(node), index: j }"></ng-container>
                            }
                        }
                    </div>
                </div>
            } @else {
                <span class="lte__chip lte__chip--placed">
                    {{ leafAlias(node) }}
                    <button type="button" class="lte__chipx" title="Unplace" (click)="removeAt(parent, index)">×</button>
                </span>
            }
        </ng-template>
    `,
    styles: [`
        .lte { display: flex; flex-direction: column; gap: 10px; }
        .lte__tray {
            display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
            padding: 8px; border: 1px dashed var(--cms-border); border-radius: var(--cms-radius, 6px);
            background: var(--cms-border-light);
        }
        .lte__tray--done { color: var(--cms-success, #16a34a); }
        .lte__tray-label { font-size: .75rem; font-weight: 600; color: var(--cms-text-secondary); }
        .lte__hint { font-size: .6875rem; color: var(--cms-text-muted); margin-left: auto; }
        .lte__addrow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
        .lte__addlabel { font-size: .6875rem; color: var(--cms-text-muted); }
        .lte__empty {
            padding: 12px; text-align: center; font-size: .75rem; color: var(--cms-text-muted);
            border: 1px dashed var(--cms-border); border-radius: var(--cms-radius, 6px);
        }
        .lte__node {
            display: flex; flex-direction: column; gap: 6px;
            border: 1px solid var(--cms-border); border-left: 3px solid var(--cms-primary, #2563eb);
            border-radius: var(--cms-radius, 6px); padding: 8px; background: var(--cms-surface);
        }
        .lte__node-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
        .lte__type {
            font-size: .6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
            color: var(--cms-primary, #2563eb); padding: 1px 6px; border: 1px solid var(--cms-primary, #2563eb);
            border-radius: var(--cms-radius-lg, 10px);
        }
        .lte__name { flex: 1; min-width: 120px; }
        .lte__w { display: inline-flex; align-items: center; gap: 3px; font-size: .6875rem; }
        .lte__w .cms-input { width: 48px; }
        .lte__compact { display: inline-flex; align-items: center; gap: 3px; font-size: .6875rem; }
        .lte__spacer { flex: 1; }
        .lte__desc { width: 100%; }
        .lte__when { display: flex; flex-direction: column; gap: 4px; }
        .lte__when-toggle { font-size: .6875rem; display: inline-flex; align-items: center; gap: 4px; }
        .lte__when-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .lte__fieldpick { max-width: 160px; }
        .lte__children { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-start; }
        .lte__children > .lte__node { flex: 1 0 100%; }
        .lte__chip {
            display: inline-flex; align-items: center; gap: 4px; font-size: .75rem;
            padding: 2px 4px 2px 8px; border-radius: 12px; border: 1px solid var(--cms-border);
        }
        .lte__chip--avail { background: var(--cms-surface); color: var(--cms-text-secondary); }
        .lte__chip--placed { background: var(--cms-primary, #2563eb); color: var(--cms-text-inverse); border-color: var(--cms-primary, #2563eb); }
        .lte__chipx { background: transparent; border: none; color: inherit; cursor: pointer; font-size: .85rem; line-height: 1; }
        .lte__danger { color: var(--cms-danger, #dc2626); }
    `],
})
export class LayoutTreeEditorComponent {
    /** Container node types (everything else in `children` is a field-alias leaf).
     *  `wizard`→`step` are the multi-step variant (structurally like `tabs`→`tab`);
     *  the dynamic-form renderer paints Back/Next step navigation for them. */
    readonly containerTypes: ReadonlyArray<string> = ['tabs', 'tab', 'wizard', 'step', 'group', 'grid', 'column'];
    readonly operators: ReadonlyArray<{ id: string; label: string }> = [
        { id: 'eq', label: '=' },
        { id: 'ne', label: '≠' },
        { id: 'in', label: 'in' },
        { id: 'notIn', label: 'not in' },
        { id: 'empty', label: 'is empty' },
        { id: 'notEmpty', label: 'is not empty' },
    ];

    /** The locally-edited tree (deep clone of the input; emitted on every edit). */
    model: LayoutNode[] = [];
    private lastEmitted = '[]';

    /** All field aliases (for the showWhen field picker). */
    @Input() allFields: string[] = [];
    /** Unplaced field aliases (for the "+ field" picker + tray) — computed by the host. */
    @Input() availableFields: string[] = [];

    @Input()
    set nodes(value: LayoutNode[] | undefined | null) {
        const incoming = Array.isArray(value) ? value : [];
        const json = JSON.stringify(incoming);
        // Skip the echo of what we just emitted (avoids clobbering an in-progress edit).
        if (json === this.lastEmitted) return;
        this.model = JSON.parse(json) as LayoutNode[];
    }

    @Output() readonly nodesChange = new EventEmitter<LayoutNode[]>();

    // ── Node-shape helpers (the model is opaque Records / strings) ────────────

    isContainer(node: unknown): boolean {
        return !!node && typeof node === 'object' && !Array.isArray(node)
            && this.containerTypes.includes(this.nodeType(node));
    }
    isFieldLeaf(node: unknown): boolean { return !this.isContainer(node); }

    nodeType(node: unknown): string {
        if (node && typeof node === 'object') return String((node as LayoutNode)['type'] ?? '');
        return '';
    }
    leafAlias(node: unknown): string {
        if (typeof node === 'string') return node;
        if (node && typeof node === 'object') return String((node as LayoutNode)['type'] ?? '');
        return String(node ?? '');
    }
    str(node: LayoutNode, key: string): string { return String(node[key] ?? ''); }
    num(node: LayoutNode, key: string, def: number): number {
        const v = node[key];
        return typeof v === 'number' ? v : def;
    }
    bool(node: LayoutNode, key: string): boolean { return node[key] === true; }
    children(node: LayoutNode): unknown[] {
        if (!Array.isArray(node['children'])) node['children'] = [];
        return node['children'] as unknown[];
    }

    // ── showWhen helpers ──────────────────────────────────────────────────────

    private showWhen(node: LayoutNode): ShowWhen | null {
        const w = node['showWhen'];
        return w && typeof w === 'object' && !Array.isArray(w) ? (w as ShowWhen) : null;
    }
    hasShowWhen(node: LayoutNode): boolean { return this.showWhen(node) !== null; }
    showWhenField(node: LayoutNode): string { return String(this.showWhen(node)?.field ?? ''); }
    showWhenOp(node: LayoutNode): string { return String(this.showWhen(node)?.operator ?? 'eq'); }
    showWhenValue(node: LayoutNode): string {
        const v = this.showWhen(node)?.value;
        return v == null ? '' : String(v);
    }
    showWhenNeedsValue(node: LayoutNode): boolean {
        const op = this.showWhenOp(node);
        return op !== 'empty' && op !== 'notEmpty';
    }

    // ── Mutations (operate in place on the local model, then emit) ────────────

    setProp(node: LayoutNode, key: string, value: unknown): void {
        if (value === '' || value === false || value == null) delete node[key];
        else node[key] = value;
        this.emit();
    }
    setWidth(node: LayoutNode, value: unknown): void {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 1 && n <= 12 && n !== 12) node['width'] = Math.round(n);
        else delete node['width'];
        this.emit();
    }

    addContainer(target: unknown[], type: string): void {
        target.push({ type });
        this.emit();
    }
    addField(node: LayoutNode, alias: string): void {
        const a = (alias ?? '').trim();
        if (a === '') return;
        this.children(node).push(a);
        this.emit();
    }
    removeAt(target: unknown[], index: number): void {
        target.splice(index, 1);
        this.emit();
    }
    move(target: unknown[], index: number, delta: number): void {
        const to = index + delta;
        if (to < 0 || to >= target.length) return;
        const [item] = target.splice(index, 1);
        target.splice(to, 0, item);
        this.emit();
    }

    toggleShowWhen(node: LayoutNode, on: boolean): void {
        if (on) node['showWhen'] = { field: '', operator: 'eq', value: '' };
        else delete node['showWhen'];
        this.emit();
    }
    setShowWhen(node: LayoutNode, key: keyof ShowWhen, value: unknown): void {
        const w = this.showWhen(node);
        if (!w) return;
        (w as unknown as Record<string, unknown>)[key] = value;
        this.emit();
    }

    private emit(): void {
        this.lastEmitted = JSON.stringify(this.model);
        this.nodesChange.emit(JSON.parse(this.lastEmitted) as LayoutNode[]);
    }
}
