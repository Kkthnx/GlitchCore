/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

jest.mock('../src/database/StreamerSchema', () => ({ find: jest.fn(), findOneAndUpdate: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/utils/twitchClient', () => ({ isConfigured: () => true, getLiveStreams: jest.fn() }));
jest.mock('../src/utils/guildConfigCache', () => ({ getGuildConfig: jest.fn().mockResolvedValue({ streamerChannelId: 'live-chan' }) }));

const Streamer = require('../src/database/StreamerSchema');
const { getLiveStreams } = require('../src/utils/twitchClient');
const { pollStreamers, OFFLINE_GRACE_POLLS } = require('../src/utils/streamerManager');

function makeStreamer(overrides = {}) {
    return {
        _id: 's1',
        guildId: 'g1',
        twitchLogin: 'kkthnx',
        discordUserId: null,
        isLive: true,
        lastStreamId: '100',
        missedPolls: 0,
        liveMessageId: 'm1',
        liveChannelId: 'live-chan',
        save: jest.fn().mockResolvedValue(),
        ...overrides,
    };
}

function makeClient(deleteMessage) {
    const channel = {
        id: 'live-chan',
        send: jest.fn().mockResolvedValue({ id: 'm2' }),
        messages: { fetch: jest.fn().mockResolvedValue({ delete: deleteMessage }) },
    };
    return { guilds: { cache: new Map([['g1', {}]]) }, channels: { cache: new Map([['live-chan', channel]]) }, channel };
}

beforeEach(() => jest.clearAllMocks());

describe('pollStreamers offline grace', () => {
    test('one missed poll keeps the announcement', async () => {
        const streamer = makeStreamer();
        Streamer.find.mockResolvedValue([streamer]);
        getLiveStreams.mockResolvedValue([]);
        const del = jest.fn().mockResolvedValue();

        await pollStreamers(makeClient(del));

        expect(streamer.isLive).toBe(true);
        expect(streamer.missedPolls).toBe(1);
        expect(del).not.toHaveBeenCalled();
    });

    test('enough misses in a row go offline and delete the post', async () => {
        const streamer = makeStreamer({ missedPolls: OFFLINE_GRACE_POLLS - 1 });
        Streamer.find.mockResolvedValue([streamer]);
        getLiveStreams.mockResolvedValue([]);
        const del = jest.fn().mockResolvedValue();

        await pollStreamers(makeClient(del));

        expect(streamer.isLive).toBe(false);
        expect(streamer.missedPolls).toBe(0);
        expect(del).toHaveBeenCalledTimes(1);
    });

    test('seeing the stream again resets the miss count without re-announcing', async () => {
        const streamer = makeStreamer({ missedPolls: 1 });
        Streamer.find.mockResolvedValue([streamer]);
        getLiveStreams.mockResolvedValue([{ id: '100', user_login: 'kkthnx', user_name: 'Kkthnx' }]);
        const client = makeClient(jest.fn());

        await pollStreamers(client);

        expect(streamer.missedPolls).toBe(0);
        expect(client.channel.send).not.toHaveBeenCalled();
    });

    test('a failed Twitch lookup changes nothing', async () => {
        const streamer = makeStreamer();
        Streamer.find.mockResolvedValue([streamer]);
        getLiveStreams.mockRejectedValue(new Error('Twitch helix 500'));
        const del = jest.fn();

        await pollStreamers(makeClient(del));

        expect(streamer.missedPolls).toBe(0);
        expect(streamer.save).not.toHaveBeenCalled();
        expect(del).not.toHaveBeenCalled();
    });
});
