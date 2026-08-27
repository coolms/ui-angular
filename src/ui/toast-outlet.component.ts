import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
    selector: 'app-toast-outlet',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="cms-toast-container" aria-live="polite" aria-atomic="true">
            @for (t of toast.toasts(); track t.id) {
                <div class="cms-toast cms-toast--{{ t.type }}"
                     role="alert"
                     (click)="toast.dismiss(t.id)">

                    <div class="cms-toast-icon">
                        @if (t.type === 'success') { <i class="bi bi-check-circle-fill"></i> }
                        @if (t.type === 'error')   { <i class="bi bi-x-circle-fill"></i>     }
                        @if (t.type === 'warning') { <i class="bi bi-exclamation-triangle-fill"></i> }
                        @if (t.type === 'info')    { <i class="bi bi-info-circle-fill"></i>  }
                    </div>

                    <div class="cms-toast-body">
                        @if (t.title) {
                            <div class="cms-toast-title">{{ t.title }}</div>
                        }
                        <div class="cms-toast-message">{{ t.message }}</div>
                    </div>

                    <button type="button"
                            class="cms-toast-close"
                            aria-label="Dismiss"
                            (click)="$event.stopPropagation(); toast.dismiss(t.id)">
                        <i class="bi bi-x"></i>
                    </button>
                </div>
            }
        </div>
    `,
    styles: [`
        .cms-toast-container {
            position: fixed;
            top: 68px;
            right: 16px;
            z-index: 2000;
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-width: 380px;
            pointer-events: none;
        }
        .cms-toast {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 12px 14px;
            background: var(--cms-surface);
            border-radius: var(--cms-radius);
            box-shadow: var(--cms-shadow-md);
            border-left: 3px solid transparent;
            cursor: pointer;
            pointer-events: all;
            animation: cms-toast-in .2s ease;
        }
        @keyframes cms-toast-in {
            from { transform: translateX(16px); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
        }
        .cms-toast--success { border-left-color: var(--cms-success); }
        .cms-toast--error   { border-left-color: var(--cms-danger);  }
        .cms-toast--warning { border-left-color: var(--cms-warning); }
        .cms-toast--info    { border-left-color: var(--cms-info);    }

        .cms-toast-icon {
            font-size: 1rem;
            flex-shrink: 0;
            margin-top: 1px;
        }
        .cms-toast--success .cms-toast-icon { color: var(--cms-success); }
        .cms-toast--error   .cms-toast-icon { color: var(--cms-danger);  }
        .cms-toast--warning .cms-toast-icon { color: var(--cms-warning); }
        .cms-toast--info    .cms-toast-icon { color: var(--cms-info);    }

        .cms-toast-body   { flex: 1; min-width: 0; }
        .cms-toast-title  { font-size: .8125rem; font-weight: 600; color: var(--cms-text); }
        .cms-toast-message {
            font-size: .8125rem;
            color: var(--cms-text-secondary);
            word-break: break-word;
            margin-top: 1px;
        }
        .cms-toast-close {
            flex-shrink: 0;
            background: none; border: none; padding: 0;
            cursor: pointer; color: var(--cms-text-muted);
            font-size: .9rem; line-height: 1;
            &:hover { color: var(--cms-text); }
        }
    `],
})
export class ToastOutletComponent {
    readonly toast = inject(ToastService);
}
