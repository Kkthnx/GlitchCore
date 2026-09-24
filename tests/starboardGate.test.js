/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Reactions fire constantly, and fetching a partial one costs an HTTP round
// trip. These tests pin down that nothing is fetched until we know the reaction
// can actually affect the starboard.

jest.mock('../src/database/StarboardSchema', () => ({
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn(),
}));
jest.mock('../src/utils/guildConfigCache', () => ({ getGuildConfig: jest.fn() }));

const Starboard = require('../src/database/StarboardSchema');
const { getGuildConfig } = require('../src/utils/guildConfigCache');
const { syncStarboard } = require('../src/utils/starboardManager');

// A partial reaction, exactly as the gateway hands one over for an uncached
// message: emoji and ids present, count unknown until fetched.
function partialReaction({ emoji = '⭐', channelId = 'chat' } = {}) {
    const fetch = jest.fn().mockResolvedValue(undefined);
    return {
        partial: true,
        count: null,
        emoji: { name: emoji, toString: () => emoji },
        fetch,
        message: { id: 'msg-1', guildId: 'guild-1', channelId, partial: true, fetch: jest.fn() },
    };
}

beforeEach(() => jest.clearAllMocks());

describe('syncStarboard gating', () => {
    test('does not fetch anything when the guild has no starboard', async () => {
        getGuildConfig.mockResolvedValue({});
        const reaction = partialReaction();

        await syncStarboard(reaction);

        expect(reaction.fetch).not.toHaveBeenCalled();
        expect(reaction.message.fetch).not.toHaveBeenCalled();
        expect(Starboard.findOne).not.toHaveBeenCalled();
    });

    test('does not fetch anything when the emoji is not the star emoji', async () => {
        getGuildConfig.mockResolvedValue({ starboardChannelId: 'stars' });
        const reaction = partialReaction({ emoji: '😀' });

        await syncStarboard(reaction);

        expect(reaction.fetch).not.toHaveBeenCalled();
        expect(Starboard.findOne).not.toHaveBeenCalled();
    });

    test('respects a custom starboard emoji', async () => {
        getGuildConfig.mockResolvedValue({ starboardChannelId: 'stars', starboardEmoji: '🔥' });

        const wrong = partialReaction({ emoji: '⭐' });
        await syncStarboard(wrong);
        expect(wrong.fetch).not.toHaveBeenCalled();

        const right = partialReaction({ emoji: '🔥' });
        await syncStarboard(right);
        expect(right.fetch).toHaveBeenCalled();
    });

    test('never re-stars a reaction on a message already in the starboard', async () => {
        getGuildConfig.mockResolvedValue({ starboardChannelId: 'stars' });
        const reaction = partialReaction({ channelId: 'stars' });

        await syncStarboard(reaction);

        expect(reaction.fetch).not.toHaveBeenCalled();
    });

    test('bails out on a reaction with no guild, e.g. a DM', async () => {
        const reaction = partialReaction();
        reaction.message.guildId = null;

        await syncStarboard(reaction);

        expect(getGuildConfig).not.toHaveBeenCalled();
        expect(reaction.fetch).not.toHaveBeenCalled();
    });

    test('fetches once the gates pass', async () => {
        getGuildConfig.mockResolvedValue({ starboardChannelId: 'stars' });
        const reaction = partialReaction();

        await syncStarboard(reaction);

        expect(reaction.fetch).toHaveBeenCalledTimes(1);
    });
});
