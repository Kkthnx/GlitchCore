/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { checkMessage, getRandomClapback } = require('../src/utils/filterManager');

describe('checkMessage', () => {
    test('allows ordinary messages', () => {
        expect(checkMessage('hey everyone, ready to raid tonight?')).toBeNull();
    });

    test('does not false-positive on words that contain a slur substring', () => {
        // "spice" contains "spic" but should not trip the word-boundary regex
        expect(checkMessage('I love adding spice to my food')).toBeNull();
    });

    test('flags political content', () => {
        expect(checkMessage('the democrat and republican debate')).toBe('American Politics');
    });

    test('flags slurs', () => {
        expect(checkMessage('you are a retard')).toBe('Racism/Slurs');
    });

    test('flags the anal spammer pattern', () => {
        expect(checkMessage('anal')).toBe('"Anal" Spammer');
    });

    test('flags CJK characters', () => {
        expect(checkMessage('こんにちは')).toBe('Chinese/Korean/Japanese Characters');
    });
});

describe('getRandomClapback', () => {
    test('substitutes the user mention placeholder', () => {
        const result = getRandomClapback('<@123>');
        expect(result).toContain('<@123>');
        expect(result).not.toContain('{user}');
    });
});
