/**
 * What a declared action comes to for the signed-in caller on one subject, as the server answers it --
 * a subject's own `capabilities` map, or GET /api/v1/capabilities: `allowed`, `elevate` (allowed once the
 * session is elevated) or `denied`.
 *
 * Every client of the server keeps the same contract for it, and this file is the Angular half of that
 * contract for a navi node that names a `capability`:
 *
 * - PRESENCE is the graph's. A node the server withholds never reaches a page; nothing here hides one.
 * - STATE is the subjects'. Across a selection the LEAST state wins (denied < elevate < allowed): one
 *   subject the caller may not touch makes the action unavailable for the selection.
 * - It is a snapshot. A page re-reads its subjects when elevation is granted, dropped or expires, and the
 *   refusal stays the last word: `allowed` is the permission answer, never a promise.
 */
export type CapabilityState = 'allowed' | 'elevate' | 'denied';

/**
 * The page-context key a page publishes its selection's states under -- the result of
 * {@link leastCapabilities} -- for the nodes that name a `capability` to read.
 */
export const CAPABILITIES_CONTEXT_KEY = '_capabilities';

const RANK: Readonly<Record<CapabilityState, number>> = { denied: 0, elevate: 1, allowed: 2 };

function isPlainMap(value: unknown): value is Record<string, unknown> {
    return null !== value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A subject's answer, or null when it carries none: no map, or an empty one. An empty map arrives as JSON
 * `[]` -- an ARRAY -- so the test is "an object with keys", never "an object". A subject with no answer is
 * one the refusal decides, as before the server answered at all.
 */
function answerOf(subject: { readonly capabilities?: unknown }): Record<string, unknown> | null {
    const map = subject.capabilities;

    return isPlainMap(map) && Object.keys(map).length > 0 ? map : null;
}

/**
 * One action's state in an answer. The server lists every declared action of the subject's kind, so a key
 * the answer lacks is `denied`; so is a value this client does not recognise -- a consistent no, rather
 * than an offer the server may refuse.
 */
function stateIn(answer: Record<string, unknown>, action: string): CapabilityState {
    const value = Object.prototype.hasOwnProperty.call(answer, action) ? answer[action] : undefined;

    return 'allowed' === value || 'elevate' === value || 'denied' === value ? value : 'denied';
}

/**
 * The least state of each action across the given subjects, or undefined when none of them carries an
 * answer. Subjects without one do not vote: their refusal, if any, comes when the action runs.
 */
export function leastCapabilities(
    subjects: ReadonlyArray<{ readonly capabilities?: unknown }>,
): Record<string, CapabilityState> | undefined {
    const answers = subjects.map(answerOf).filter((a): a is Record<string, unknown> => null !== a);
    if (0 === answers.length) {
        return undefined;
    }

    const actions = new Set<string>();
    for (const answer of answers) {
        Object.keys(answer).forEach(action => actions.add(action));
    }

    const least: Record<string, CapabilityState> = {};
    for (const action of actions) {
        least[action] = answers
            .map(answer => stateIn(answer, action))
            .reduce((a, b) => (RANK[b] < RANK[a] ? b : a));
    }

    return least;
}

/**
 * How many subjects of a selection refuse one action (`denied`), out of how many are selected -- the words
 * a disabled action shows, so the person knows it is the selection, not the action, that says no.
 */
export interface CapabilityRefusal {
    readonly refused: number;
    readonly of: number;
}

/**
 * The page-context key a page publishes its selection's refusals under -- the result of
 * {@link capabilityRefusals} -- beside {@link CAPABILITIES_CONTEXT_KEY}.
 */
export const CAPABILITY_REFUSALS_CONTEXT_KEY = '_capabilityRefusals';

/**
 * Per action, how many of the subjects answer `denied`, out of every subject selected; only the actions
 * at least one refuses. Undefined when none of them carries an answer. A subject without an answer is
 * counted in `of` but never in `refused`: it does not vote.
 */
export function capabilityRefusals(
    subjects: ReadonlyArray<{ readonly capabilities?: unknown }>,
): Record<string, CapabilityRefusal> | undefined {
    const answers = subjects.map(answerOf).filter((a): a is Record<string, unknown> => null !== a);
    if (0 === answers.length) {
        return undefined;
    }

    const actions = new Set<string>();
    for (const answer of answers) {
        Object.keys(answer).forEach(action => actions.add(action));
    }

    const refusals: Record<string, CapabilityRefusal> = {};
    for (const action of actions) {
        const refused = answers.filter(answer => 'denied' === stateIn(answer, action)).length;
        if (refused > 0) {
            refusals[action] = { refused, of: subjects.length };
        }
    }

    return refusals;
}

/**
 * The two context entries a page publishes for its selection, to spread into the context: the least state
 * of each action ({@link leastCapabilities}) and how many subjects refuse it ({@link capabilityRefusals}).
 */
export function capabilityContext(
    subjects: ReadonlyArray<{ readonly capabilities?: unknown }>,
): Record<string, unknown> {
    return {
        [CAPABILITIES_CONTEXT_KEY]:        leastCapabilities(subjects),
        [CAPABILITY_REFUSALS_CONTEXT_KEY]: capabilityRefusals(subjects),
    };
}

/**
 * Why a node naming a `capability` is disabled, in words: how many of the selection refuse it. A context
 * without the count (a page that publishes only the states) still answers "not allowed".
 */
export function refusalPhraseOf(
    meta: Readonly<Record<string, unknown>>,
    context: Readonly<Record<string, unknown>>,
): string {
    const action = meta['capability'];
    const refusals = context[CAPABILITY_REFUSALS_CONTEXT_KEY];
    const refusal = typeof action === 'string' && isPlainMap(refusals)
        && Object.prototype.hasOwnProperty.call(refusals, action)
        ? refusals[action] as Partial<CapabilityRefusal>
        : undefined;
    const refused = typeof refusal?.refused === 'number' ? refusal.refused : 0;
    const of = typeof refusal?.of === 'number' ? refusal.of : 0;

    if (refused <= 0 || of <= 0) {
        return 'not allowed';
    }
    if (1 === of) {
        return 'not allowed for the selected item';
    }

    return `not allowed for ${refused} of ${of} selected items`;
}

/**
 * The state of a node that names a `capability`, under the page's context; undefined when the node names
 * none or the context carries no answer -- the node then behaves as it did before capabilities existed.
 */
export function capabilityStateOf(
    meta: Readonly<Record<string, unknown>>,
    context: Readonly<Record<string, unknown>>,
): CapabilityState | undefined {
    const action = meta['capability'];
    if (typeof action !== 'string' || '' === action) {
        return undefined;
    }
    const states = context[CAPABILITIES_CONTEXT_KEY];

    return isPlainMap(states) && Object.keys(states).length > 0 ? stateIn(states, action) : undefined;
}
