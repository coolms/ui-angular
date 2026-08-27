import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PageFooterService } from './page-footer.service';

@Component({
    selector: 'cms-page-footer',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="page-footer">
            <div class="page-footer__left">
                @if (svc.state().loading) {
                    <span class="page-footer__spinner">
                        <i class="bi bi-arrow-repeat page-footer__spin"></i>
                    </span>
                }
                @if (svc.state().count) {
                    <span class="page-footer__count">{{ svc.state().count }}</span>
                }
                @if (svc.state().selected) {
                    <span class="page-footer__sep">·</span>
                    <span class="page-footer__selected">{{ svc.state().selected }}</span>
                }
            </div>

            @if (svc.state().pagination; as p) {
                <div class="page-footer__pagination">
                    <button class="cms-btn cms-btn-sm"
                            [disabled]="p.page <= 1"
                            (click)="svc.prev()">
                        <i class="bi bi-chevron-left"></i> Prev
                    </button>
                    <span class="page-footer__page-info">{{ p.page }} / {{ p.totalPages }}</span>
                    <button class="cms-btn cms-btn-sm"
                            [disabled]="p.page >= p.totalPages"
                            (click)="svc.next()">
                        Next <i class="bi bi-chevron-right"></i>
                    </button>
                </div>
            }
        </div>
    `,
    styles: [`
        :host { display: block; flex-shrink: 0; }

        .page-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 20px;
            min-height: 28px;
            border-top: 1px solid var(--cms-border);
            background: var(--cms-surface);
            font-size: .8125rem;
        }

        .page-footer__left {
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--cms-text-muted);
        }

        .page-footer__count    { color: var(--cms-text-secondary); }
        .page-footer__sep      { color: var(--cms-border); }
        .page-footer__selected { color: var(--cms-text-secondary); font-weight: 500; }
        .page-footer__spinner  { display: flex; align-items: center; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .page-footer__spin { animation: spin 1s linear infinite; font-size: .875rem; }

        .page-footer__pagination {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .page-footer__page-info { font-size: .8rem; color: var(--cms-text-muted); }
    `],
})
export class CmsPageFooterComponent {
    readonly svc = inject(PageFooterService);
}
