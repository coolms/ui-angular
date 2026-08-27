import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    input,
    model,
} from '@angular/core';

import { Store } from '@ngxs/store';
import { AppConfigState } from '@coolms/core-angular';
@Component({
    selector: 'app-locale-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    template: `
        <div class="locale-field">
            <!-- Single locale: no selector, just label -->
            @if (locales().length === 1) {
                <label class="form-label small fw-semibold">
                    {{ label() }}
                </label>
            }
            <!-- Multiple locales: selector tab-style -->
            @else {
                <div class="d-flex align-items-center gap-2 mb-1">
                    <label class="form-label small fw-semibold mb-0">{{ label() }}</label>
                    <div class="d-flex gap-1">
                        @for (loc of locales(); track loc.code) {
                            <button type="button"
                                    class="cms-btn"
                                    [class.cms-btn-primary]="activeLocale() === loc.code"
                                    style="font-size:.7rem; padding:1px 6px"
                                    (click)="activeLocale.set(loc.code)">
                                {{ loc.code.toUpperCase() }}
                            </button>
                        }
                    </div>
                </div>
            }
            <ng-content />
        </div>
    `,
})
export class LocaleFieldComponent {
    label        = input.required<string>();
    activeLocale = model<string>('en');

    private readonly store = inject(Store);

    locales = computed(() =>
        this.store.selectSnapshot(AppConfigState.manifest)?.supportedLocales ?? [{ code: 'en', label: 'English' }]
    );
}
