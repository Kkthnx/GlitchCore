/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

jest.mock('../src/database/UserSchema', () => ({ find: jest.fn(), updateMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/database/BotStateSchema', () => ({ findOneAndUpdate: jest.fn(), updateOne: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/utils/guildConfigCache', () => ({ getGuildConfig: jest.fn() }));
jest.mock('../src/utils/channels', () => ({ announcements: 'ann', roles: {} }));

const User = require('../src/database/UserSchema');
const BotState = require('../src/database/BotStateSchema');
const { getGuildConfig } = require('../src/utils/guildConfigCache');
const { getLocalWeekStart, msUntilNextWeekStart } = require('../src/utils/time');
const { podiumLines, runWeeklyRollover } = require('../src/utils/weeklyManager');

// The test timezone is America/New_York, so these instants are picked by
// local wall time, not by their UTC date.
describe('getLocalWeekStart', () => {
    test('a Monday is its own week start', () => {
        expect(getLocalWeekStart(new Date('2026-11-02T15:00:00Z'))).toBe('2026-11-02');
    });

    test('mid-week and Sunday map back to the Monday before', () => {
        expect(getLocalWeekStart(new Date('2026-11-04T15:00:00Z'))).toBe('2026-11-02');
        expect(getLocalWeekStart(new Date('2026-11-08T15:00:00Z'))).toBe('2026-11-02');
    });

    test('the local date decides, not UTC', () => {
        // 03:00 UTC on Monday the 9th is still Sunday evening in New York.
        expect(getLocalWeekStart(new Date('2026-11-09T03:00:00Z'))).toBe('2026-11-02');
    });

    test('crosses a month and year boundary', () => {
        expect(getLocalWeekStart(new Date('2026-01-01T17:00:00Z'))).toBe('2025-12-29');
    });
});

describe('msUntilNextWeekStart', () => {
    test('is under a week and positive from any day', () => {
        for (let day = 2; day <= 8; day += 1) {
            const ms = msUntilNextWeekStart(new Date(`2026-11-0${day}T15:00:00Z`));
            expect(ms).toBeGreaterThan(0);
            expect(ms).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
        }
    });

    test('is about six days from Tuesday morning', () => {
        const days = msUntilNextWeekStart(new Date('2026-11-03T15:00:00Z')) / (24 * 60 * 60 * 1000);
        expect(days).toBeGreaterThan(5.4);
        expect(days).toBeLessThan(6);
    });
});

describe('podiumLines', () => {
    test('medals for the first three and numbers after', () => {
        const lines = podiumLines([
            { userId: 'a', weeklyXp: 1500 }, { userId: 'b', weeklyXp: 900 },
            { userId: 'c', weeklyXp: 400 }, { userId: 'd', weeklyXp: 100 },
        ]);
        expect(lines[0]).toBe('🥇 <@a>, 1,500 XP');
        expect(lines[2]).toMatch(/^🥉/);
        expect(lines[3]).toBe('**#4** <@d>, 100 XP');
    });
});

describe('runWeeklyRollover', () => {
    const NOW = new Date('2026-11-09T15:00:00Z');

    function makeGuild() {
        const roleAdd = jest.fn().mockResolvedValue();
        const roleRemove = jest.fn().mockResolvedValue();
        const role = { id: 'mvp' };
        const members = {
            fetch: jest.fn(async id => ({ id, roles: { cache: new Map(), add: roleAdd, remove: roleRemove } })),
        };
        return { guild: { id: 'g1', roles: { cache: new Map([['mvp', role]]) }, members }, roleAdd, roleRemove };
    }

    function makeClient() {
        const send = jest.fn().mockResolvedValue({});
        return { send, client: { channels: { cache: new Map([['ann', { send }]]) } } };
    }

    function topQuery(rows) {
        return { sort: () => ({ limit: () => ({ lean: () => Promise.resolve(rows) }) }) };
    }

    const claimed = value => ({ lean: () => Promise.resolve(value) });

    beforeEach(() => {
        jest.clearAllMocks();
        getGuildConfig.mockResolvedValue({ weeklyMvpRoleId: 'mvp' });
    });

    test('does nothing when the week was already handled', async () => {
        BotState.findOneAndUpdate.mockImplementation(() => { const e = new Error('dup'); e.code = 11000; throw e; });
        const { client, send } = makeClient();

        expect(await runWeeklyRollover(client, makeGuild().guild, NOW)).toBe(false);
        expect(send).not.toHaveBeenCalled();
        expect(User.updateMany).not.toHaveBeenCalled();
    });

    test('the first ever run only records the week', async () => {
        BotState.findOneAndUpdate.mockReturnValue(claimed(null));
        const { client, send } = makeClient();

        expect(await runWeeklyRollover(client, makeGuild().guild, NOW)).toBe(false);
        expect(send).not.toHaveBeenCalled();
        expect(User.updateMany).not.toHaveBeenCalled();
    });

    test('announces the podium, passes the role and resets the counters', async () => {
        BotState.findOneAndUpdate.mockReturnValue(claimed({ lastWeeklyKey: '2026-11-02', lastWeeklyWinnerId: 'old' }));
        User.find.mockReturnValue(topQuery([{ userId: 'new', weeklyXp: 2000 }, { userId: 'b', weeklyXp: 500 }]));
        const { client, send } = makeClient();
        const { guild, roleAdd, roleRemove } = makeGuild();

        expect(await runWeeklyRollover(client, guild, NOW)).toBe(true);

        expect(send).toHaveBeenCalledTimes(1);
        expect(roleRemove).toHaveBeenCalledTimes(1);
        expect(roleAdd).toHaveBeenCalledTimes(1);
        expect(User.updateMany).toHaveBeenCalledWith({ guildId: 'g1', weeklyXp: { $ne: 0 } }, { $set: { weeklyXp: 0 } });
        expect(BotState.updateOne).toHaveBeenCalledWith({ guildId: 'g1' }, { $set: { lastWeeklyWinnerId: 'new' } });
    });

    test('an empty week resets quietly with no announcement', async () => {
        BotState.findOneAndUpdate.mockReturnValue(claimed({ lastWeeklyKey: '2026-11-02' }));
        User.find.mockReturnValue(topQuery([]));
        const { client, send } = makeClient();

        expect(await runWeeklyRollover(client, makeGuild().guild, NOW)).toBe(true);
        expect(send).not.toHaveBeenCalled();
    });

    test('a repeat winner keeps the role without removing it', async () => {
        BotState.findOneAndUpdate.mockReturnValue(claimed({ lastWeeklyKey: '2026-11-02', lastWeeklyWinnerId: 'same' }));
        User.find.mockReturnValue(topQuery([{ userId: 'same', weeklyXp: 10 }]));
        const { client } = makeClient();
        const { guild, roleRemove } = makeGuild();

        await runWeeklyRollover(client, guild, NOW);

        expect(roleRemove).not.toHaveBeenCalled();
    });
});
