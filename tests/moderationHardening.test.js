/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Smaller pieces of the hardening pass: duplicate-ring memory, duration caps,
// the shared ID check, the shared mod-log lookup, and raid-mode release.

jest.mock('../src/utils/channels', () => ({ modLog: '', roles: { member: 'role1' } }));
jest.mock('../src/utils/guildConfigCache', () => ({ getGuildConfig: jest.fn().mockResolvedValue({}) }));

const channels = require('../src/utils/channels');
const { getGuildConfig } = require('../src/utils/guildConfigCache');
const { getModLogChannel } = require('../src/utils/auditLog');
const { parseDuration, MAX_TEMPBAN_MS } = require('../src/utils/duration');
const { isSnowflake } = require('../src/utils/snowflake');
const antiSpam = require('../src/utils/antiSpam');
const raid = require('../src/utils/raidMode');
const { releaseHeldMembers } = require('../src/utils/raidRelease');

beforeEach(() => {
    antiSpam._clearAll();
    raid._clearAll();
    channels.roles.member = 'role1';
    jest.clearAllMocks();
});

describe('duplicate ring', () => {
    const SPAM = 'CLAIM YOUR FREE GIFT AT THE LINK IN MY PROFILE';

    test('sweepIdle now drops idle rings, which used to live forever', () => {
        antiSpam.recordAndCheckDuplicate('idle-g1', SPAM, 1000, 3, 30000);
        antiSpam.recordAndCheckDuplicate('busy-g1', SPAM, 1000 + 9 * 60 * 1000, 3, 30000);

        antiSpam.sweepIdle(1000 + 10 * 60 * 1000);

        // The idle member starts fresh: two more posts do not reach the threshold of 3.
        const t = 1000 + 10 * 60 * 1000;
        antiSpam.recordAndCheckDuplicate('idle-g1', SPAM, t, 3, 30000);
        expect(antiSpam.recordAndCheckDuplicate('idle-g1', SPAM, t + 1, 3, 30000)).toBe(false);
    });

    test('whitespace and case differences still count as the same message', () => {
        antiSpam.recordAndCheckDuplicate('k', 'Free   Nitro  CLICK here', 1000, 3, 30000);
        antiSpam.recordAndCheckDuplicate('k', 'free nitro click   HERE', 1001, 3, 30000);
        expect(antiSpam.recordAndCheckDuplicate('k', ' free nitro click here ', 1002, 3, 30000)).toBe(true);
    });

    test('different messages of the same length do not collide', () => {
        antiSpam.recordAndCheckDuplicate('k', 'aaaaaaaaaaaa', 1000, 2, 30000);
        expect(antiSpam.recordAndCheckDuplicate('k', 'bbbbbbbbbbbb', 1001, 2, 30000)).toBe(false);
    });

    test('takeDuplicateRefs returns every copy and forgets them', () => {
        antiSpam.recordAndCheckDuplicate('k', SPAM, 1000, 3, 30000, { channelId: 'a', id: '1' });
        antiSpam.recordAndCheckDuplicate('k', 'a completely different message here', 1001, 3, 30000, { channelId: 'a', id: '2' });
        antiSpam.recordAndCheckDuplicate('k', SPAM, 1002, 3, 30000, { channelId: 'b', id: '3' });

        expect(antiSpam.takeDuplicateRefs('k', SPAM)).toEqual([{ channelId: 'a', id: '1' }, { channelId: 'b', id: '3' }]);
        expect(antiSpam.takeDuplicateRefs('k', SPAM)).toEqual([]);
        expect(antiSpam.takeDuplicateRefs('nobody', SPAM)).toEqual([]);
    });
});

describe('parseDuration limits', () => {
    test('rejects values that overflow Date instead of returning Infinity-sized numbers', () => {
        expect(parseDuration('99999999999d')).toBeNull();
        expect(parseDuration('99999999999999999999999d')).toBeNull();
    });

    test('ordinary durations are unaffected', () => {
        expect(parseDuration('1w')).toBe(7 * 24 * 60 * 60 * 1000);
        expect(parseDuration('365d')).toBe(MAX_TEMPBAN_MS);
    });
});

