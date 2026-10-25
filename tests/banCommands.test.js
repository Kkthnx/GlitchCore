/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// /ban and /massban against fake interactions: unban timers survive a failed
// history write, absurd durations are refused, and /massban respects hierarchy.

jest.mock('../src/utils/moderationManager', () => ({
    blockReason: jest.fn().mockReturnValue(null),
    tryRecordInfraction: jest.fn().mockResolvedValue(true),
    withTargetNotice: jest.fn((_notice, action) => action()),
    auditReason: jest.fn((tag, reason) => `${tag}: ${reason}`),
    RECORD_FAILED_NOTE: "but I couldn't write the infraction record.",
}));
jest.mock('../src/utils/tempBanManager', () => ({
    scheduleTempBan: jest.fn().mockResolvedValue(),
    clearTempBan: jest.fn().mockResolvedValue(),
}));

const mod = require('../src/utils/moderationManager');
const { scheduleTempBan, clearTempBan } = require('../src/utils/tempBanManager');
const ban = require('../src/commands/moderation/ban');
const massban = require('../src/commands/moderation/massban');

const TARGET = '123456789012345678';
const OTHER = '223456789012345678';

function options(values) {
    return {
        getUser: () => ({ id: TARGET, tag: 'target#0001' }),
        getMember: () => null,
        getString: name => values[name] ?? null,
        getInteger: name => values[name] ?? null,
    };
}

function makeInteraction(values, extra = {}) {
    return {
        user: { id: 'mod1', tag: 'mod#0001' },
        client: { user: { id: 'bot' }, users: { fetch: jest.fn().mockResolvedValue({ id: TARGET, tag: 'target#0001' }) } },
        guild: {
            id: 'g1',
            name: 'Haven',
            members: { ban: jest.fn().mockResolvedValue(), fetch: jest.fn().mockRejectedValue(new Error('Unknown Member')) },
        },
        options: options(values),
        reply: jest.fn().mockResolvedValue(),
        deferReply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue(),
        ...extra,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mod.blockReason.mockReturnValue(null);
    mod.tryRecordInfraction.mockResolvedValue(true);
});

describe('/ban', () => {
    test('acknowledges before doing slow work', async () => {
        const i = makeInteraction({});
        await ban.execute(i);
        expect(i.deferReply).toHaveBeenCalled();
        expect(i.reply).not.toHaveBeenCalled();
        expect(i.editReply).toHaveBeenCalledWith({ content: expect.stringContaining('Banned') });
    });

    test('schedules the unban timer BEFORE the history write, so a failed write cannot make a temp-ban permanent', async () => {
        mod.tryRecordInfraction.mockResolvedValue(false);
        const i = makeInteraction({ duration: '3d' });
        await ban.execute(i);

        expect(scheduleTempBan).toHaveBeenCalledWith('g1', TARGET, expect.any(Date), 'No reason provided');
        expect(scheduleTempBan.mock.invocationCallOrder[0]).toBeLessThan(mod.tryRecordInfraction.mock.invocationCallOrder[0]);
        expect(i.editReply).toHaveBeenCalledWith({ content: expect.stringContaining("couldn't write the infraction record") });
    });

    test('a permanent ban cancels an older temp-ban', async () => {
        await ban.execute(makeInteraction({}));
        expect(clearTempBan).toHaveBeenCalledWith('g1', TARGET);
        expect(scheduleTempBan).not.toHaveBeenCalled();
    });

    test('tells the moderator when the unban timer could not be saved', async () => {
        scheduleTempBan.mockRejectedValueOnce(new Error('db down'));
        const i = makeInteraction({ duration: '1d' });
        await ban.execute(i);
        expect(i.editReply).toHaveBeenCalledWith({ content: expect.stringContaining('permanent until someone runs `/unban`') });
    });

    test('refuses a duration that would overflow the date', async () => {
        const i = makeInteraction({ duration: '99999999999d' });
        await ban.execute(i);
        expect(i.guild.members.ban).not.toHaveBeenCalled();
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Invalid duration') }));
    });

    test('refuses a temp-ban longer than a year', async () => {
        const i = makeInteraction({ duration: '400d' });
        await ban.execute(i);
        expect(i.guild.members.ban).not.toHaveBeenCalled();
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('1 year') }));
    });

    test('reports a failed ban without scheduling or recording anything', async () => {
        const i = makeInteraction({});
        i.guild.members.ban.mockRejectedValue(new Error('Missing Permissions'));
        await ban.execute(i);
        expect(i.editReply).toHaveBeenCalledWith({ content: expect.stringContaining('Failed to ban') });
        expect(scheduleTempBan).not.toHaveBeenCalled();
        expect(clearTempBan).not.toHaveBeenCalled();
        expect(mod.tryRecordInfraction).not.toHaveBeenCalled();
    });
});

describe('/massban', () => {
    test('refuses a member the moderator does not outrank', async () => {
        const protectedMember = { id: OTHER, user: { id: OTHER, tag: 'boss#0001' } };
        const i = makeInteraction({ ids: OTHER });
        i.guild.members.fetch.mockResolvedValue(protectedMember);
        mod.blockReason.mockReturnValue("You can't moderate someone with an equal or higher role.");

        await massban.execute(i);

        expect(i.guild.members.ban).not.toHaveBeenCalled();
        expect(mod.blockReason).toHaveBeenCalledWith(i, protectedMember, { needBannable: true });
        expect(i.editReply).toHaveBeenCalledWith({ content: expect.stringContaining('0** banned, **1** failed') });
    });

    test('bans people who already left without a hierarchy check', async () => {
        const i = makeInteraction({ ids: `${TARGET} ${OTHER}` });
        await massban.execute(i);
        expect(i.guild.members.ban).toHaveBeenCalledTimes(2);
        expect(mod.blockReason).not.toHaveBeenCalled();
    });

    test('cancels any earlier temp-ban for everyone it bans', async () => {
        const i = makeInteraction({ ids: `${TARGET} ${OTHER}` });
        await massban.execute(i);
        expect(clearTempBan).toHaveBeenCalledWith('g1', TARGET);
        expect(clearTempBan).toHaveBeenCalledWith('g1', OTHER);
    });

    test('never bans the moderator or the bot', async () => {
        const i = makeInteraction({ ids: `${TARGET}` });
        i.user.id = TARGET;
        await massban.execute(i);
        expect(i.guild.members.ban).not.toHaveBeenCalled();
    });

    test('rejects anything that is not an ID', async () => {
        const i = makeInteraction({ ids: 'abc' });
        await massban.execute(i);
        expect(i.guild.members.ban).not.toHaveBeenCalled();
        expect(i.reply).toHaveBeenCalled();
    });
});
