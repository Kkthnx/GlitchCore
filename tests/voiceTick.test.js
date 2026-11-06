/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

jest.mock('../src/utils/xpCache', () => ({ queueXp: jest.fn() }));
jest.mock('../src/utils/guildConfigCache', () => ({
    getGuildConfig: jest.fn(async () => ({ voiceTickMinutes: 5, voiceXpPerTick: 5 })),
}));
jest.mock('../src/utils/isDoubleXp', () => ({ getXpMultiplier: () => 1 }));

const { queueXp } = require('../src/utils/xpCache');
const { voiceSessions, tickVoiceSessions } = require('../src/events/voiceStateUpdate');

const MINUTE = 60 * 1000;

function fakeActiveMember(id, guildId) {
    const voice = { channelId: 'vc', selfMute: false, serverMute: false, selfDeafen: false, serverDeafen: false };
    const peer = { user: { bot: false }, voice };
    const list = [{ user: { bot: false }, voice }, peer];
    // Collection.filter(...).size is all isMemberActive needs.
    voice.channel = { members: { filter: fn => ({ size: list.filter(fn).length }) } };
    return { id, user: { bot: false }, voice, guild: { id: guildId, afkChannelId: null } };
}

function fakeClient(member) {
    const guild = { members: { cache: new Map([[member.id, member]]) } };
    return { guilds: { cache: new Map([[member.guild.id, guild]]) } };
}

beforeEach(() => {
    voiceSessions.clear();
    queueXp.mockClear();
    jest.useFakeTimers();
});

afterEach(() => jest.useRealTimers());

describe('tickVoiceSessions', () => {
    test('pays a full tick and carries the leftover time forward', async () => {
        jest.setSystemTime(new Date('2026-01-01T12:00:00Z'));
        const member = fakeActiveMember('u1', 'g1');
        const start = Date.now() - (5 * MINUTE + 40 * 1000);
        voiceSessions.set('u1-g1', start);

        await tickVoiceSessions(fakeClient(member));

        expect(queueXp).toHaveBeenCalledTimes(1);
        expect(queueXp.mock.calls[0].slice(0, 3)).toEqual(['u1', 'g1', 5]);
        expect(voiceSessions.get('u1-g1')).toBe(start + 5 * MINUTE);
    });

    test('pays nothing before a full tick has passed', async () => {
        jest.setSystemTime(new Date('2026-01-01T12:00:00Z'));
        const member = fakeActiveMember('u1', 'g1');
        const start = Date.now() - 4 * MINUTE;
        voiceSessions.set('u1-g1', start);

        await tickVoiceSessions(fakeClient(member));

        expect(queueXp).not.toHaveBeenCalled();
        expect(voiceSessions.get('u1-g1')).toBe(start);
    });
});
