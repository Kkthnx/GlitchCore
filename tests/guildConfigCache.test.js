/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// getGuildConfig sits on the message path, so how it behaves under load and
// during a database outage matters more than the happy path.

jest.mock('../src/database/GuildConfigSchema', () => {
    const model = {
        result: null,
        error: null,
        calls: 0,
        findOne: jest.fn(() => ({
            lean: () => {
                model.calls += 1;
                return model.error ? Promise.reject(model.error) : Promise.resolve(model.result);
            },
        })),
        reset(result = null) {
            model.result = result;
            model.error = null;
            model.calls = 0;
        },
    };
    return model;
});

const GuildConfig = require('../src/database/GuildConfigSchema');
const {
    getGuildConfig,
    invalidateGuildConfig,
    pruneGuildConfigCache,
} = require('../src/utils/guildConfigCache');

beforeEach(() => {
    GuildConfig.reset({ guildId: 'g', xpEnabled: true });
    invalidateGuildConfig('g');
    invalidateGuildConfig('other');
});

describe('caching', () => {
    test('reads once and serves the rest from cache', async () => {
        expect(await getGuildConfig('g')).toMatchObject({ xpEnabled: true });
        expect(await getGuildConfig('g')).toMatchObject({ xpEnabled: true });
        expect(GuildConfig.calls).toBe(1);
    });

    test('collapses a burst of concurrent misses into one query', async () => {
        // A cold cache plus a busy channel used to fire one identical query per
        // message; they share the in-flight promise instead.
        const results = await Promise.all(
            Array.from({ length: 20 }, () => getGuildConfig('g')),
        );

        expect(GuildConfig.calls).toBe(1);
        for (const r of results) expect(r).toMatchObject({ xpEnabled: true });
    });

    test('invalidating forces the next read to hit the database', async () => {
        await getGuildConfig('g');
        invalidateGuildConfig('g');
        await getGuildConfig('g');
        expect(GuildConfig.calls).toBe(2);
    });

    test('caches a null for a guild with no config document', async () => {
        GuildConfig.reset(null);
        expect(await getGuildConfig('g')).toBeNull();
        expect(await getGuildConfig('g')).toBeNull();
        expect(GuildConfig.calls).toBe(1);
    });
});

describe('resilience', () => {
    test('serves the last known config when the database fails', async () => {
        const start = Date.now();
        const now = jest.spyOn(Date, 'now').mockReturnValue(start);

        await getGuildConfig('g'); // warm the cache

        // Age the entry past its TTL so the next call actually goes out, then
        // have that read fail. Previously this rejected, and on the message path
        // that was one unhandled rejection per message for the whole outage.
        now.mockReturnValue(start + 11 * 60 * 1000);
        GuildConfig.error = new Error('connection lost');

        expect(await getGuildConfig('g')).toMatchObject({ xpEnabled: true });
        expect(GuildConfig.calls).toBe(2); // it did try, and fell back

        now.mockRestore();
    });

    test('an explicit invalidation is honoured over a stale value', async () => {
        // Deliberate: invalidation means the settings changed, so the old copy is
        // known-wrong. Serving it would apply settings an admin just replaced.
        await getGuildConfig('g');
        invalidateGuildConfig('g');
        GuildConfig.error = new Error('connection lost');

        await expect(getGuildConfig('g')).resolves.toBeNull();
    });

    test('returns null rather than throwing when nothing was ever cached', async () => {
        GuildConfig.error = new Error('connection lost');
        await expect(getGuildConfig('never-seen')).resolves.toBeNull();
    });

    test('retries on the next call instead of caching the failure', async () => {
        GuildConfig.error = new Error('connection lost');
        await getGuildConfig('g');

        GuildConfig.error = null;
        GuildConfig.result = { guildId: 'g', xpEnabled: false };
        expect(await getGuildConfig('g')).toMatchObject({ xpEnabled: false });
    });

    test('a failed read does not wedge the in-flight slot', async () => {
        GuildConfig.error = new Error('connection lost');
        await getGuildConfig('g');

        GuildConfig.error = null;
        // If the in-flight promise were never cleared, this would resolve to the
        // failed one forever.
        expect(await getGuildConfig('g')).toMatchObject({ xpEnabled: true });
    });
});

describe('pruneGuildConfigCache', () => {
    test('forgets guilds the bot is no longer in', async () => {
        await getGuildConfig('g');
        await getGuildConfig('other');

        pruneGuildConfigCache(['g']); // left 'other'

        GuildConfig.calls = 0;
        await getGuildConfig('g');
        expect(GuildConfig.calls).toBe(0); // still cached

        await getGuildConfig('other');
        expect(GuildConfig.calls).toBe(1); // re-read, was pruned
    });

    test('accepts an iterator, which is what the guild key list is', async () => {
        await getGuildConfig('g');
        expect(() => pruneGuildConfigCache(new Map([['g', 1]]).keys())).not.toThrow();
    });
});
