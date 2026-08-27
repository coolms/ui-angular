import {
    Component, input, computed, signal, inject, DestroyRef,
    ChangeDetectionStrategy, ViewEncapsulation, OnInit,
} from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';

import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FieldItem } from '@coolms/core-angular';
/** A libphonenumber region row from GET /api/v1/phone/countries, + a localized name. */
interface PhoneCountry {
    readonly iso:     string;
    readonly dial:    number;
    readonly example: string | null;
    readonly name:    string;
}

/**
 * The `intlPhone` composite field: a country <select> (localized names via the
 * browser's Intl.DisplayNames + dial codes/example masks fetched from
 * /api/v1/phone/countries) plus a masked number input. The two sub-controls
 * compose a SINGLE E.164 string (`+{dial}{nationalDigits}`) that flows into the
 * form control at `item.alias` — the same shape a plain text field produces, so
 * the backend's IntlPhoneType / PhoneNumber constraint validates it unchanged.
 */
@Component({
    selector: 'app-intl-phone-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    imports: [ReactiveFormsModule],
    template: `
        <div class="form-group">
            <label [for]="item().alias + '-number'" class="form-label">
                {{ item().label }}
                @if (item().required) { <span class="text-danger">*</span> }
            </label>

            <div class="input-group">
                <select
                    class="form-select coolms-intl-phone-country"
                    style="max-width: 11rem;"
                    [value]="selectedIso()"
                    (change)="onCountryChange($event)"
                    [attr.aria-label]="'Country code'"
                >
                    <option value="">— Country —</option>
                    @for (c of countries(); track c.iso) {
                        <option [value]="c.iso">{{ c.name }} (+{{ c.dial }})</option>
                    }
                </select>
                <input
                    [id]="item().alias + '-number'"
                    type="tel"
                    inputmode="tel"
                    autocomplete="tel"
                    class="form-control cms-input"
                    [class.is-invalid]="isInvalid()"
                    [value]="nationalNumber()"
                    [placeholder]="numberPlaceholder()"
                    (input)="onNumberInput($event)"
                />
            </div>

            @if (loading()) {
                <div class="form-text text-muted">Loading countries…</div>
            }
            @if (item().hint) {
                <div class="form-text text-muted">{{ item().hint }}</div>
            }
            @if (isInvalid()) {
                <div class="invalid-feedback d-block">{{ errorMessage() }}</div>
            }
            @if (e164()) {
                <div class="form-text text-muted">{{ e164() }}</div>
            }
        </div>
    `,
})
export class IntlPhoneFieldComponent implements OnInit {
    item      = input.required<FieldItem>();
    formGroup = input.required<FormGroup>();

    private readonly http       = inject(HttpClient);
    private readonly destroyRef = inject(DestroyRef);

    readonly countries      = signal<PhoneCountry[]>([]);
    readonly loading        = signal(false);
    readonly selectedIso    = signal('');
    readonly nationalNumber = signal('');

    readonly control = computed(() => this.formGroup().get(this.item().alias) as FormControl | null);

    readonly e164 = computed(() => this.compose(this.selectedIso(), this.nationalNumber()));

    readonly numberPlaceholder = computed(() => {
        const c = this.selectedCountry();
        return c?.example ?? this.item().placeholder ?? '';
    });

    readonly isInvalid = computed(() => {
        const c = this.control();
        return !!c && c.invalid && c.touched;
    });

    readonly errorMessage = computed(() => {
        const errors = this.control()?.errors;
        if (!errors) return '';
        if (errors['server'])   return errors['server'] as string;
        if (errors['required']) return `${this.item().label} is required`;
        return 'Enter a valid phone number';
    });

    ngOnInit(): void {
        this.loadCountries();
    }

    onCountryChange(event: Event): void {
        this.selectedIso.set((event.target as HTMLSelectElement).value);
        this.reformatAndWrite();
    }

    onNumberInput(event: Event): void {
        const raw = (event.target as HTMLInputElement).value;
        const digits = raw.replace(/\D/g, '');
        this.nationalNumber.set(this.applyMask(digits, this.maskTemplate(this.selectedCountry()?.example)));
        this.writeControl();
    }

    private selectedCountry(): PhoneCountry | undefined {
        const iso = this.selectedIso();
        return this.countries().find(c => c.iso === iso);
    }

    private loadCountries(): void {
        this.loading.set(true);
        this.http
            .get<Record<string, unknown>>('/api/v1/phone/countries', {
                headers: { Accept: 'application/ld+json' },
            })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: res => {
                    const members = (res['member'] ?? res['hydra:member'] ?? []) as Array<Record<string, unknown>>;
                    const rows = members.map<PhoneCountry>(m => {
                        const iso = String(m['iso'] ?? '');
                        return {
                            iso,
                            dial:    Number(m['dial'] ?? 0),
                            example: m['example'] != null ? String(m['example']) : null,
                            name:    this.regionName(iso),
                        };
                    });
                    rows.sort((a, b) => a.name.localeCompare(b.name));
                    this.countries.set(rows);
                    this.loading.set(false);
                    this.hydrateFromControl();
                },
                error: () => this.loading.set(false),
            });
    }

    /** Localise the region name client-side (no dataset round-trip); fall back to the ISO. */
    private regionName(iso: string): string {
        try {
            const dn = new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' });
            return dn.of(iso) ?? iso;
        } catch {
            return iso;
        }
    }

    /** Split an existing E.164 value back into country + national once the list is loaded. */
    private hydrateFromControl(): void {
        const value = this.control()?.value;
        if (typeof value !== 'string' || !value.startsWith('+') || this.selectedIso()) {
            return;
        }
        const digits = value.slice(1);
        // Longest dial prefix wins (e.g. +1 vs +1242).
        const match = [...this.countries()]
            .sort((a, b) => String(b.dial).length - String(a.dial).length)
            .find(c => digits.startsWith(String(c.dial)));
        if (match) {
            this.selectedIso.set(match.iso);
            const national = digits.slice(String(match.dial).length);
            this.nationalNumber.set(this.applyMask(national, this.maskTemplate(match.example)));
        }
    }

    private reformatAndWrite(): void {
        // Re-apply the new country's mask to the existing digits, then write.
        const digits = this.nationalNumber().replace(/\D/g, '');
        this.nationalNumber.set(this.applyMask(digits, this.maskTemplate(this.selectedCountry()?.example)));
        this.writeControl();
    }

    private writeControl(): void {
        const c = this.control();
        if (!c) return;
        c.setValue(this.compose(this.selectedIso(), this.nationalNumber()));
        c.markAsDirty();
    }

    private compose(iso: string, national: string): string | null {
        const dial = this.countries().find(c => c.iso === iso)?.dial;
        const digits = national.replace(/\D/g, '');
        if (!dial || !digits) return null;
        return `+${dial}${digits}`;
    }

    /** "044 668 18 00" → "### ### ## ##" (digits → #, separators preserved). */
    private maskTemplate(example: string | null | undefined): string {
        return example ? example.replace(/\d/g, '#') : '';
    }

    /** Lay digits into the mask template; overflow digits are appended verbatim. */
    private applyMask(digits: string, template: string): string {
        if (!template) return digits;
        let out = '';
        let di = 0;
        for (const ch of template) {
            if (di >= digits.length) break;
            if (ch === '#') { out += digits[di++]; } else { out += ch; }
        }
        if (di < digits.length) out += digits.slice(di);
        return out;
    }
}
