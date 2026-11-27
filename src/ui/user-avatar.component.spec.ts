import { UserAvatarComponent } from './user-avatar.component';

/**
 * The initial is a name's first letter, or "?" when there is no name. An identifier (an id, a login, an email) is
 * never shown.
 */
describe('UserAvatarComponent initial', () => {
    const initialOf = (user: UserAvatarComponent['user']): string => {
        const avatar = new UserAvatarComponent();
        avatar.user = user;
        return avatar.initial;
    };

    it('takes the first letter of the name, upper-cased', () => {
        expect(initialOf({ firstName: 'priya Shah', identifier: '019efb47-07fc' })).toBe('P');
    });

    it('shows "?" when there is no name, never the first letter of the identifier', () => {
        expect(initialOf({ firstName: null, identifier: '019efb47-07fc-72c9' })).toBe('?');
        expect(initialOf({ identifier: 'chat-pane-shots@example.test' })).toBe('?');
    });

    it('shows "?" for a blank name', () => {
        expect(initialOf({ firstName: '   ', identifier: 'someone' })).toBe('?');
    });

    it('shows "?" with no user at all', () => {
        expect(initialOf(null)).toBe('?');
        expect(initialOf(undefined)).toBe('?');
    });

    it('takes a whole character, not half of one', () => {
        expect(initialOf({ firstName: '\u{1D4D0}lex' })).toBe('\u{1D4D0}');
    });

    it('ignores leading spaces in the name', () => {
        expect(initialOf({ firstName: '  lena' })).toBe('L');
    });
});
