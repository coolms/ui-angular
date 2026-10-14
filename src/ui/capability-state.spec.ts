import {
    capabilityContext,
    capabilityRefusals,
    capabilityStateOf,
    CapabilityState,
    leastCapabilities,
    refusalPhraseOf,
} from './capability-state';

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

/**
 * An action on several items takes the most restrictive answer across them (2026-10-14): any item denied --
 * the action is greyed out, and says how many refuse; any needing elevation and none denied -- locked; all
 * allowed -- as it is. Every mix, with the deciding item first, in the middle and last, so an answer read
 * from one item (the first, the last) for all of them fails here.
 */
describe('a selection of mixed answers', () => {
    const del = 'vfs.node.delete';
    const item = (state: CapabilityState | null) => (null === state ? { capabilities: [] } : { capabilities: { [del]: state } });

    const mixes: ReadonlyArray<[string, ReadonlyArray<CapabilityState | null>, CapabilityState, number]> = [
        // name, the items' answers in order, the action's state, how many refuse
        ['all allowed',                          ['allowed', 'allowed', 'allowed'], 'allowed', 0],
        ['one needs elevation, first',           ['elevate', 'allowed', 'allowed'], 'elevate', 0],
        ['one needs elevation, last',            ['allowed', 'allowed', 'elevate'], 'elevate', 0],
        ['all need elevation',                   ['elevate', 'elevate'],            'elevate', 0],
        ['one denied, first',                    ['denied', 'allowed', 'allowed'],  'denied',  1],
        ['one denied, in the middle',            ['allowed', 'denied', 'allowed'],  'denied',  1],
        ['one denied, last',                     ['allowed', 'allowed', 'denied'],  'denied',  1],
        ['denied beside elevation, denied last', ['elevate', 'allowed', 'denied'],  'denied',  1],
        ['denied beside elevation, denied first', ['denied', 'elevate', 'allowed'], 'denied',  1],
        ['two of four denied, apart',            ['allowed', 'denied', 'elevate', 'denied'], 'denied', 2],
        ['all denied',                           ['denied', 'denied'],              'denied',  2],
        ['an item without an answer abstains',   [null, 'allowed', 'denied'],       'denied',  1],
    ];

    for (const [name, answers, state, refused] of mixes) {
        it(`${name}: ${state}${refused ? `, ${refused} of ${answers.length} refuse` : ''}`, () => {
            const subjects = answers.map(item);

            expect(leastCapabilities(subjects)?.[del]).toBe(state);
            expect(capabilityRefusals(subjects)?.[del]).toEqual(refused ? { refused, of: answers.length } : undefined);
        });
    }

    it('publishes both entries in one context, under their keys', () => {
        const context = capabilityContext([item('allowed'), item('denied'), item('elevate')]);

        expect(context).toEqual({
            _capabilities:       { [del]: 'denied' },
            _capabilityRefusals: { [del]: { refused: 1, of: 3 } },
        });
        expect(capabilityStateOf({ capability: del }, context)).toBe('denied');
    });

    it('says how many refuse, for one item and for several', () => {
        expect(refusalPhraseOf({ capability: del }, capabilityContext([item('denied')])))
            .toBe('not allowed for the selected item');
        expect(refusalPhraseOf({ capability: del }, capabilityContext([item('denied'), item('allowed'), item('denied')])))
            .toBe('not allowed for 2 of 3 selected items');
    });

    it('still says "not allowed" for a page that publishes the states without the count', () => {
        expect(refusalPhraseOf({ capability: del }, { _capabilities: { [del]: 'denied' } })).toBe('not allowed');
        expect(refusalPhraseOf({ capability: 'toString' }, { _capabilityRefusals: {} })).toBe('not allowed');
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
