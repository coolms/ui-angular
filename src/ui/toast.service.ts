import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    readonly id:      number;
    readonly type:    ToastType;
    readonly title?:  string;
    readonly message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
    private counter = 0;

    readonly toasts = signal<Toast[]>([]);

    show(partial: Omit<Toast, 'id'>, duration = 5000): void {
        const id = ++this.counter;
        this.toasts.update(list => [...list, { id, ...partial }]);
        if (duration > 0) {
            setTimeout(() => this.dismiss(id), duration);
        }
    }

    success(message: string, title?: string): void {
        this.show({ type: 'success', message, title });
    }

    error(message: string, title?: string): void {
        this.show({ type: 'error', message, title }, 8000);
    }

    warning(message: string, title?: string): void {
        this.show({ type: 'warning', message, title });
    }

    info(message: string, title?: string): void {
        this.show({ type: 'info', message, title });
    }

    dismiss(id: number): void {
        this.toasts.update(list => list.filter(t => t.id !== id));
    }
}
