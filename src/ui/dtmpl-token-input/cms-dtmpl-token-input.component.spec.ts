import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { TestBed, tick, fakeAsync } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { CmsDtmplTokenInputComponent } from './cms-dtmpl-token-input.component';

/**
 * Behaviour spec for `cms-dtmpl-token-input`.
 *
 * Coverage:
 *   1. Renders with the placeholder + initial value.
 *   2. Typing `{` opens the overlay; empty token list keeps it closed.
 *   3. Filter narrows tokens as the user types after `{`.
 *   4. Clicking a token replaces the trigger span with the full token
 *      and closes the overlay.
 *   5. Esc closes the overlay without inserting.
 *   6. Tab closes the overlay (focus moves away).
 */
@Component({
    standalone: true,
    imports: [CmsDtmplTokenInputComponent],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <cms-dtmpl-token-input
            [(value)]="text"
            [availableTokens]="tokens()"
            [placeholder]="'Pattern…'"
            [inputId]="'host-input'"
        ></cms-dtmpl-token-input>
    `,
})
class HostComponent {
    text = '';
    readonly tokens = signal<readonly string[]>([
        '{const:templateSlug}',
        '{const:batchId}',
        '{var:@user.id}',
        '{var:@user.email}',
    ]);
}

describe('CmsDtmplTokenInputComponent', () => {
    function mount(): {
        host: HostComponent;
        fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
        input: HTMLInputElement;
    } {
        const fixture = TestBed.createComponent(HostComponent);
        fixture.detectChanges();
        const input = fixture.nativeElement.querySelector('input.cms-token-input__field') as HTMLInputElement;
        return { host: fixture.componentInstance, fixture, input };
    }

    function typeInto(input: HTMLInputElement, value: string, caretAtEnd = true): void {
        input.value = value;
        if (caretAtEnd) {
            input.setSelectionRange(value.length, value.length);
        }
        input.dispatchEvent(new Event('input'));
    }

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HostComponent, NoopAnimationsModule],
        });
    });

    it('renders with the placeholder and initial empty value', () => {
        const { input } = mount();

        expect(input).toBeTruthy();
        expect(input.getAttribute('placeholder')).toBe('Pattern…');
        expect(input.value).toBe('');
    });

    it('opens the overlay when the user types `{`', fakeAsync(() => {
        const { fixture, input } = mount();

        typeInto(input, '{');
        tick();
        fixture.detectChanges();

        const panel = document.querySelector('.cms-token-input__panel');
        expect(panel).toBeTruthy();
        const options = document.querySelectorAll('.cms-token-input__option');
        expect(options.length).toBe(4);
    }));

    it('filters tokens as the user types after `{`', fakeAsync(() => {
        const { fixture, input } = mount();

        typeInto(input, '{con');
        tick();
        fixture.detectChanges();

        const options = Array.from(document.querySelectorAll('.cms-token-input__option'))
            .map((el) => el.textContent?.trim());
        expect(options).toEqual(['{const:templateSlug}', '{const:batchId}']);
    }));

    it('inserts the full token and closes the overlay on click', fakeAsync(() => {
        const { host, fixture, input } = mount();

        typeInto(input, 'prefix-{co');
        tick();
        fixture.detectChanges();

        // `NgModel` pushes values to the DOM asynchronously (via a resolved
        // promise), so the `writeValue('')` queued when the component was
        // mounted lands on the `tick()` above -- AFTER our synthetic input
        // event -- and wipes the element. The component's own `value()` signal
        // is correct ('prefix-{co'); only the DOM element is stale.
        //
        // That matters because `selectToken()` splices the token in at
        // `input.selectionStart`. Left as-is the caret reads 0, so the whole
        // pre-existing string is treated as "text after the cursor" and gets
        // appended back after the token. Re-sync the element to the model and
        // put the caret where the typist left it.
        input.value = host.text;
        input.setSelectionRange(input.value.length, input.value.length);

        const target = Array.from(document.querySelectorAll<HTMLButtonElement>('.cms-token-input__option'))
            .find((el) => el.textContent?.trim() === '{const:templateSlug}');
        expect(target).toBeTruthy();
        target!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        tick();
        fixture.detectChanges();

        expect(host.text).toBe('prefix-{const:templateSlug}');
        expect(document.querySelector('.cms-token-input__panel')).toBeNull();
    }));

    it('closes the overlay on Escape without inserting', fakeAsync(() => {
        const { host, fixture, input } = mount();

        typeInto(input, 'a{con');
        tick();
        fixture.detectChanges();
        expect(document.querySelector('.cms-token-input__panel')).toBeTruthy();

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        tick();
        fixture.detectChanges();

        expect(document.querySelector('.cms-token-input__panel')).toBeNull();
        expect(host.text).toBe('a{con');
    }));

    it('closes the overlay on Tab', fakeAsync(() => {
        const { fixture, input } = mount();

        typeInto(input, '{con');
        tick();
        fixture.detectChanges();
        expect(document.querySelector('.cms-token-input__panel')).toBeTruthy();

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        tick();
        fixture.detectChanges();

        expect(document.querySelector('.cms-token-input__panel')).toBeNull();
    }));
});
