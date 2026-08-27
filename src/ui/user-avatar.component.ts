import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
    selector: 'app-user-avatar',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <span class="uav" [style.width.px]="px" [style.height.px]="px">
            @if (user?.avatarUrl) {
                <img [src]="user!.avatarUrl" alt="Avatar"
                     [style.width.px]="px" [style.height.px]="px"
                     style="border-radius:50%; object-fit:cover; display:block" />
            } @else {
                <div [style.width.px]="px" [style.height.px]="px"
                     [style.background]="user?.avatarColor || 'var(--cms-text-muted)'"
                     [style.fontSize]="fontSize"
                     style="border-radius:50%; display:flex; align-items:center; justify-content:center;
                            color:var(--cms-text-inverse); font-weight:600">
                    {{ initial }}
                </div>
            }
            @if (dotColor) {
                <span class="uav__dot"
                      [style.width.px]="dotPx" [style.height.px]="dotPx"
                      [style.background]="dotColor"
                      [title]="status"></span>
            }
        </span>
    `,
    styles: [`
        .uav { position: relative; display: inline-flex; flex-shrink: 0; }
        /* Presence dot (#1019) — bottom-right, ringed in the surface color so it
           reads against both a photo and a colored-initials avatar. */
        .uav__dot { position: absolute; right: 0; bottom: 0; border-radius: 50%;
                    border: 2px solid var(--cms-surface, #fff); box-sizing: content-box; }
    `],
})
export class UserAvatarComponent {
    @Input() user?: {
        avatarUrl?:   string | null;
        avatarColor?: string | null;
        firstName?:   string | null;
        identifier?:  string;
    } | null;

    @Input() size: 'sm' | 'md' | 'lg' = 'md';

    /** Self-set presence status (online/away/busy/offline) → colored dot, #1019. */
    @Input() status?: string | null;

    private static readonly DOT: Record<string, string> = {
        online:  '#22c55e',
        away:    '#f59e0b',
        busy:    '#ef4444',
        offline: '#9ca3af',
    };

    get px(): number {
        return this.size === 'sm' ? 24 : this.size === 'md' ? 40 : 80;
    }

    get fontSize(): string {
        return this.size === 'sm' ? '0.65rem' : this.size === 'md' ? '1rem' : '2rem';
    }

    get initial(): string {
        const name = this.user?.firstName || this.user?.identifier || '';
        return name ? name.charAt(0).toUpperCase() : '?';
    }

    /** Dot color for the current status, or null when unset/unknown (no dot). */
    get dotColor(): string | null {
        return this.status ? (UserAvatarComponent.DOT[this.status] ?? null) : null;
    }

    get dotPx(): number {
        return this.size === 'sm' ? 7 : this.size === 'md' ? 11 : 18;
    }
}
