/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { parseEmojiInput, emojiKeyFromReaction } = require('../src/utils/reactionRoleManager');

describe('parseEmojiInput', () => {
    test('treats a unicode emoji as its own key', () => {
        expect(parseEmojiInput('🎮')).toEqual({ key: '🎮', display: '🎮', reactable: '🎮' });
    });

    test('extracts the id from a custom emoji', () => {
        const out = parseEmojiInput('<:glitch:12345>');
        expect(out.key).toBe('12345');
        expect(out.reactable).toBe('<:glitch:12345>');
    });

    test('extracts the id from an animated custom emoji', () => {
        expect(parseEmojiInput('<a:spin:99>').key).toBe('99');
    });

    test('trims surrounding whitespace', () => {
        expect(parseEmojiInput('  ⭐  ').key).toBe('⭐');
    });
});

describe('emojiKeyFromReaction', () => {
    test('prefers the custom emoji id', () => {
        expect(emojiKeyFromReaction({ id: '777', name: 'glitch' })).toBe('777');
    });

    test('falls back to the unicode name', () => {
        expect(emojiKeyFromReaction({ id: null, name: '⭐' })).toBe('⭐');
    });
});
