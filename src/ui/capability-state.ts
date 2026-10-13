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
