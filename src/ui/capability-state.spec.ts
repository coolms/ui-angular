import { capabilityStateOf, leastCapabilities } from './capability-state';

/**
 * The client half of the capability answer: how a selection's subjects
 * become one state per action, and how a node naming a `capability` reads it. Pure functions -- the
 * toolbar and the context menu specs pin what they draw from it.
 */
describe('leastCapabilities', () => {
    const chmod = 'vfs.node.chmod';
    const del = 'vfs.node.delete';

    it('answers nothing for an empty selection', () => {
        expect(leastCapabilities([])).toBeUndefined();
    });

    it('answers nothing when no subject carries an answer -- absent, null, or empty (JSON [])', () => {
        // An empty PHP map arrives as an ARRAY. Read as "all denied" it would disable every action for a
        // caller who may; it is no answer, and the refusal decides.
        expect(leastCapabilities([{}, { capabilities: null }, { capabilities: [] }, { capabilities: {} }])).toBeUndefined();
    });

    it('takes the one subject\'s answer as it is', () => {
        expect(leastCapabilities([{ capabilities: { [chmod]: 'allowed', [del]: 'elevate' } }]))
            .toEqual({ [chmod]: 'allowed', [del]: 'elevate' });
    });

    it('takes the LEAST state across subjects: denied < elevate < allowed', () => {
        const least = leastCapabilities([
            { capabilities: { [chmod]: 'allowed', [del]: 'allowed' } },
            { capabilities: { [chmod]: 'elevate', [del]: 'allowed' } },
            { capabilities: { [chmod]: 'allowed', [del]: 'denied' } },
        ]);

        expect(least).toEqual({ [chmod]: 'elevate', [del]: 'denied' });
    });

    it('reads a key missing from a non-empty answer as denied', () => {
        // The server lists every declared action of the subject's kind, so a missing one is not "unknown".
        expect(leastCapabilities([
            { capabilities: { [chmod]: 'allowed', [del]: 'allowed' } },
            { capabilities: { [chmod]: 'allowed' } },
        ])).toEqual({ [chmod]: 'allowed', [del]: 'denied' });
    });

    it('reads a state it does not recognise as denied -- a consistent no', () => {
        expect(leastCapabilities([{ capabilities: { [chmod]: 'maybe' } }])).toEqual({ [chmod]: 'denied' });
    });

    it('lets a subject without an answer abstain rather than deny', () => {
        // Its refusal, if any, comes when the action runs; it must not grey out what the others allow.
        expect(leastCapabilities([{ capabilities: [] }, { capabilities: { [chmod]: 'allowed' } }]))
            .toEqual({ [chmod]: 'allowed' });
    });
});

describe('capabilityStateOf', () => {
    const states = { _capabilities: { 'vfs.node.chmod': 'elevate', 'vfs.node.delete': 'denied' } };

    it('reads the state of the action the node names', () => {
        expect(capabilityStateOf({ capability: 'vfs.node.chmod' }, states)).toBe('elevate');
        expect(capabilityStateOf({ capability: 'vfs.node.delete' }, states)).toBe('denied');
    });

    it('answers nothing for a node that names no capability', () => {
        expect(capabilityStateOf({ action: 'VfsChmod' }, states)).toBeUndefined();
        expect(capabilityStateOf({ capability: '' }, states)).toBeUndefined();
    });

    it('answers nothing when the page published no answer', () => {
        expect(capabilityStateOf({ capability: 'vfs.node.chmod' }, {})).toBeUndefined();
        expect(capabilityStateOf({ capability: 'vfs.node.chmod' }, { _capabilities: [] })).toBeUndefined();
        expect(capabilityStateOf({ capability: 'vfs.node.chmod' }, { _capabilities: {} })).toBeUndefined();
    });

    it('reads an action the published answer lacks as denied', () => {
        expect(capabilityStateOf({ capability: 'vfs.node.rename' }, states)).toBe('denied');
    });

    it('does not read an inherited property as a state', () => {
        expect(capabilityStateOf({ capability: 'toString' }, states)).toBe('denied');
    });
});
