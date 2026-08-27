// The preference STORE is core's: `UserPreferencesService` keeps one
// localStorage key across grids, panels, page state, nav and terminal,
// so the shapes are declared there. Re-exported under the grid's own
// path so grid code still reads as grid code.
export type { DataGridPreference, DataGridPreferences } from '@coolms/core-angular';
