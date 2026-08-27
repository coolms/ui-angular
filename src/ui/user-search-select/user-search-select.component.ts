import {
    ChangeDetectionStrategy,
    Component,
    input,
    output,
} from '@angular/core';
import { LazySelectComponent } from '../lazy-select/lazy-select.component';

/**
 * Back-compat wrapper around {@link LazySelectComponent} that defaults
 * the search to the Identity `identifier` field with the historical
 * label-fallback chain `name → fullName → email → identifier`.
 *
 * **New code should prefer `<app-lazy-select>` directly** — this
 * adapter exists so the half-dozen existing call sites (Sections
 * members, Media permissions, VFS chown, etc.) keep working without
 * touching template/output names.
 *
 * The original UserSearchSelect implementation lived here; #437
 * extracted the engine into LazySelect.
 */
@Component({
    selector: 'app-user-search-select',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [LazySelectComponent],
    template: `
        <app-lazy-select
                [apiUrl]="apiUrl()"
                [value]="value()"
                [entityLabel]="entityLabel()"
                [placeholder]="placeholder()"
                [searchStyle]="'rql'"
                [searchField]="'identifier'"
                [extraFilter]="extraFilter()"
                [labelKeys]="userLabelKeys"
                (valueChange)="valueChange.emit($event)" />
    `,
    styles: [`:host { display: block; }`],
})
export class UserSearchSelectComponent {
    /** URL for the list/search API — e.g. /api/v1/auth/users (from the boot manifest's `identity.usersUrl`). */
    apiUrl      = input.required<string>();
    /** Currently selected ID */
    value       = input<string>('');
    /** Human label for placeholder: 'user', 'group' */
    entityLabel = input<string>('user');
    placeholder = input<string>('— Select —');
    /**
     * Optional always-on RQL filter clause forwarded to the engine — e.g.
     * `'isSystem eq false'` to keep platform system users out of the picker.
     * See {@link LazySelectComponent.extraFilter}.
     */
    extraFilter = input<string | null>(null);

    valueChange = output<string>();

    /** Historical user-entity label fallback chain. */
    readonly userLabelKeys: readonly string[] = ['name', 'fullName', 'email', 'identifier', 'slug'];
}
