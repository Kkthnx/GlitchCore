/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// A community plays the same few games, so the same names come through over and
// over. Each uncached lookup is up to three sequential HTTP calls.

const { fetchGameBanner, _clearCache } = require('../src/utils/steamGridClient');

const ok = body => ({ ok: true, status: 200, json: async () => body });

function mockSearchThenHero(url = 'https://cdn/hero.png') {
    return jest.fn()
        .mockImplementation(async (target) => {
            if (String(target).includes('/search/')) return ok({ success: true, data: [{ id: 42 }] });
            if (String(target).includes('/heroes/')) return ok({ success: true, data: [{ url }] });
            return ok({ success: true, data: [] });
        });
}

let originalFetch;
beforeEach(() => {
    originalFetch = global.fetch;
    process.env.STEAMGRIDDB_API_KEY = 'test-key';
    _clearCache();
});
afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.STEAMGRIDDB_API_KEY;
});

describe('fetchGameBanner caching', () => {
    test('returns null and makes no request without an API key', async () => {
        delete process.env.STEAMGRIDDB_API_KEY;
        global.fetch = jest.fn();

        expect(await fetchGameBanner('Valorant')).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('serves a repeat lookup from cache instead of re-calling the API', async () => {
        global.fetch = mockSearchThenHero();

        expect(await fetchGameBanner('Valorant')).toBe('https://cdn/hero.png');
        const callsAfterFirst = global.fetch.mock.calls.length;
        expect(callsAfterFirst).toBeGreaterThan(0);

        expect(await fetchGameBanner('Valorant')).toBe('https://cdn/hero.png');
        expect(global.fetch.mock.calls.length).toBe(callsAfterFirst); // no new requests
    });

    test('matches case-insensitively and ignores surrounding whitespace', async () => {
        global.fetch = mockSearchThenHero();

        await fetchGameBanner('Valorant');
        const calls = global.fetch.mock.calls.length;

        expect(await fetchGameBanner('  VALORANT ')).toBe('https://cdn/hero.png');
        expect(global.fetch.mock.calls.length).toBe(calls);
    });

    test('caches a miss too, since that is the slowest path', async () => {
        global.fetch = jest.fn(async () => ok({ success: true, data: [] }));

        expect(await fetchGameBanner('Nonexistent Game')).toBeNull();
        const calls = global.fetch.mock.calls.length;

        expect(await fetchGameBanner('Nonexistent Game')).toBeNull();
        expect(global.fetch.mock.calls.length).toBe(calls);
    });

    test('keeps different games separate', async () => {
        global.fetch = jest.fn(async (target) => {
            if (String(target).includes('/search/')) {
                return ok({ success: true, data: [{ id: String(target).includes('Apex') ? 2 : 1 }] });
            }
            if (String(target).includes('/heroes/game/2')) return ok({ success: true, data: [{ url: 'https://cdn/apex.png' }] });
            if (String(target).includes('/heroes/game/1')) return ok({ success: true, data: [{ url: 'https://cdn/val.png' }] });
            return ok({ success: true, data: [] });
        });

        expect(await fetchGameBanner('Valorant')).toBe('https://cdn/val.png');
        expect(await fetchGameBanner('Apex')).toBe('https://cdn/apex.png');
    });

    test('does not cache a transient failure, so the next call retries', async () => {
        // A timeout or network drop says nothing about whether the game exists.
        global.fetch = jest.fn(async () => { throw new Error('network down'); });
        expect(await fetchGameBanner('Valorant')).toBeNull();

        global.fetch = mockSearchThenHero();
        expect(await fetchGameBanner('Valorant')).toBe('https://cdn/hero.png');
        expect(global.fetch).toHaveBeenCalled();
    });

    test('falls back to a grid when there is no hero art', async () => {
        global.fetch = jest.fn(async (target) => {
            if (String(target).includes('/search/')) return ok({ success: true, data: [{ id: 7 }] });
            if (String(target).includes('/heroes/')) return ok({ success: true, data: [] });
            if (String(target).includes('/grids/')) return ok({ success: true, data: [{ url: 'https://cdn/grid.png' }] });
            return ok({ success: true, data: [] });
        });

        expect(await fetchGameBanner('Obscure Game')).toBe('https://cdn/grid.png');
    });

    test('treats an empty game name as no result without calling out', async () => {
        global.fetch = jest.fn();
        expect(await fetchGameBanner('   ')).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
