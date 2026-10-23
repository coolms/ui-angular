import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CmsSettingsPaneComponent } from './cms-settings-pane.component';
import { CmsSettingsShellComponent, type CmsSettingsSection } from './cms-settings-shell.component';

const SECTIONS: CmsSettingsSection[] = [
    { id: 'call.originate', label: 'Outbound calls', keywords: 'call.originate', group: { id: 'call', label: 'Calls' } },
    { id: 'web.page_cache', label: 'Page cache', keywords: 'web.page_cache', group: { id: 'web', label: 'Web' } },
    { id: 'web.errors', label: 'Error pages', keywords: 'web.errors', group: { id: 'web', label: 'Web' } },
];

@Component({
    standalone: true,
    imports: [CmsSettingsShellComponent, CmsSettingsPaneComponent],
    template: `
        <cms-settings-shell title="Settings" [sections]="sections" [selectedId]="selected()" [filterable]="true"
                            (select)="picked.push($event)">
            <cms-settings-pane title="Page cache" settingKey="web.page_cache" [dirty]="dirty()"
                               (save)="saved = saved + 1" (discard)="discarded = discarded + 1" />
        </cms-settings-shell>
    `,
})
class HostComponent {
    readonly sections = SECTIONS;
    readonly selected = signal<string | null>('web.page_cache');
    readonly dirty = signal(false);
    picked: string[] = [];
    saved = 0;
    discarded = 0;
}

/**
 * The settings shell lists what it is given and says which entry was picked; it never decides the scope. The pane's
 * Save and Discard stay off until it is dirty.
 */
describe('CmsSettingsShellComponent and CmsSettingsPaneComponent', () => {
    function render() {
        TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideRouter([])] });
        const fixture = TestBed.createComponent(HostComponent);
        fixture.detectChanges();

        return fixture;
    }

    const entries = (el: HTMLElement): string[] =>
        Array.from(el.querySelectorAll('.cms-settings-shell__item')).map(b => (b.textContent ?? '').trim());

    it('lists every section under its group, and the filter matches labels, groups and keys', () => {
        const fixture = render();
        const el = fixture.nativeElement as HTMLElement;
        expect(entries(el)).toEqual(['Outbound calls', 'Page cache', 'Error pages']);

        const filter = el.querySelector('input[type=search]') as HTMLInputElement;
        for (const [query, expected] of [['web', ['Page cache', 'Error pages']], ['originate', ['Outbound calls']],
            ['cache', ['Page cache']], ['nothing-like-this', []]] as const) {
            filter.value = query;
            filter.dispatchEvent(new Event('input'));
            fixture.detectChanges();
            expect(entries(el)).withContext(query).toEqual([...expected]);
        }
    });

    it('picking another entry is told to the host; picking the open one is not', () => {
        const fixture = render();
        const el = fixture.nativeElement as HTMLElement;
        const button = (label: string) => Array.from(el.querySelectorAll('.cms-settings-shell__item'))
            .find(b => (b.textContent ?? '').trim() === label) as HTMLButtonElement;

        button('Page cache').click();
        button('Outbound calls').click();

        expect(fixture.componentInstance.picked).toEqual(['call.originate']);
    });

    it('Save and Discard stay off until the pane is dirty, and the key is shown', () => {
        const fixture = render();
        const el = fixture.nativeElement as HTMLElement;
        const button = (label: string) => Array.from(el.querySelectorAll('cms-settings-pane button'))
            .find(b => (b.textContent ?? '').trim() === label) as HTMLButtonElement;

        expect(el.querySelector('cms-settings-pane code')?.textContent).toBe('web.page_cache');
        expect(button('Save').disabled).toBeTrue();
        expect(button('Discard').disabled).toBeTrue();

        fixture.componentInstance.dirty.set(true);
        fixture.detectChanges();
        button('Save').click();
        button('Discard').click();

        expect(button('Save').disabled).toBeFalse();
        expect(fixture.componentInstance.saved).toBe(1);
        expect(fixture.componentInstance.discarded).toBe(1);
    });
});
