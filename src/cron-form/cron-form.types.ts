/**
 * Cron expression presets + serialise / parse / summarise helpers.
 *
 * Matches the backend's 5-field `dragonmantank/cron-expression` shape
 * (`minute hour day-of-month month day-of-week`). Six presets cover the
 * common cases without ever showing the user a raw expression; "Custom"
 * mode opens the field with an inline explainer so it's still
 * approachable.
 *
 * Form state shape mirrors the recurrence form (`<app-recurrence-form>`)
 * so the two components feel siblings to the consumer.
 */

export type CronPresetKey =
    | 'every_minute'   // * * * * *
    | 'hourly'         // 0 * * * *      — every hour at the top of the hour
    | 'daily'          // M H * * *      — daily at HH:MM
    | 'weekly'         // M H * * D      — weekly on weekday at HH:MM
    | 'monthly'        // M H D * *      — monthly on day-of-month at HH:MM
    | 'custom';        // raw user expression

export interface CronFormState {
    preset:     CronPresetKey;
    /** HH:MM — for daily / weekly / monthly. */
    time:       string;
    /** ISO weekday (1=Mon … 7=Sun). Stored as the wire form (`0` = Sun, `1-6` = Mon-Sat) when emitting. */
    weekday:    number;
    /** 1-31 — for monthly. */
    dayOfMonth: number;
    /** Raw 5-field expression for custom mode. */
    expression: string;
}

export interface CronPresetOption {
    key:   CronPresetKey;
    label: string;
}

const WEEKDAY_NAMES = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** Static dropdown options — labels reflect the active form values. */
export function buildPresetOptions(s: CronFormState): CronPresetOption[] {
    return [
        { key: 'every_minute', label: 'Every minute' },
        { key: 'hourly',       label: 'Every hour (top of the hour)' },
        { key: 'daily',        label: `Daily at ${s.time}` },
        { key: 'weekly',       label: `Weekly on ${WEEKDAY_NAMES[s.weekday]} at ${s.time}` },
        { key: 'monthly',      label: `Monthly on the ${ordinalSuffix(s.dayOfMonth)} at ${s.time}` },
        { key: 'custom',       label: 'Custom expression…' },
    ];
}

/** Default form state when there's no incoming expression. Daily at 09:00. */
export function buildDefaultState(): CronFormState {
    return {
        preset:     'daily',
        time:       '09:00',
        weekday:    1,        // Monday
        dayOfMonth: 1,
        expression: '0 9 * * *',
    };
}

/**
 * Serialise the form state into a 5-field cron expression. The
 * resulting string is what the backend's `Cron\CronExpression` parser
 * consumes via `App\Scheduler\Infrastructure\Trigger\CronTrigger`.
 */
export function serialiseCron(s: CronFormState): string {
    const { minute, hour } = parseTime(s.time);
    switch (s.preset) {
        case 'every_minute':
            return '* * * * *';
        case 'hourly':
            return '0 * * * *';
        case 'daily':
            return `${minute} ${hour} * * *`;
        case 'weekly':
            return `${minute} ${hour} * * ${s.weekday}`;
        case 'monthly':
            return `${minute} ${hour} ${s.dayOfMonth} * *`;
        case 'custom':
            return s.expression.trim();
    }
}

/**
 * Best-effort reverse parse: round-trip an existing expression into
 * structured state. When the input doesn't match any preset shape
 * exactly, returns a state with `preset: 'custom'` so the user sees
 * the raw expression and the explainer.
 */
