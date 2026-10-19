import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Toast, ToastAction, ToastKind, ToastService } from './toast.service';

/** Each arrival kind's icon (Bootstrap Icons). */
const KIND_ICON: Readonly<Record<ToastKind, string>> = {
    ring:    'bi-telephone-inbound-fill',
    message: 'bi-chat-dots-fill',
    visitor: 'bi-person-raised-hand',
    task:    'bi-check2-square',
    mail:    'bi-envelope-fill',
    bell:    'bi-bell-fill',
};

/** Each feedback type's icon, for a toast that is not an arrival. */
const TYPE_ICON: Readonly<Record<Toast['type'], string>> = {
    success: 'bi-check-circle-fill',
    error:   'bi-x-circle-fill',
    warning: 'bi-exclamation-triangle-fill',
    info:    'bi-info-circle-fill',
};

/**
 * The admin's one toast stack, bottom right: what the person did (saved, refused) and what arrived for them (a call,
 * a message, a waiting visitor, a task, mail, a notification) in one component. An arrival is drawn with its kind's
 * icon; a ringing call is drawn as urgent and stays until it is answered, declined or closed. Hovering a toast stops
 * its clock. Clicking its body opens what it announces when it has something to open, and dismisses it.
 */
@Component({
    selector: 'app-toast-outlet',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="cms-toast-container" aria-live="polite" aria-atomic="false">
            @for (t of toast.toasts(); track t.id) {
                <div [class]="'cms-toast cms-toast--' + (t.kind ?? t.type)"
                     [class.cms-toast--urgent]="t.kind === 'ring'"
                     [attr.role]="t.type === 'error' || t.kind === 'ring' ? 'alert' : 'status'"
                     [attr.data-test]="'toast-' + (t.kind ?? t.type)"
                     (mouseenter)="toast.pause(t.id)"
                     (mouseleave)="toast.resume(t.id)"
                     (click)="openOrDismiss(t)">

                    <div class="cms-toast-icon">
                        <i class="bi {{ iconOf(t) }}"></i>
                    </div>

                    <div class="cms-toast-body">
                        @if (t.title) {
                            <div class="cms-toast-title">
                                {{ t.title }}
                                @if ((t.count ?? 1) > 1) {
                                    <span class="cms-toast-count" data-test="toast-count">{{ t.count }}</span>
                                }
                            </div>
                        }
                        <div class="cms-toast-message">{{ t.message }}</div>
                        @if (actionsOf(t); as list) {
                            @if (list.length > 0) {
                                <div class="cms-toast-actions">
                                    @for (a of list; track a.label; let first = $first) {
                                        <button type="button" class="cms-btn cms-btn-sm"
                                                [class.cms-btn-primary]="first"
                                                [class.cms-btn-ghost]="!first"
                                                data-test="toast-action"
                                                (click)="$event.stopPropagation(); run(t, a)">
                                            {{ a.label }}
                                        </button>
                                    }
                                </div>
                            }
                        }
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
            bottom: 16px;
            right: 16px;
            z-index: 2000;
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: min(380px, calc(100vw - 32px));
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
            from { transform: translateY(12px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
        }
        .cms-toast--success { border-left-color: var(--cms-success); }
        .cms-toast--error   { border-left-color: var(--cms-danger);  }
        .cms-toast--warning { border-left-color: var(--cms-warning); }
        .cms-toast--info    { border-left-color: var(--cms-info);    }
        .cms-toast--ring,
        .cms-toast--message,
        .cms-toast--visitor,
        .cms-toast--task,
        .cms-toast--mail,
        .cms-toast--bell    { border-left-color: var(--cms-accent); }

        .cms-toast-icon {
            font-size: 1rem;
            flex-shrink: 0;
            margin-top: 1px;
            color: var(--cms-accent);
        }
        .cms-toast--success .cms-toast-icon { color: var(--cms-success); }
        .cms-toast--error   .cms-toast-icon { color: var(--cms-danger);  }
        .cms-toast--warning .cms-toast-icon { color: var(--cms-warning); }
        .cms-toast--info    .cms-toast-icon { color: var(--cms-info);    }

        /* A ringing call: a stronger edge, and the icon pulses while it rings. */
        .cms-toast--urgent { border-left-width: 4px; box-shadow: var(--cms-shadow-lg, var(--cms-shadow-md)); }
        .cms-toast--urgent .cms-toast-icon { animation: cms-toast-ring 1.2s ease-in-out infinite; }
        @keyframes cms-toast-ring {
            0%, 100% { transform: scale(1); }
            50%      { transform: scale(1.18); }
        }
        @media (prefers-reduced-motion: reduce) {
            .cms-toast { animation: none; }
            .cms-toast--urgent .cms-toast-icon { animation: none; }
        }

        .cms-toast-body   { flex: 1; min-width: 0; }
        .cms-toast-title  {
            display: flex; align-items: center; gap: 6px;
            font-size: .8125rem; font-weight: 600; color: var(--cms-text);
        }
        .cms-toast-count {
            min-width: 18px; padding: 0 5px; border-radius: 9px;
            background: var(--cms-accent); color: var(--cms-accent-contrast, #fff);
            font-size: .6875rem; font-weight: 600; line-height: 18px; text-align: center;
        }
        .cms-toast-message {
            font-size: .8125rem;
            color: var(--cms-text-secondary);
            word-break: break-word;
            margin-top: 1px;
        }
        .cms-toast-actions { display: flex; gap: 8px; margin-top: 8px; }
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

    /** Up to two: `actions` when given, else the one `action`. */
    actionsOf(t: Toast): readonly ToastAction[] {
        const list = t.actions ?? (t.action !== undefined ? [t.action] : []);
        return list.slice(0, 2);
    }

    iconOf(t: Toast): string {
        return t.kind !== undefined ? KIND_ICON[t.kind] : TYPE_ICON[t.type];
    }

    run(t: Toast, a: ToastAction): void {
        this.toast.dismiss(t.id);
        a.run();
    }

    /** The body: open what the toast announces when it has something to open; dismissed either way. */
    openOrDismiss(t: Toast): void {
        this.toast.dismiss(t.id);
        t.open?.();
    }
}
