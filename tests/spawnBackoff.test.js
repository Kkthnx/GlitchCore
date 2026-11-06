/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { backoffFor, describeSpawnError, MAX_BACKOFF_MS, MAX_RETRY_AFTER_MS } = require('../src/utils/spawnBackoff');

const rateLimited = (seconds, status = 429) => ({
    status,
    headers: new Headers(seconds === null ? {} : { 'retry-after': String(seconds) }),
});

describe('backoffFor', () => {
    test('waits out a long Retry-After instead of capping it at 15 minutes', () => {
        // The value Discord's Cloudflare layer sent on a host IP block.
        const waitMs = backoffFor(rateLimited(67218), 1);
        expect(waitMs).toBeGreaterThan(67218 * 1000);
        expect(waitMs).toBeGreaterThan(MAX_BACKOFF_MS);
    });

    test('caps an absurd Retry-After at a day', () => {
        expect(backoffFor(rateLimited(10 * 24 * 60 * 60), 1)).toBe(MAX_RETRY_AFTER_MS);
    });

    test('honors a short Retry-After as given, plus a small cushion', () => {
        const waitMs = backoffFor(rateLimited(5), 1);
        expect(waitMs).toBeGreaterThanOrEqual(5000);
        expect(waitMs).toBeLessThan(30000);
    });

    test('backs off exponentially without a header, up to 15 minutes', () => {
        const waits = [1, 2, 3, 4, 5, 6, 9].map(n => backoffFor(rateLimited(null), n));
        expect(waits[0]).toBe(60 * 1000);
        expect(waits[1]).toBeGreaterThan(waits[0]);
        expect(Math.max(...waits)).toBe(MAX_BACKOFF_MS);
    });

    test('treats a non-response error like a plain failure', () => {
        expect(backoffFor(new Error('boom'), 1)).toBe(60 * 1000);
        expect(backoffFor(undefined, 1)).toBe(60 * 1000);
    });

    test('ignores a nonsense Retry-After value', () => {
        expect(backoffFor({ headers: new Headers({ 'retry-after': 'soon' }) }, 1)).toBe(60 * 1000);
    });
});

describe('describeSpawnError', () => {
    test('summarizes a rate limit without dumping the response', () => {
        const line = describeSpawnError({ ...rateLimited(67218), message: '[object Object]' });
        expect(line).toBe('HTTP 429, Discord says wait 1120 min');
    });

    test('includes the message for an ordinary error', () => {
        expect(describeSpawnError(new Error('socket hang up'))).toBe('error, socket hang up');
    });
});