describe('isSnowflake', () => {
    test.each(['12345678901234567', '123456789012345678', '12345678901234567890'])('accepts %s', id => {
        expect(isSnowflake(id)).toBe(true);
    });

    test.each(['', '1234', 'abc', '123456789012345678a', '123456789012345678901', null, undefined])('rejects %p', id => {
        expect(isSnowflake(id)).toBe(false);
    });

    test('ignores surrounding whitespace', () => {
        expect(isSnowflake('  123456789012345678 ')).toBe(true);
    });
});

describe('getModLogChannel', () => {
    const textChannel = { id: 'log1', isTextBased: () => true };
    const guild = { id: 'g1', channels: { cache: new Map([['log1', textChannel]]) } };

    test('prefers the per-guild setting', async () => {
        getGuildConfig.mockResolvedValue({ modLogChannelId: 'log1' });
        expect(await getModLogChannel(guild)).toBe(textChannel);
    });

    test('falls back to the env channel', async () => {
        channels.modLog = 'log1';
        getGuildConfig.mockResolvedValue({});
        expect(await getModLogChannel(guild)).toBe(textChannel);
        channels.modLog = '';
    });

    test('ignores the audit-log switch, since moderation records always post', async () => {
        getGuildConfig.mockResolvedValue({ modLogChannelId: 'log1', auditLogEnabled: false });
        expect(await getModLogChannel(guild)).toBe(textChannel);
    });

    test('uses a config the caller already has', async () => {
        expect(await getModLogChannel(guild, { modLogChannelId: 'log1' })).toBe(textChannel);
        expect(getGuildConfig).not.toHaveBeenCalled();
    });

    test('null when nothing is configured or the channel is gone', async () => {
        getGuildConfig.mockResolvedValue({});
        expect(await getModLogChannel(guild)).toBeNull();
        getGuildConfig.mockResolvedValue({ modLogChannelId: 'gone' });
        expect(await getModLogChannel(guild)).toBeNull();
    });
});

describe('raid mode hold and release', () => {
    function makeGuild(members) {
        const role = { id: 'role1' };
        return {
            id: 'g1',
            roles: { cache: new Map([['role1', role]]) },
            members: {
                fetch: jest.fn(async id => {
                    if (!members[id]) throw new Error('Unknown Member');
                    return members[id];
                }),
            },
        };
    }
    const member = (fails = false) => ({ roles: { add: fails ? jest.fn().mockRejectedValue(new Error('no')) : jest.fn().mockResolvedValue() } });

    test('remembers who was held, and keeps them after raid mode ends', () => {
        raid.setRaidMode('g1', true, 60000, false, 1000);
        raid.recordHeldJoin('g1', 'a');
        raid.recordHeldJoin('g1', 'b');
        raid.recordHeldJoin('g1', 'a');
        expect(raid.heldCount('g1')).toBe(2);

        raid.setRaidMode('g1', false);
        expect(raid.heldCount('g1')).toBe(2);
    });

    test('does not track joins outside raid mode', () => {
        expect(raid.recordHeldJoin('g1', 'a')).toBe(0);
        expect(raid.heldCount('g1')).toBe(0);
    });

    test('the held list is bounded', () => {
        raid.setRaidMode('g1', true, 60000, false, 1000);
        for (let i = 0; i < raid.MAX_HELD_IDS + 50; i += 1) raid.recordHeldJoin('g1', `m${i}`);
        expect(raid.heldCount('g1')).toBe(raid.MAX_HELD_IDS);
    });

    test('release hands the role to members still present and skips the gone', async () => {
        raid.setRaidMode('g1', true, 60000, false, 1000);
        ['here', 'banned', 'broken'].forEach(id => raid.recordHeldJoin('g1', id));
        const here = member();
        const guild = makeGuild({ here, broken: member(true) });

        const result = await releaseHeldMembers(guild);

        expect(result).toMatchObject({ released: 1, gone: 1, failed: 1, noRole: false });
        expect(here.roles.add).toHaveBeenCalledWith({ id: 'role1' }, expect.any(String));
        expect(raid.heldCount('g1')).toBe(0);
    });

    test('with no member role configured the held list is kept', async () => {
        raid.setRaidMode('g1', true, 60000, false, 1000);
        raid.recordHeldJoin('g1', 'a');
        channels.roles.member = '';

        const result = await releaseHeldMembers(makeGuild({}));

        expect(result).toMatchObject({ noRole: true, waiting: 1 });
        expect(raid.heldCount('g1')).toBe(1);
    });
});
