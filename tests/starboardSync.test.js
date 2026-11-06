/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

jest.mock('../src/database/StarboardSchema', () => ({
    findOne: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
    find: jest.fn(),
    deleteMany: jest.fn(),
}));
jest.mock('../src/utils/guildConfigCache', () => ({
    getGuildConfig: jest.fn().mockResolvedValue({ starboardChannelId: 'stars', starboardThreshold: 3 }),
}));

const Starboard = require('../src/database/StarboardSchema');
const { syncStarboard } = require('../src/utils/starboardManager');

function makeReaction({ nsfw = false, starNsfw = false, count = 3, id = 'msg-1' } = {}) {
    const starChannel = {
        id: 'stars',
        nsfw: starNsfw,
        send: jest.fn(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return { id: 'post-1' };
        }),
    };
    const message = {
        id,
        guildId: 'g1',
        channelId: 'chat',
        partial: false,
        content: 'clip of the night',
        url: 'https://discord.com/channels/g1/chat/1',
        createdTimestamp: 0,
        attachments: { find: () => undefined },
        author: { tag: 'a#1', displayAvatarURL: () => 'https://cdn/a.png' },
        channel: { id: 'chat', nsfw },
        guild: { id: 'g1', channels: { cache: new Map([['stars', starChannel]]) } },
    };
    return { starChannel, reaction: { partial: false, count, emoji: { name: '⭐', toString: () => '⭐' }, message } };
}

beforeEach(() => {
    jest.clearAllMocks();
    Starboard.findOne.mockResolvedValue(null);
    Starboard.create.mockResolvedValue({});
});

describe('starboard NSFW handling', () => {
    test('does not copy an age-restricted message into a normal highlights channel', async () => {
        const { reaction, starChannel } = makeReaction({ nsfw: true });
        await syncStarboard(reaction);
        expect(starChannel.send).not.toHaveBeenCalled();
    });

    test('allows it when the highlights channel is age-restricted too', async () => {
        const { reaction, starChannel } = makeReaction({ nsfw: true, starNsfw: true });
        await syncStarboard(reaction);
        expect(starChannel.send).toHaveBeenCalledTimes(1);
    });

    test('posts a normal message that meets the threshold', async () => {
        const { reaction, starChannel } = makeReaction();
        await syncStarboard(reaction);
        expect(starChannel.send).toHaveBeenCalledTimes(1);
    });
});

describe('starboard concurrency', () => {
    test('two simultaneous stars on one message post only once', async () => {
        const { reaction, starChannel } = makeReaction();
        // The first sync records the post, so the second one finds it.
        Starboard.create.mockImplementation(async () => {
            Starboard.findOne.mockResolvedValue({ starboardMessageId: 'post-1' });
        });
        starChannel.messages = { fetch: jest.fn().mockResolvedValue({ edit: jest.fn() }) };

        await Promise.all([syncStarboard(reaction), syncStarboard(reaction)]);

        expect(starChannel.send).toHaveBeenCalledTimes(1);
    });
});
