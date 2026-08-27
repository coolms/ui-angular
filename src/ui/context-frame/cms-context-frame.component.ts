import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    OnDestroy,
    ViewChild,
    effect,
    input,
} from '@angular/core';

/** A stylesheet or script the site itself loads — the `{url}` records SSR uses. */
export interface ContextAsset {
    readonly url: string;
}

/**
 * Renders HTML inside an ISOLATED frame carrying the site's own stylesheets
 * (#1767) — the shared "render in the real context" surface.
 *
 * ## Why an iframe and not shadow DOM or scoped CSS
 *
 * A theme's stylesheets are written assuming they own the document: they style
 * `body`, `h1`, `a`, and set page-level type and spacing. Injected into the
 * admin they restyle the admin AROUND the editor; scoped or shadowed, admin
 * CSS (inherited properties, custom properties, resets) leaks the other way
 * and the preview lies about what the site will show. An iframe is the only
 * boundary that holds in both directions, which is the whole point of the
 * surface.
 *
 * ## Scripts are OFF unless asked for
 *
 * The frame is sandboxed WITHOUT `allow-scripts` by default: this exists to
 * show what content LOOKS like, and running a theme's JS inside the admin is a
 * capability nobody asked for. Note that `allow-same-origin` plus
 * `allow-scripts` on same-origin content effectively disables the sandbox — so
 * `runScripts` is an explicit, documented opt-in rather than a default anyone
 * inherits by accident.
 *
 * ## srcdoc, and why relative asset URLs work
 *
 * The document is written via `srcdoc`, so the frame inherits the parent's
 * base URL and a theme's `/themes/<slug>/assets/app-HASH.css` resolves against
 * the same origin the public site serves it from — the browser fetches the
 * exact bytes the site does, rather than a copy we shipped into the admin.
 */
@Component({
    selector: 'cms-context-frame',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    // No BINDINGS on the iframe. Angular treats an iframe's security-sensitive
    // attributes (`sandbox`, `src`, `srcdoc`) as unsafe to bind and throws
    // NG0910 rather than rendering — so sandbox/title/srcdoc are all applied
    // imperatively below, which is also the only way to guarantee the sandbox
    // is in place before any document is written into the frame.
    template: `
        <iframe #frame class="context-frame__el" referrerpolicy="no-referrer"></iframe>
    `,
    styles: [`
        :host { display: block; height: 100%; min-height: 0; }
        .context-frame__el {
            display: block;
            width: 100%;
            height: 100%;
            border: 0;
            background: var(--cms-surface);
        }
    `],
})
export class CmsContextFrameComponent implements AfterViewInit, OnDestroy {
    /** Body HTML to render. Replaced wholesale on change. */
    readonly html = input<string>('');

    /** Stylesheets to load, in cascade order (parent theme first). */
    readonly css = input<readonly ContextAsset[]>([]);

    /** Scripts — only loaded when {@link runScripts} is true. */
    readonly js = input<readonly ContextAsset[]>([]);

    /**
     * Content width, e.g. `210mm`. Applied to a wrapper INSIDE the frame so
     * the content is as wide as the published page rather than as wide as the
     * pane it happens to be docked in.
     */
    readonly maxWidth = input<string | null>(null);

    /** See the class docblock — off by default, deliberately. */
    readonly runScripts = input<boolean>(false);

    readonly title = input<string>('Preview');

    @ViewChild('frame') private frameRef?: ElementRef<HTMLIFrameElement>;

    private ready = false;

    constructor() {
        // One effect over every input: any of them changing re-writes the
        // document. Cheap because it only runs after the view exists, and the
        // caller is expected to debounce fast-changing `html`.
        effect(() => {
            const doc = this.buildDocument(this.html(), this.css(), this.js(), this.maxWidth(), this.runScripts());
            if (this.ready) {
                this.write(doc);
            }
        });
    }

    ngAfterViewInit(): void {
        this.ready = true;
        this.write(this.buildDocument(this.html(), this.css(), this.js(), this.maxWidth(), this.runScripts()));
    }

    ngOnDestroy(): void {
        this.ready = false;
    }

    private sandbox(): string {
        // `allow-same-origin` alone: the frame may read same-origin
        // stylesheets, but cannot run scripts, submit forms, navigate the top
        // window or open popups.
        return this.runScripts() ? 'allow-same-origin allow-scripts' : 'allow-same-origin';
    }

    /**
     * Sandbox FIRST, then the document — setting `srcdoc` on a frame whose
     * sandbox has not been applied yet would load that document unsandboxed.
     */
    private write(srcdoc: string): void {
        const el = this.frameRef?.nativeElement;
        if (!el) {
            return;
        }
        el.setAttribute('sandbox', this.sandbox());
        el.setAttribute('title', this.title());
        el.srcdoc = srcdoc;
    }

    private buildDocument(
        html: string,
        css: readonly ContextAsset[],
        js: readonly ContextAsset[],
        maxWidth: string | null,
        runScripts: boolean,
    ): string {
        // `a?.url` and the filter: an asset list arriving in an unexpected
        // shape must not take the whole editor down with it — a preview that
        // renders unstyled beats a dialog that throws.
        const links = (css ?? [])
            .filter(a => !!a?.url)
            .map(a => `<link rel="stylesheet" href="${this.attr(a.url)}">`)
            .join('');
        const scripts = runScripts
            ? (js ?? [])
                .filter(a => !!a?.url)
                .map(a => `<script src="${this.attr(a.url)}" defer></script>`)
                .join('')
            : '';
        // The wrapper carries the width, NOT the body: a theme may style the
        // body itself, and overriding it here would be this surface lying
        // about the theme in the one place it exists to be truthful.
        //
        // Falsy check, not `null ===` (#1767): API-Platform OMITS a null
        // property, so `contentMaxWidth` arrives as `undefined` rather than
        // null and a strict null test let it through to `attr()`, which
        // crashed on `undefined.replace`. Absent and null mean the same thing
        // here — no constraint.
        const wrapperStyle = maxWidth
            ? ` style="max-width:${this.attr(maxWidth)};margin-inline:auto;"`
            : '';

        return [
            '<!doctype html><html><head><meta charset="utf-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1">',
            links,
            '</head><body>',
            `<div class="cms-context-frame__content"${wrapperStyle}>`,
            html,
            '</div>',
            scripts,
            '</body></html>',
        ].join('');
    }

    /** Minimal escaping for values interpolated into an attribute. */
    private attr(value: string): string {
        return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }
}
