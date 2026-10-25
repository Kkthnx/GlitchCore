/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// The enforcement paths in utils/autoMod: what gets deleted, what gets
// recorded, and what does NOT get recorded when Discord refuses the action.

jest.mock('../src/utils/moderationManager', () => ({
    tryRecordInfraction: jest.fn().mockResolvedValue(true),
    checkStrikeEscalation: jest.fn().mockResolvedValue(null),
}));

const { tryRecordInfraction, checkStrikeEscalation } = require('../src/utils/moderationManager');
const { evaluateContentFilter, enforceContentFilter, runAntiSpam } = require('../src/utils/autoMod');
const { _clearAll: clearAntiSpam } = require('../src/utils/antiSpam');

let nextId = 1;

function makeChannel(id = 'c1') {
    const sent = [];
    return {
        id,
        sent,
        send: jest.fn(async (content) => {
            const m = { content, delete: jest.fn().mockResolvedValue() };
            sent.push(m);
            return m;
        }),
        messages: { delete: jest.fn().mockResolvedValue() },
    };
}

function makeMessage(overrides = {}) {
    const channel = overrides.channel || makeChannel();
    const guild = {
        id: 'g1',
        channels: { cache: new Map([[channel.id, channel]]) },
    };
    return {
        id: `m${nextId++}`,
        content: 'hello there',
        author: { id: 'u1', tag: 'user#0001', createdTimestamp: Date.now() - 365 * 86400000 },
        member: {
            permissions: { has: () => false },
            moderatable: true,
            timeout: jest.fn().mockResolvedValue(),
        },
        guild,
        channel,
        client: { user: { id: 'bot', tag: 'bot#0001' } },
        attachments: new Map(),
        stickers: new Map(),
        embeds: [],
        mentions: { users: new Map(), roles: new Map(), everyone: false },
        delete: jest.fn().mockResolvedValue(),
        ...overrides,
    };
}

