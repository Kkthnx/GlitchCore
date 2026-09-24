/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { setAfk, clearAfk, getAfk, sweepExpired, _clearAll, DEFAULT_TTL_MS } = require('../src/utils/afkManager');

const HOUR = 60 * 60 * 1000;

beforeEach(() => _clearAll());

describe('setAfk and getAfk', () => {
    test('stores the reason and when it started', () => {
        setAfk('g', 'u', 'getting food', 1000);
        expect(getAfk('g', 'u', 1000)).toMatchObject({ reason: 'getting food', since: 1000 });
    });

    test('defaults a blank reason', () => {
        setAfk('g', 'u', '', 0);
        expect(getAfk('g', 'u', 0).reason).toBe('AFK');
        setAfk('g', 'u2', undefined, 0);
        expect(getAfk('g', 'u2', 0).reason).toBe('AFK');
    });

    test('keeps guilds and members separate', () => {
        setAfk('g1', 'u', 'one', 0);
        expect(getAfk('g2', 'u', 0)).toBeUndefined();
        expect(getAfk('g1', 'other', 0)).toBeUndefined();
    });

    test('setting again replaces the previous reason', () => {
        setAfk('g', 'u', 'first', 0);
        setAfk('g', 'u', 'second', 500);
        expect(getAfk('g', 'u', 500)).toMatchObject({ reason: 'second', since: 500 });
    });
});

describe('expiry', () => {
    test('an AFK from weeks ago is not reported as current', () => {
        // The point of the TTL: without it, someone who set AFK and never posted
        // again was still announced as away indefinitely.
        setAfk('g', 'u', 'holiday', 0);
        expect(getAfk('g', 'u', DEFAULT_TTL_MS - 1)).toBeDefined();
        expect(getAfk('g', 'u', DEFAULT_TTL_MS)).toBeUndefined();
    });

    test('reading an expired entry drops it, not just hides it', () => {
        setAfk('g', 'u', 'gone', 0, HOUR);
        getAfk('g', 'u', 2 * HOUR); // expired read

        // Nothing left to sweep, because the read already removed it.
        sweepExpired(2 * HOUR);
        expect(getAfk('g', 'u', 2 * HOUR)).toBeUndefined();
    });

    test('clearAfk does not welcome someone back from an expired AFK', () => {
        setAfk('g', 'u', 'ancient', 0, HOUR);
        expect(clearAfk('g', 'u', 2 * HOUR)).toBeUndefined();
    });
});

describe('clearAfk', () => {
    test('returns the cleared entry so the caller can welcome them back', () => {
        setAfk('g', 'u', 'brb', 0);
        expect(clearAfk('g', 'u', 1000)).toMatchObject({ reason: 'brb' });
    });

    test('is empty for someone who was not AFK', () => {
        expect(clearAfk('g', 'nobody', 0)).toBeUndefined();
    });

    test('is idempotent', () => {
        setAfk('g', 'u', 'brb', 0);
        clearAfk('g', 'u', 100);
        expect(clearAfk('g', 'u', 200)).toBeUndefined();
    });
});

describe('sweepExpired', () => {
    test('removes expired entries and keeps live ones', () => {
        setAfk('g', 'old', 'left the server', 0, HOUR);
        setAfk('g', 'new', 'just stepped away', 0, 10 * HOUR);

        sweepExpired(2 * HOUR);

        expect(getAfk('g', 'old', 2 * HOUR)).toBeUndefined();
        expect(getAfk('g', 'new', 2 * HOUR)).toBeDefined();
    });

    test('a member who never returns cannot pin an entry forever', () => {
        // This is the leak: an entry was only ever removed by that member
        // posting again, so anyone who set AFK and left stayed in the map.
        for (let i = 0; i < 100; i++) setAfk('g', `gone-${i}`, 'left', 0);

        sweepExpired(DEFAULT_TTL_MS + 1);

        for (let i = 0; i < 100; i++) {
            expect(getAfk('g', `gone-${i}`, DEFAULT_TTL_MS + 1)).toBeUndefined();
        }
    });

    test('is safe on an empty map', () => {
        expect(() => sweepExpired(Date.now())).not.toThrow();
    });
});
