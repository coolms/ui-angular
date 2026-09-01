/**
 * The public surface of `@coolms/ui-angular`.
 *
 * Everything a consumer may name lives here, and nothing else is reachable:
 * the lint config forbids importing past this file, so THIS is what the
 * package exports. If what you need is missing, exporting it is a decision
 * about the API rather than an import detail.
 *
 * 99 of the 143 modules in this package, derived from the 143 symbols the
 * application actually names -- statically, and through the dynamic imports
 * a lazy route uses. The other 44 are internal: `export`ed so their
 * neighbours can reach them, which is not the same as being public.
 *
 * Ordered by area, not alphabetically, so the shape of the kit is legible.
 */

// -- Primitives: chrome, dialogs, pickers, state and the page scaffold ---------
export * from './ui/cms-detail-footer.component';
export * from './ui/cms-list-page.component';
export * from './ui/cms-page-header.component';
export * from './ui/cms-section-header.component';
export * from './ui/code-editor/code-editor.component';
export * from './ui/confirm-dialog.service';
export * from './ui/unsaved-changes.service';
export * from './ui/unsaved-changes.guard';
export * from './ui/context-frame/authoring-context.service';
export * from './ui/context-frame/cms-context-frame.component';
export * from './ui/dialog/delete-node-dialog.component';
export * from './ui/dialog/native-dialog.service';
export * from './ui/directory-picker/cms-directory-picker.component';
export * from './ui/drop-zone.directive';
export * from './ui/dropzone/cms-dropzone.directive';
export * from './ui/dtmpl-token-input/cms-dtmpl-token-input.component';
export * from './ui/entity-picker/cms-entity-picker.component';
export * from './ui/esc-coordinator/esc-coordinator.service';
export * from './ui/explorer-accordion/explorer-accordion.component';
export * from './ui/explorer-accordion/space-dto';
export * from './ui/explorer-accordion/space-selection.store';
export * from './ui/explorer-toolbar-row/explorer-toolbar-row.component';
export * from './ui/field-widgets/builtin/checkbox-field-widget.component';
export * from './ui/field-widgets/builtin/date-field-widget.component';
export * from './ui/field-widgets/builtin/text-field-widget.component';
export * from './ui/field-widgets/builtin/textarea-field-widget.component';
export * from './ui/field-widgets/field-widget-host.component';
export * from './ui/field-widgets/field-widget-registry';
export * from './ui/field-widgets/tag-field-widget.component';
export * from './ui/field-widgets/taxonomy-field-widget.component';
export * from './ui/file-editor-registry';
export * from './ui/file-picker/cms-file-picker-dialog.component';
export * from './ui/filter-builder/cms-filter-builder.component';
export * from './ui/item-interactions/cms-item-interactions.directive';
export * from './ui/layout-actions.service';
export * from './ui/layout-tree-editor/layout-tree-editor.component';
export * from './ui/lazy-select/lazy-select.component';
export * from './ui/locale-switcher.component';
export * from './ui/modal/modal.component';
export * from './ui/multi-option-select/multi-option-select.component';
export * from './ui/ordered-builder/ordered-builder.component';
export * from './ui/page-actions.service';
export * from './ui/page-footer.service';
export * from './ui/page-title.service';
export * from './ui/page-toolbar.component';
export * from './ui/pane-splitter/cms-pane-splitter.component';
export * from './ui/range-picker/datetime-field.component';
export * from './ui/range-picker/datetime-range-picker.component';
export * from './ui/range-picker/time-of-day-picker.component';
export * from './ui/right-panel/cms-right-panel.component';
export * from './ui/state/empty-state.component';
export * from './ui/state/error-banner.component';
export * from './ui/state/loading.component';
export * from './ui/tab-strip.component';
export * from './ui/tag-input.component';
export * from './ui/toast-outlet.component';
export * from './ui/toast.service';
export * from './ui/token-input/token-input.component';
export * from './ui/tree-picker/cms-tree-picker.component';
export * from './ui/tree-picker/cms-tree-picker.types';
export * from './ui/user-avatar.component';
export * from './ui/user-search-select/user-search-select.component';
export * from './ui/wizard/cms-wizard.component';
export * from './ui/wizard/cms-wizard.directives';
export * from './ui/wizard/cms-wizard.types';

// -- Page layouts the shells compose -------------------------------------------
export * from './layout/bottom-drawer.service';
export * from './layout/drawer.service';
export * from './layout/explorer-layout.component';
export * from './layout/explorer-view-mode';
export * from './layout/explorer-view-switcher.component';
export * from './layout/inspector-layout.component';
export * from './layout/list-layout.component';

// -- The data grid, its cells and its preferences ------------------------------
export * from './datagrid/datagrid-live-events.service';
export * from './datagrid/datagrid.component';
export * from './datagrid/datagrid.types';
export * from './datagrid/filter-widgets/datagrid-filter-widget-registry';
export * from './datagrid/filter-widgets/option-source-filter-widget.component';

// -- Formatting and preference helpers -----------------------------------------
export * from './util/date-time-format.service';
export * from './util/date-time.pipe';
export * from './util/day-groups';
export * from './util/draft-store.service';
export * from './util/user-calendar-preferences.service';

// -- Records of a server-declared entity type ----------------------------------
export * from './dynamic-record/dynamic-record-form.component';
export * from './dynamic-record/dynamic-record-list.component';
export * from './dynamic-record/dynamic-record-page.component';
export * from './dynamic-record/dynamic-record.service';

// -- Realtime notification transport -------------------------------------------
export * from './notification/centrifugo-client.service';
export * from './notification/centrifugo-notification-stream.service';
export * from './notification/notification-stream.service';

// -- Centrifugo admin surface --------------------------------------------------
export * from './centrifugo/centrifugo-admin.service';
export * from './centrifugo/types';

// -- Context menus -------------------------------------------------------------
export * from './context-menu/context-menu.component';
export * from './context-menu/context-menu.service';

// -- Cron expression editing ---------------------------------------------------
export * from './cron-form/cron-form.component';
export * from './cron-form/cron-form.types';

// -- Ports onto the schema vocabulary ------------------------------------------
export * from './schema/runtime-types.port';
export * from './schema/schema.types';

// -- Server-declared forms: the renderer and its field widgets -----------------
export * from './dynamic-form/dynamic-form.component';

// -- NaviGraph tree adapter ----------------------------------------------------
export * from './navi-graph/navi-graph-tree-source';

// -- VFS wire types ------------------------------------------------------------
export * from './vfs/vfs.types';

// -- Dashboard widgets ---------------------------------------------------------
export * from './widgets/multiselect-search.component';
