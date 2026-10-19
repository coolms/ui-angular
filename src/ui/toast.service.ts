import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

/**
 * What arrived, when a toast announces an arrival rather than the result of something the person did: the six kinds
 * of the platform's notification registry, the same ids the sound package and the apps' notification channels use.
 */
export type ToastKind = 'ring' | 'message' | 'visitor' | 'task' | 'mail' | 'bell';

/**
 * One thing the person can do about what the toast says, as a button in it: "Elevate" on a refusal
 * for want of elevation, "Answer" on a ringing call. Clicking it runs `run` and dismisses the toast.
 */
export interface ToastAction {
    readonly label: string;
    readonly run:   () => void;
}

export interface Toast {
    readonly id:      number;
    readonly type:    ToastType;
    readonly title?:  string;
    readonly message: string;
    /** One action. Kept for the callers that have one; `actions` holds up to two. */
    readonly action?: ToastAction;
    /** Up to two actions, the first drawn as the primary one. More are not drawn. */
    readonly actions?: readonly ToastAction[];
    /** An arrival, and of which kind: drawn with that kind's icon instead of the feedback colour of `type`. */
    readonly kind?: ToastKind;
    /**
     * One toast per key. A later `show` with the same key updates that toast where it stands -- its text, its count,
     * its actions -- and starts its time again, instead of stacking a second one. `closeGroup(key)` takes it away.
     */
    readonly groupKey?: string;
    /** How many arrived, when several are told at once ("3 new messages"). Drawn when more than one. */
    readonly count?: number;
    /** Stays until dismissed or closed by its key -- a ringing call. Never pushed out by newer toasts. */
    readonly persistent?: boolean;
    /** Clicking the toast's body runs this, then dismisses it: what it announces is opened. */
    readonly open?: () => void;
}

/** What `show` takes: a toast without its id. */
export type ToastInput = Omit<Toast, 'id'>;

/** A toast's time left, so hovering can stop its clock and leaving start it again. */
interface Clock {
    handle:    ReturnType<typeof setTimeout> | null;
    remaining: number;
    startedAt: number;
}

/**
 * The admin's one toast stack: the result of what the person did (saved, refused) and what arrived for them (a call,
 * a message, a visitor waiting, a task, mail, a notification) are drawn by the same component, in one stack.
 *
 * At most `MAX_VISIBLE` are shown. When one more arrives, the oldest that is not persistent goes; a persistent toast
 * (a ringing call) is never pushed out. Hovering a toast stops its clock; leaving starts it again with the time it
 * had left.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
    static readonly MAX_VISIBLE = 4;

    private counter = 0;
    private readonly clocks = new Map<number, Clock>();

    readonly toasts = signal<Toast[]>([]);

    /**
     * Shows a toast, or updates the one with the same `groupKey` in place. `duration` in ms; 0, or `persistent`,
     * keeps it until it is dismissed. Returns its id.
     */
    show(partial: ToastInput, duration = 5000): number {
        const keep = partial.persistent === true || duration <= 0;
        const existing = partial.groupKey === undefined
            ? undefined
            : this.toasts().find(t => t.groupKey === partial.groupKey);

        if (existing !== undefined) {
            const updated: Toast = { ...partial, id: existing.id };
            this.toasts.update(list => list.map(t => (t.id === existing.id ? updated : t)));
            this.startClock(existing.id, keep ? 0 : duration);
            return existing.id;
        }

        const id = ++this.counter;
        this.toasts.update(list => this.makeRoom([...list, { ...partial, id }]));
        this.startClock(id, keep ? 0 : duration);
        return id;
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
        this.stopClock(id);
        this.clocks.delete(id);
        this.toasts.update(list => list.filter(t => t.id !== id));
    }

    /** Takes away the toast with this key, if one is shown: a call answered elsewhere, a visitor taken by someone else. */
    closeGroup(groupKey: string): void {
        const shown = this.toasts().find(t => t.groupKey === groupKey);
        if (shown !== undefined) {
            this.dismiss(shown.id);
        }
    }

    /** Stops a toast's clock while it is hovered. */
    pause(id: number): void {
        const clock = this.clocks.get(id);
        if (clock === undefined || clock.handle === null) {
            return;
        }
        this.stopClock(id);
        clock.remaining = Math.max(0, clock.remaining - (Date.now() - clock.startedAt));
    }

    /** Starts a paused toast's clock again with the time it had left. */
    resume(id: number): void {
        const clock = this.clocks.get(id);
        if (clock === undefined || clock.handle !== null || clock.remaining <= 0) {
            return;
        }
        this.arm(id, clock);
    }

    /** The list with at most MAX_VISIBLE: the oldest toasts that are not persistent leave first. */
    private makeRoom(list: Toast[]): Toast[] {
        let next = list;
        while (next.length > ToastService.MAX_VISIBLE) {
            const oldest = next.find(t => t.persistent !== true);
            if (oldest === undefined) {
                break;
            }
            this.stopClock(oldest.id);
            this.clocks.delete(oldest.id);
            next = next.filter(t => t.id !== oldest.id);
        }
        return next;
    }

    /** `duration` 0: no clock, the toast stays. */
    private startClock(id: number, duration: number): void {
        this.stopClock(id);
        if (duration <= 0) {
            this.clocks.delete(id);
            return;
        }
        const clock: Clock = { handle: null, remaining: duration, startedAt: 0 };
        this.clocks.set(id, clock);
        this.arm(id, clock);
    }

    private arm(id: number, clock: Clock): void {
        clock.startedAt = Date.now();
        clock.handle = setTimeout(() => this.dismiss(id), clock.remaining);
    }

    private stopClock(id: number): void {
        const clock = this.clocks.get(id);
        if (clock !== undefined && clock.handle !== null) {
            clearTimeout(clock.handle);
            clock.handle = null;
        }
    }
}
