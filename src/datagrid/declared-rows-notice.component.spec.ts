import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ElevationService } from '@coolms/core-angular';
import { DeclaredRowsNoticeComponent } from './declared-rows-notice.component';
import type { DeclaredRowsAvailability, DeclaredRowsSource } from './declared-rows.source';

/**
 * The notice a list page shows for its grid's declared rows: locked, not available, or the server's words -- and
 * nothing at all while the rows are simply there.
 */
describe('DeclaredRowsNoticeComponent', () => {
    function shown(availability: DeclaredRowsAvailability, error: string | null = null): HTMLElement {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            imports: [DeclaredRowsNoticeComponent],
            providers: [{ provide: ElevationService, useValue: { offerFor: () => undefined, elevated: () => false } }],
        });
        const fixture = TestBed.createComponent(DeclaredRowsNoticeComponent);
        fixture.componentRef.setInput('source', {
            availability: signal(availability),
            error: signal(error),
        } as unknown as DeclaredRowsSource);
        fixture.detectChanges();

        return fixture.nativeElement as HTMLElement;
    }

    it('offers elevation for a list allowed once elevated', () => {
        const host = shown('elevate');
        expect(host.querySelector('[data-test="rows-elevate"]')).not.toBeNull();
        expect(host.querySelector('[data-test="elevate"]')).not.toBeNull();
        expect(host.querySelector('[data-test="rows-denied"]')).toBeNull();
    });

    it('says a refused list is not available, and offers no elevation', () => {
        const host = shown('denied');
        expect(host.querySelector('[data-test="rows-denied"]')?.textContent).toContain('Not available to you');
        expect(host.querySelector('[data-test="elevate"]')).toBeNull();
    });

    it('shows the server\'s words for an undeclared list or a failed fetch', () => {
        expect(shown('undeclared', 'This list does not say where its rows come from.')
            .querySelector('[data-test="rows-error"]')?.textContent).toContain('does not say where its rows come from');
        expect(shown('allowed', 'Refused: not yours.')
            .querySelector('[data-test="rows-error"]')?.textContent).toContain('Refused: not yours.');
    });

    it('shows nothing while the rows are simply there', () => {
        const host = shown('allowed');
        expect(host.textContent?.trim()).toBe('');
    });
});
