/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { escapeRegex, normalize } = require('../src/commands/tag');

describe('escapeRegex', () => {
    test('leaves plain text alone', () => {
        expect(escapeRegex('rules')).toBe('rules');
    });

    test('escapes every regex metacharacter', () => {
        // The typed query goes into a RegExp, so a member must not be able to
        // write a pattern of their own (or a catastrophic one).
        for (const ch of ['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']) {
            expect(escapeRegex(ch)).toBe(`\\${ch}`);
        }
    });

    test('a metacharacter query matches only itself', () => {
        const re = new RegExp(`^${escapeRegex('a.c')}`);
        expect(re.test('a.c-rules')).toBe(true);
        expect(re.test('abc-rules')).toBe(false); // '.' must not act as a wildcard
    });

    test('a nested-quantifier query cannot build a catastrophic pattern', () => {
        const re = new RegExp(`^${escapeRegex('(a+)+')}`);
        expect(re.test('(a+)+tag')).toBe(true);
        expect(re.test('aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    });
});

describe('normalize', () => {
    test('lowercases and trims', () => {
        expect(normalize('  Rules  ')).toBe('rules');
    });

    test('caps the length so a long name cannot be stored', () => {
        expect(normalize('x'.repeat(100))).toHaveLength(32);
    });

    test('handles empty and missing input', () => {
        expect(normalize('')).toBe('');
        expect(normalize(undefined)).toBe('');
        expect(normalize(null)).toBe('');
    });
});