beforeEach(() => {
    clearAntiSpam();
    jest.clearAllMocks();
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('evaluateContentFilter', () => {
    test('clean text passes', () => {
        expect(evaluateContentFilter(makeMessage(), {})).toBeNull();
    });

    test('flags a slur, and honours the per-guild switch', () => {
        const msg = makeMessage({ content: 'you are a retard' });
        expect(evaluateContentFilter(msg, {})).toBe('Racism/Slurs');
        expect(evaluateContentFilter(msg, { contentFilterEnabled: false })).toBeNull();
    });

    test('looks inside embeds and attachment names', () => {
        const embed = makeMessage({ embeds: [{ title: 'vote trump', fields: [] }] });
        expect(evaluateContentFilter(embed, {})).toBe('American Politics');

        const file = makeMessage({ attachments: new Map([['a', { name: 'retard.png' }]]) });
        expect(evaluateContentFilter(file, {})).toBe('Racism/Slurs');
    });

    test('CJK only applies to young accounts outside exempt channels', () => {
        const old = makeMessage({ content: '你好' });
        expect(evaluateContentFilter(old, {})).toBeNull();

        const young = makeMessage({ content: '你好', author: { id: 'u2', tag: 'x', createdTimestamp: Date.now() - 86400000 } });
        expect(evaluateContentFilter(young, {})).toBe('Chinese/Korean/Japanese Characters');
        expect(evaluateContentFilter(young, { cjkExemptChannelIds: ['c1'] })).toBeNull();
    });
});

describe('enforceContentFilter', () => {
    test('deletes, notifies and records a warn', async () => {
        const msg = makeMessage({ content: 'trump' });
        await enforceContentFilter(msg, 'American Politics', {});
        expect(msg.delete).toHaveBeenCalled();
        expect(msg.channel.send).toHaveBeenCalledTimes(1);
        expect(tryRecordInfraction).toHaveBeenCalledWith(expect.objectContaining({ type: 'warn', reason: 'Auto-mod: American Politics' }));
    });

    test('still records the warn when the channel notice cannot be sent', async () => {
        const channel = makeChannel();
        channel.send.mockRejectedValue(new Error('Missing Access'));
        const msg = makeMessage({ channel, content: 'retard' });
        await enforceContentFilter(msg, 'Racism/Slurs', {});
        expect(tryRecordInfraction).toHaveBeenCalledTimes(1);
    });

    test('records nothing when the delete is refused', async () => {
        const msg = makeMessage();
        msg.delete.mockRejectedValue(Object.assign(new Error('Missing Permissions'), { code: 50013 }));
        await enforceContentFilter(msg, 'American Politics', {});
        expect(tryRecordInfraction).not.toHaveBeenCalled();
    });

    test('a message someone else already removed is left alone', async () => {
        const msg = makeMessage();
        msg.delete.mockRejectedValue(Object.assign(new Error('Unknown Message'), { code: 10008 }));
        await enforceContentFilter(msg, 'American Politics', {});
        expect(tryRecordInfraction).not.toHaveBeenCalled();
        expect(msg.channel.send).not.toHaveBeenCalled();
    });

    test('strike escalation only runs when the guild opted in', async () => {
        await enforceContentFilter(makeMessage(), 'American Politics', {});
        expect(checkStrikeEscalation).not.toHaveBeenCalled();

        await enforceContentFilter(makeMessage(), 'American Politics', { autoModStrikes: true });
        expect(checkStrikeEscalation).toHaveBeenCalledTimes(1);
    });
});

describe('runAntiSpam', () => {
    test('people who can manage messages are exempt', async () => {
        const msg = makeMessage({ content: 'discord.gg/abcdef' });
        msg.member.permissions.has = () => true;
        expect(await runAntiSpam(msg, {})).toBe(false);
        expect(msg.delete).not.toHaveBeenCalled();
    });

    test('a scam link is deleted and warned, and escalates when opted in', async () => {
        const msg = makeMessage({ content: 'free nitro at disc0rdnitro.com' });
        expect(await runAntiSpam(msg, { autoModStrikes: true })).toBe(true);
        expect(msg.delete).toHaveBeenCalled();
        expect(tryRecordInfraction).toHaveBeenCalledWith(expect.objectContaining({ type: 'warn', reason: 'Auto-mod: posted a phishing/scam link' }));
        expect(checkStrikeEscalation).toHaveBeenCalledTimes(1);
    });

    test('mass mentions delete the message and time the author out', async () => {
        const users = new Map(Array.from({ length: 6 }, (_, i) => [`m${i}`, {}]));
        const msg = makeMessage({ mentions: { users, roles: new Map(), everyone: false } });
        expect(await runAntiSpam(msg, {})).toBe(true);
        expect(msg.delete).toHaveBeenCalled();
        expect(msg.member.timeout).toHaveBeenCalled();
        expect(tryRecordInfraction).toHaveBeenCalledWith(expect.objectContaining({ type: 'timeout' }));
    });

    test('flooding times out, records and announces', async () => {
        let last;
        for (let i = 0; i < 6; i += 1) {
            last = makeMessage({ content: `message number ${i} different` });
            await runAntiSpam(last, {});
        }
        expect(last.delete).toHaveBeenCalled();
        expect(last.member.timeout).toHaveBeenCalled();
        expect(tryRecordInfraction).toHaveBeenCalledWith(expect.objectContaining({ type: 'timeout', reason: 'Auto-mod: message flooding' }));
        expect(last.channel.send).toHaveBeenCalledWith(expect.stringContaining('timed out for spamming'));
    });

    test('a refused timeout is NOT recorded or announced as if it worked', async () => {
        let last;
        for (let i = 0; i < 6; i += 1) {
            last = makeMessage({ content: `message number ${i} different` });
            last.member.timeout.mockRejectedValue(new Error('Missing Permissions'));
            await runAntiSpam(last, {});
        }
        expect(last.member.timeout).toHaveBeenCalled();
        expect(tryRecordInfraction).not.toHaveBeenCalled();
        expect(last.channel.send).not.toHaveBeenCalled();
        // The flood message itself is still removed.
        expect(last.delete).toHaveBeenCalled();
    });

    test('a member the bot cannot moderate is not timed out or recorded', async () => {
        let last;
        for (let i = 0; i < 6; i += 1) {
            last = makeMessage({ content: `message number ${i} different` });
            last.member.moderatable = false;
            await runAntiSpam(last, {});
        }
        expect(last.member.timeout).not.toHaveBeenCalled();
        expect(tryRecordInfraction).not.toHaveBeenCalled();
    });

    test('duplicate spam deletes every copy, across channels', async () => {
        const channelA = makeChannel('a');
        const channelB = makeChannel('b');
        const spam = 'CLAIM YOUR FREE GIFT AT THE LINK IN MY PROFILE';
        const first = makeMessage({ channel: channelA, content: spam });
        const second = makeMessage({ channel: channelB, content: spam });
        const third = makeMessage({ channel: channelA, content: spam });
        // All three messages belong to one guild so refs can be resolved.
        const guild = { id: 'g1', channels: { cache: new Map([['a', channelA], ['b', channelB]]) } };
        for (const m of [first, second, third]) m.guild = guild;

        await runAntiSpam(first, {});
        await runAntiSpam(second, {});
        expect(await runAntiSpam(third, {})).toBe(true);

        expect(channelA.messages.delete).toHaveBeenCalledWith(first.id);
        expect(channelB.messages.delete).toHaveBeenCalledWith(second.id);
        expect(channelA.messages.delete).toHaveBeenCalledWith(third.id);
        expect(tryRecordInfraction).toHaveBeenCalledWith(expect.objectContaining({ reason: 'Auto-mod: duplicate message spam' }));
    });

    test('normal chat passes untouched', async () => {
        const msg = makeMessage({ content: 'anyone up for a raid tonight?' });
        expect(await runAntiSpam(msg, {})).toBe(false);
        expect(msg.delete).not.toHaveBeenCalled();
    });
});
