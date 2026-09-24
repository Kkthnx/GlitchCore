/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { resolveChannel } = require('../src/utils/levelUpEmbed');

// A stand-in client whose channel cache holds the given ids as text channels.
function clientWith(ids, { nonText = [] } = {}) {
    const cache = new Map();
    for (const id of ids) cache.set(id, { id, isTextBased: () => true });
    for (const id of nonText) cache.set(id, { id, isTextBased: () => false });
    return { channels: { cache } };
}

describe('resolveChannel', () => {
    test('prefers the configured channel over the active one', () => {
        const client = clientWith(['configured', 'active']);
        expect(resolveChannel(client, ['configured', 'active']).id).toBe('configured');
    });

    test('falls back to the active channel when none is configured', () => {
        // The regression this guards: with no level-up channel set, the
        // announcement used to be dropped instead of posting where they chatted.
        const client = clientWith(['active']);
        expect(resolveChannel(client, ['', 'active']).id).toBe('active');
    });

    test('falls back when the configured channel is no longer cached', () => {
        const client = clientWith(['active']);
        expect(resolveChannel(client, ['deleted-channel', 'active']).id).toBe('active');
    });

    test('skips null and undefined ids', () => {
        const client = clientWith(['active']);
        expect(resolveChannel(client, [null, undefined, 'active']).id).toBe('active');
    });

    test('ignores a channel that is not text based', () => {
        const client = clientWith(['active'], { nonText: ['voice'] });
        expect(resolveChannel(client, ['voice', 'active']).id).toBe('active');
    });

    test('returns null when nothing resolves', () => {
        expect(resolveChannel(clientWith([]), ['', null])).toBeNull();
    });
});
