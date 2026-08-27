import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { ListLayoutComponent } from '../layout/list-layout.component';
import { DynamicRecordListComponent } from './dynamic-record-list.component';
import { PageActionsService } from '../ui/page-actions.service';
import { PageFooterService } from '../ui/page-footer.service';

/**
 * Route host for /dynamic-records/:typeAlias.
 *
 * Provides PageActionsService and PageFooterService so that both
 * ListLayoutComponent (which renders the page header / footer chrome)
 * and DynamicRecordListComponent (which registers "New record" and pushes
 * count + pagination to the footer) share the SAME service instances.
 *
 * DynamicRecordListComponent is projected into the layout via
 * `slot="content.main"` rather than through the YAML slot registry,
 * because its `typeAlias` input must be bound to a runtime route param.
 */
@Component({
    selector: 'app-dynamic-record-page',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ListLayoutComponent, DynamicRecordListComponent],
    providers: [PageActionsService, PageFooterService],
    styles: [':host { display: flex; flex: 1; flex-direction: column; min-height: 0; }'],
    template: `
        <cms-list-layout layoutId="dynamic-record-list">
            <app-dynamic-record-list
                slot="content.main"
                [typeAlias]="typeAlias()" />
        </cms-list-layout>
    `,
})
export class DynamicRecordPageComponent {
    private readonly route = inject(ActivatedRoute);

    readonly typeAlias = toSignal(
        this.route.params.pipe(map(p => p['typeAlias'] as string)),
        { initialValue: '' },
    );
}