export function parseCron(expression: string | null | undefined): CronFormState {
    const fallback = buildDefaultState();
    if (!expression) return fallback;

    const trimmed = expression.trim();
    if (trimmed === '') return fallback;

    const tokens = trimmed.split(/\s+/);
    if (tokens.length !== 5) {
        return { ...fallback, preset: 'custom', expression: trimmed };
    }
    const [minute, hour, dom, month, dow] = tokens;

    // Every minute.
    if (minute === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
        return { ...fallback, preset: 'every_minute', expression: trimmed };
    }

    // Hourly (every hour at minute 0).
    if (minute === '0' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
        return { ...fallback, preset: 'hourly', expression: trimmed };
    }

    // Daily / weekly / monthly all share fixed minute + hour + */month.
    const fixedMin  = isInt(minute) ? Number.parseInt(minute, 10) : null;
    const fixedHour = isInt(hour)   ? Number.parseInt(hour, 10)   : null;
    if (fixedMin === null || fixedHour === null || month !== '*') {
        return { ...fallback, preset: 'custom', expression: trimmed };
    }
    const time = `${pad(fixedHour)}:${pad(fixedMin)}`;

    // Daily: dom and dow are both wildcards.
    if (dom === '*' && dow === '*') {
        return { ...fallback, preset: 'daily', time, expression: trimmed };
    }
    // Weekly: dom wildcard, dow is a single digit.
    if (dom === '*' && isInt(dow)) {
        const wd = Number.parseInt(dow, 10);
        if (wd >= 0 && wd <= 6) {
            return { ...fallback, preset: 'weekly', time, weekday: wd, expression: trimmed };
        }
    }
    // Monthly: dom is a single digit, dow wildcard.
    if (dow === '*' && isInt(dom)) {
        const d = Number.parseInt(dom, 10);
        if (d >= 1 && d <= 31) {
            return { ...fallback, preset: 'monthly', time, dayOfMonth: d, expression: trimmed };
        }
    }

    return { ...fallback, preset: 'custom', expression: trimmed };
}

/**
 * One-line human-readable summary. Used for the dropdown label when the
 * spec is `custom`, and as a sanity check on user input.
 */
export function summariseCron(expression: string | null | undefined): string {
    if (!expression || expression.trim() === '') return '(no schedule)';
    const trimmed = expression.trim();
    const tokens = trimmed.split(/\s+/);
    if (tokens.length !== 5) return trimmed;
    const [minute, hour, dom, month, dow] = tokens;

    if (minute === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
        return 'Every minute';
    }
    if (minute === '0' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
        return 'Every hour (top of the hour)';
    }
    if (month === '*' && isInt(minute) && isInt(hour)) {
        const time = `${pad(Number.parseInt(hour, 10))}:${pad(Number.parseInt(minute, 10))}`;
        if (dom === '*' && dow === '*') {
            return `Daily at ${time}`;
        }
        if (dom === '*') {
            // Weekly. Support single digit, range, or list.
            const dowSummary = humaniseWeekdayField(dow);
            if (dowSummary) return `${dowSummary} at ${time}`;
        }
        if (dow === '*' && isInt(dom)) {
            return `Monthly on the ${ordinalSuffix(Number.parseInt(dom, 10))} at ${time}`;
        }
    }

    // */N every-N forms surface as a short prefix.
    const stepMin = minute.match(/^\*\/(\d+)$/);
    if (stepMin && hour === '*' && dom === '*' && month === '*' && dow === '*') {
        return `Every ${stepMin[1]} minutes`;
    }
    const stepHour = hour.match(/^\*\/(\d+)$/);
    if (minute === '0' && stepHour && dom === '*' && month === '*' && dow === '*') {
        return `Every ${stepHour[1]} hours`;
    }

    return trimmed;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function isInt(s: string): boolean {
    return /^-?\d+$/.test(s);
}

function pad(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

function parseTime(t: string): { minute: number; hour: number } {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return { minute: 0, hour: 9 };
    return { hour: Number.parseInt(m[1], 10), minute: Number.parseInt(m[2], 10) };
}

function ordinalSuffix(n: number): string {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    switch (n % 10) {
        case 1:  return `${n}st`;
        case 2:  return `${n}nd`;
        case 3:  return `${n}rd`;
        default: return `${n}th`;
    }
}

function humaniseWeekdayField(field: string): string | null {
    // Single digit
    if (isInt(field)) {
        const n = Number.parseInt(field, 10);
        if (n >= 0 && n <= 6) return `Weekly on ${WEEKDAY_NAMES[n]}`;
        return null;
    }
    // Range
    const range = field.match(/^(\d)-(\d)$/);
    if (range) {
        const a = Number.parseInt(range[1], 10);
        const b = Number.parseInt(range[2], 10);
        if (a === 1 && b === 5) return 'Weekdays';
        if (a === 6 && b === 0) return 'Weekends';   // Sat-Sun in some dialects
        if (a >= 0 && b <= 6 && a <= b) {
            return `${WEEKDAY_NAMES[a]}–${WEEKDAY_NAMES[b]}`;
        }
    }
    // List
    if (/^[0-6](,[0-6])+$/.test(field)) {
        const names = field.split(',').map(t => WEEKDAY_NAMES[Number.parseInt(t, 10)]);
        return `Weekly on ${names.join(', ')}`;
    }
    return null;
}
