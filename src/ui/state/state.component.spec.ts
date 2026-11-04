import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { ELEVATION_REQUIRED_PROBLEM_TYPE, ElevationService } from '@coolms/core-angular';
import { RELOAD_PAGE } from './error-banner.component';
import { LoadingComponent } from './loading.component';
import { StateComponent, StateKind, StatePlacement } from './state.component';

/**
 * The state component: every kind in every placement is a polite status naming its title; loading turns a spinner
 * (never a glyph) that waits for the delay before it is seen; an action is offered as given; an error refused for want
 * of elevation is the elevation state, whose Elevate loads the page again or tells its host.
 */
describe('StateComponent', () => {
    let fixture: ComponentFixture<StateComponent>;
    let reloaded: number;
    let elevatedOut: number;

    function setup(
        kind: StateKind,
        inputs: Record<string, unknown> = {},
        opts: { withShell?: boolean; granted?: boolean; available?: boolean } = {},
    ): void {
        reloaded = 0;
        elevatedOut = 0;
        const granted = opts.granted ?? true;
        TestBed.configureTestingModule({
            imports: [StateComponent],
            providers: [
                {
                    provide: ElevationService,
                    useValue: { offerFor: () => of(granted), elevated: () => granted, available: opts.available ?? true },
                },
                ...(opts.withShell ? [{ provide: RELOAD_PAGE, useValue: () => { reloaded++; } }] : []),
            ],
        });
        fixture = TestBed.createComponent(StateComponent);
        fixture.componentRef.setInput('kind', kind);
        fixture.componentRef.setInput('title', 'The title');
        for (const [name, value] of Object.entries(inputs)) {
            fixture.componentRef.setInput(name, value);
        }
        fixture.componentInstance.elevated.subscribe(() => elevatedOut++);
        fixture.detectChanges();
    }

    const el = (sel: string): HTMLElement | null => fixture.nativeElement.querySelector(sel);
    const refusal = (): HttpErrorResponse =>
        new HttpErrorResponse({ status: 403, error: { type: ELEVATION_REQUIRED_PROBLEM_TYPE } });

    it('is a polite status naming its title and description, in each kind and placement', () => {
        const kinds: StateKind[] = ['loading', 'empty', 'error', 'denied', 'elevation-required'];
        const placements: StatePlacement[] = ['page', 'block', 'inline'];
        for (const kind of kinds) {
            for (const placement of placements) {
                TestBed.resetTestingModule();
                setup(kind, { placement, description: 'Why it is so.' });
                const box = el('.cms-state')!;
                expect(box.getAttribute('role')).withContext(`${kind}/${placement}`).toBe('status');
                expect(box.getAttribute('aria-live')).toBe('polite');
                expect(box.classList).toContain(`cms-state--${placement}`);
                expect(box.getAttribute('data-kind')).toBe(kind);
                expect(box.textContent).toContain('The title');
                expect(box.textContent).toContain('Why it is so.');
            }
        }
    });

    it('turns a spinner for loading, never a glyph, and waits the delay before it is seen', () => {
        setup('loading');

        expect(el('[data-test="state-spinner"]')).not.toBeNull();
        expect(el('.cms-state__icon')).toBeNull();
        const box = getComputedStyle(el('.cms-state')!);
        expect(box.animationName).toContain('cms-state-appear');
        expect(box.animationDelay).toBe('0.3s');
    });

    it('offers the action it is given, and runs it on a press', () => {
        let ran = 0;
        setup('error', { action: { label: 'Retry', run: () => ran++ } });

        const button = el('[data-test="state-action"]') as HTMLButtonElement;
        expect(button.textContent?.trim()).toBe('Retry');
        button.click();
        expect(ran).toBe(1);
        expect(el('[data-test="elevate"]')).toBeNull();
    });

    it('shows an error refused for want of elevation as the elevation state, and loads the page again after Elevate', () => {
        setup('error', { error: refusal(), action: { label: 'Retry', run: () => undefined } }, { withShell: true });

        expect(el('.cms-state')!.getAttribute('data-kind')).toBe('elevation-required');
        expect(el('[data-test="state-action"]')).toBeNull();
        (el('[data-test="elevate"]') as HTMLButtonElement).click();
        expect(reloaded).toBe(1);
        expect(elevatedOut).toBe(0);
    });

    it('shows an error that is a plain refusal (403) as denied, with no Retry: retrying would be refused again', () => {
        setup('error', {
            error: new HttpErrorResponse({ status: 403, error: { title: 'Forbidden' } }),
            action: { label: 'Retry', run: () => undefined },
        });

        expect(el('.cms-state')!.getAttribute('data-kind')).toBe('denied');
        expect(el('[data-test="state-action"]')).toBeNull();
        expect(el('[data-test="elevate"]')).toBeNull();
    });

    it('tells its host once elevated where there is no page to load again; a cancelled prompt does neither', () => {
        setup('elevation-required');
        (el('[data-test="elevate"]') as HTMLButtonElement).click();
        expect(elevatedOut).toBe(1);

        TestBed.resetTestingModule();
        setup('elevation-required', {}, { granted: false });
        (el('[data-test="elevate"]') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(elevatedOut).toBe(0);
        expect(el('[data-test="elevation-unavailable"]')).toBeNull();
    });

    it('says elevation is not available here when the installation cannot elevate', () => {
        setup('elevation-required', {}, { granted: false, available: false });

        (el('[data-test="elevate"]') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(el('[data-test="elevation-unavailable"]')).not.toBeNull();
        expect(elevatedOut).toBe(0);
    });
});

/** `app-loading`, kept under its old name, is the state component's loading state: every page that names it draws it. */
describe('LoadingComponent', () => {
    it('draws the loading state with its label as the title, and the spinner, never the old mark', () => {
        TestBed.configureTestingModule({ imports: [LoadingComponent] });
        const fixture = TestBed.createComponent(LoadingComponent);
        fixture.componentRef.setInput('label', 'Loading draft…');
        fixture.detectChanges();
        const host = fixture.nativeElement as HTMLElement;

        const state = host.querySelector('cms-state .cms-state');
        expect(state).not.toBeNull();
        expect(state!.getAttribute('data-kind')).toBe('loading');
        expect(state!.getAttribute('role')).toBe('status');
        expect(state!.textContent).toContain('Loading draft…');
        expect(host.querySelector('[data-test="state-spinner"]')).not.toBeNull();
        expect(host.querySelector('cms-loader')).toBeNull();
    });
});
