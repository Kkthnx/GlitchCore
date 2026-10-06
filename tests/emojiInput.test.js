/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { isValidEmoji } = require('../src/utils/emojiInput');

describe('isValidEmoji accepts real emoji', () => {
    test.each([
        ['a plain emoji', '🎮'],
        ['a heart with a variation selector', '❤️'],
        ['a skin tone sequence', '👍🏽'],
        ['a joined family sequence', '👨‍👩‍👧'],
        ['a country flag', '🇺🇸'],
        ['a subdivision flag', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'],
        ['a keycap', '1️⃣'],
        ['a keycap with no variation selector', '#⃣'],
        ['a server emoji', '<:glitch:123456789012345678>'],
        ['an animated server emoji', '<a:spin:123456789012345678>'],
        ['an emoji with stray whitespace around it', '  🎮  '],
    ])('%s', (_name, value) => {
        expect(isValidEmoji(value)).toBe(true);
    });
});

describe('isValidEmoji rejects things that would break the menu', () => {
    test.each([
        ['an ordinary word', 'hello'],
        ['a shortcode', ':joy:'],
        ['letters mixed with an emoji', '🎮hello'],
        ['digits only', '123'],
        ['an empty string', ''],
        ['whitespace only', '   '],
        ['long text', 'x'.repeat(40)],
        ['a server emoji with a truncated id', '<:glitch:12>'],
        ['a server emoji missing its name', '<::123456789012345678>'],
        ['a malformed server emoji', '<glitch:123456789012345678>'],
    ])('%s', (_name, value) => {
        expect(isValidEmoji(value)).toBe(false);
    });

    test.each([[null], [undefined], [42], [{}]])('non-string input %p', value => {
        expect(isValidEmoji(value)).toBe(false);
    });
});
