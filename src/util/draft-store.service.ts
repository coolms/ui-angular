import { Injectable } from '@angular/core';

/**
 * Generic per-browser draft store (localStorage), keyed by an opaque string the
 * caller composes (e.g. `email.<mailboxId>.compose`, `chat.<conversationId>`).
 * Values are JSON-serialised. Every operation is best-effort — a full/blocked
 * localStorage never throws into the caller. Sits beside the other per-browser UI
 * state the admin keeps in localStorage (pane widths, last-selected mailbox).
 *
 * v1 is intentionally local-only; a future server/IMAP-Drafts-folder sync can
 * back the same interface without changing consumers.
 */
@Injectable({ providedIn: 'root' })
export class DraftStoreService {
    private static readonly PREFIX = 'coolms.draft.';

    /** Persist a draft under `key`. A JSON-serialisation failure is swallowed. */
    save(key: string, value: unknown): void {
        try {
            localStorage.setItem(DraftStoreService.PREFIX + key, JSON.stringify(value));
        } catch {
            /* localStorage full/blocked — drafts are best-effort */
        }
    }

    /** Load a draft, or null when absent/unparseable. */
    load<T>(key: string): T | null {
        try {
            const raw = localStorage.getItem(DraftStoreService.PREFIX + key);
            return raw !== null ? (JSON.parse(raw) as T) : null;
        } catch {
            return null;
        }
    }

    /** Whether a draft exists under `key`. */
    has(key: string): boolean {
        return localStorage.getItem(DraftStoreService.PREFIX + key) !== null;
    }

    /** Remove the draft under `key` (no-op when absent). */
    clear(key: string): void {
        try {
            localStorage.removeItem(DraftStoreService.PREFIX + key);
        } catch {
            /* best-effort */
        }
    }
}
