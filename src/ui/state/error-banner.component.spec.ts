import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { of } from 'rxjs';
import { ELEVATION_REQUIRED_HEADER, ELEVATION_REQUIRED_PROBLEM_TYPE, ElevationService } from '@coolms/core-angular';
import { ErrorBannerComponent, RELOAD_PAGE } from './error-banner.component';

/**
 * Given the failure, the banner shows a refusal for want of elevation as the Elevate state, and asks its host to
 * load again once the session is elevated. Any other failure, or none given, is the banner as before.
 */
describe('ErrorBannerComponent', () => {
    let fixture: ComponentFixture<ErrorBannerComponent>;
    let retried: number;

    let reloaded: number;

    function setup(error: unknown, withShell = false, granted = true): void {
        reloaded = 0;
        TestBed.configureTestingModule({
            imports: [ErrorBannerComponent],
            providers: [
                {
                    provide: ElevationService,
                    useValue: { offerFor: () => of(granted), elevated: () => granted, available: true },
                },
                ...(withShell ? [{ provide: RELOAD_PAGE, useValue: () => { reloaded++; } }] : []),
            ],
        });
        fixture = TestBed.createComponent(ErrorBannerComponent);
        fixture.componentRef.setInput('message', 'You don\'t have access to this.');
        fixture.componentRef.setInput('error', error);
        retried = 0;
        fixture.componentInstance.retry.subscribe(() => retried++);
        fixture.detectChanges();
    }

    const el = (sel: string): HTMLElement | null => fixture.nativeElement.querySelector(sel);

    it('shows the Elevate state for a refusal by its problem type, and asks to load again after Elevate', () => {
        setup(new HttpErrorResponse({ status: 403, error: { type: ELEVATION_REQUIRED_PROBLEM_TYPE } }));

        expect(el('[data-test="error-banner-elevation-required"]')).not.toBeNull();
        expect(el('.cms-error-banner')).toBeNull();

        (el('[data-test="elevate"]') as HTMLButtonElement).click();
        expect(retried).toBe(1);
    });

    it('loads the page again after Elevate where the shell provides that, instead of asking its host', () => {
        setup(new HttpErrorResponse({ status: 403, error: { type: ELEVATION_REQUIRED_PROBLEM_TYPE } }), true);

        (el('[data-test="elevate"]') as HTMLButtonElement).click();
        expect(reloaded).toBe(1);
        expect(retried).toBe(0);
    });

    it('neither reloads the page nor asks its host when the elevation is cancelled, and keeps the Elevate state', () => {
        setup(new HttpErrorResponse({ status: 403, error: { type: ELEVATION_REQUIRED_PROBLEM_TYPE } }), true, false);

        (el('[data-test="elevate"]') as HTMLButtonElement).click();
        fixture.detectChanges();

        expect(reloaded).toBe(0);
        expect(retried).toBe(0);
        expect(el('[data-test="error-banner-elevation-required"]')).not.toBeNull();
    });

    it('shows the Elevate state for a refusal by its header', () => {
        setup(new HttpErrorResponse({
            status: 403, headers: new HttpHeaders({ [ELEVATION_REQUIRED_HEADER]: 'identity.administrator_role' }),
        }));

        expect(el('[data-test="error-banner-elevation-required"]')).not.toBeNull();
    });

    it('shows the banner for another 403', () => {
        setup(new HttpErrorResponse({ status: 403, error: { type: '/errors/403' } }));

        expect(el('[data-test="error-banner-elevation-required"]')).toBeNull();
        expect(el('.cms-error-banner')?.textContent).toContain('You don\'t have access to this.');
    });

    it('shows the banner when no failure is given', () => {
        setup(null);

        expect(el('.cms-error-banner')).not.toBeNull();
        expect(el('[data-test="error-banner-elevation-required"]')).toBeNull();
    });
});
