import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ElevationService } from '@coolms/core-angular';
import { CmsListPageComponent } from '../cms-list-page.component';
import { PAGE_CLOSURE, type PageClosure } from './page-closure';
import { StateComponent } from './state.component';

/**
 * A state asking for elevation in place of content closes the page while it is shown, and opens it again when it
 * changes or goes; a list page leaves out its count while the page is closed.
 */
describe('PAGE_CLOSURE', () => {
    let closers: Set<object>;
    let closure: PageClosure;

    beforeEach(() => {
        closers = new Set();
        const count = signal(0);
        closure = {
            closed: computed(() => count() > 0),
            close: (by) => { closers.add(by); count.set(closers.size); },
            open: (by) => { closers.delete(by); count.set(closers.size); },
        };
        TestBed.configureTestingModule({
            imports: [StateComponent, CmsListPageComponent],
            providers: [
                { provide: PAGE_CLOSURE, useValue: closure },
                { provide: ElevationService, useValue: { offerFor: () => of(true), elevated: () => false, available: true } },
            ],
        });
    });

    it('closes the page while a state asks for elevation, and opens it when the state changes or goes', () => {
        const fixture = TestBed.createComponent(StateComponent);
        fixture.componentRef.setInput('kind', 'elevation-required');
        fixture.componentRef.setInput('title', 'This list needs an elevated session');
        fixture.detectChanges();
        expect(closure.closed()).toBeTrue();

        fixture.componentRef.setInput('kind', 'empty');
        fixture.detectChanges();
        expect(closure.closed()).withContext('another kind').toBeFalse();

        fixture.componentRef.setInput('kind', 'elevation-required');
        fixture.detectChanges();
        expect(closure.closed()).toBeTrue();
        fixture.destroy();
        expect(closure.closed()).withContext('gone').toBeFalse();
    });

    it('leaves the page open for every other kind', () => {
        for (const kind of ['empty', 'error', 'loading', 'denied'] as const) {
            const fixture = TestBed.createComponent(StateComponent);
            fixture.componentRef.setInput('kind', kind);
            fixture.componentRef.setInput('title', 'A state');
            fixture.detectChanges();
            expect(closure.closed()).withContext(kind).toBeFalse();
            fixture.destroy();
        }
    });

    it('a list page leaves out its count while the page is closed', () => {
        const fixture = TestBed.createComponent(CmsListPageComponent);
        fixture.componentRef.setInput('title', 'Users');
        fixture.componentRef.setInput('footerCount', '0 users');
        fixture.detectChanges();
        const footer = () => (fixture.nativeElement as HTMLElement).querySelector('.cms-list-page__footer');
        expect(footer()?.textContent?.trim()).toBe('0 users');

        closure.close({});
        fixture.detectChanges();
        expect(footer()).withContext('closed').toBeNull();
    });
});
