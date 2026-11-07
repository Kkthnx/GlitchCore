/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

jest.mock('../src/database/EventSchema', () => ({
    find: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn(), deleteOne: jest.fn(), create: jest.fn(),
}));

const { PermissionFlagsBits } = require('discord.js');
const Event = require('../src/database/EventSchema');
const { missingPermissions, sendWithFallback, isMissingPermissions } = require('../src/utils/channelAccess');
const { processStartingEvents } = require('../src/utils/eventManager');

function channelWith(granted, extra = {}) {
    return {
        id: 'c1',
        name: 'announcements',
        guild: { members: { me: {} } },
        permissionsFor: () => ({ has: flag => granted.some(name => PermissionFlagsBits[name] === flag) }),
        ...extra,
    };
}

const denied = () => Object.assign(new Error('Missing Permissions'), { code: 50013 });

describe('missingPermissions', () => {
    test('lists what the bot lacks', () => {
        const ch = channelWith(['ViewChannel', 'EmbedLinks']);
        expect(missingPermissions(ch, 'file')).toEqual(['SendMessages', 'AttachFiles']);
    });

    test('is empty when everything is granted', () => {
        const ch = channelWith(['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles']);
        expect(missingPermissions(ch, 'file')).toEqual([]);
    });

    test('is empty for a channel it cannot check', () => {
        expect(missingPermissions({}, 'file')).toEqual([]);
        expect(missingPermissions(null, 'file')).toEqual([]);
    });
});

describe('sendWithFallback', () => {
    test('retries without files when the attachment is refused', async () => {
        const send = jest.fn().mockRejectedValueOnce(denied()).mockResolvedValueOnce({ id: 'm' });
        await sendWithFallback({ send }, { embeds: [1], files: ['f'] });
        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1][0]).toEqual({ embeds: [1] });
    });

    test('rethrows when there was nothing to strip', async () => {
        const send = jest.fn().mockRejectedValue(denied());
        await expect(sendWithFallback({ send }, { embeds: [1], files: [] })).rejects.toThrow('Missing Permissions');
        expect(send).toHaveBeenCalledTimes(1);
    });

    test('rethrows other errors untouched', async () => {
        const boom = new Error('boom');
        const send = jest.fn().mockRejectedValue(boom);
        await expect(sendWithFallback({ send }, { files: ['f'] })).rejects.toBe(boom);
        expect(isMissingPermissions(boom)).toBe(false);
    });
});

describe('weekly event whose next card cannot be posted', () => {
    test('keeps the old card and record so the chain is not lost', async () => {
        const ev = {
            _id: 'e1', guildId: 'g1', channelId: 'c1', messageId: 'm1', title: 'Friday Night Gaming',
            game: 'WoW', hostId: 'h', status: 'STARTED', recurrence: 'weekly', spawnedNext: false,
            startsAt: new Date(Date.now() - 60 * 1000), going: [], maybe: [], waitlist: [], capacity: 0,
        };
        const send = jest.fn().mockRejectedValue(denied());
        const del = jest.fn().mockResolvedValue();
        const channel = { id: 'c1', send, messages: { fetch: jest.fn().mockResolvedValue({ delete: del }) } };
        const client = { guilds: { cache: new Map([['g1', { channels: { cache: new Map([['c1', channel]]) } }]]) } };

        Event.find.mockResolvedValue([{ _id: 'e1' }]);
        Event.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(ev) });
        Event.updateOne.mockResolvedValue({});

        await processStartingEvents(client);
        await new Promise(resolve => setImmediate(resolve));

        expect(Event.deleteOne).not.toHaveBeenCalled();
        expect(del).not.toHaveBeenCalled();
        expect(Event.updateOne).toHaveBeenLastCalledWith({ _id: 'e1' }, { $set: { spawnedNext: false } });
    });
});
