/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// The DM-then-act ordering for kick, ban and timeout, and the helpers that
// keep a failed history write from masquerading as a failed action.

jest.mock('../src/database/InfractionSchema', () => ({ create: jest.fn() }));
jest.mock('../src/utils/guildConfigCache', () => ({ getGuildConfig: jest.fn().mockResolvedValue({}) }));

const Infraction = require('../src/database/InfractionSchema');
const { withTargetNotice, tryRecordInfraction, notifyTarget } = require('../src/utils/moderationManager');

function makeUser({ dmFails = false } = {}) {
    const dm = { delete: jest.fn().mockResolvedValue() };
    return {
        id: 'u1',
        tag: 'user#0001',
        dm,
        send: dmFails ? jest.fn().mockRejectedValue(new Error('Cannot send messages to this user')) : jest.fn().mockResolvedValue(dm),
    };
}

const notice = (user) => ({ targetUser: user, guildName: 'Haven', type: 'ban', reason: 'spam' });

beforeEach(() => jest.clearAllMocks());

describe('notifyTarget', () => {
    test('resolves to the sent message so it can be retracted', async () => {
        const user = makeUser();
        expect(await notifyTarget(user, 'Haven', 'ban', 'spam')).toBe(user.dm);
    });

    test('resolves to null when the DM cannot be delivered', async () => {
        expect(await notifyTarget(makeUser({ dmFails: true }), 'Haven', 'ban', 'spam')).toBeNull();
    });
});

describe('withTargetNotice', () => {
    test('sends the DM before the action runs', async () => {
        const user = makeUser();
        const order = [];
        user.send.mockImplementation(async () => { order.push('dm'); return user.dm; });
        await withTargetNotice(notice(user), async () => { order.push('action'); });
        expect(order).toEqual(['dm', 'action']);
    });

    test('keeps the DM and returns the result when the action succeeds', async () => {
        const user = makeUser();
        const result = await withTargetNotice(notice(user), async () => 'banned');
        expect(result).toBe('banned');
        expect(user.dm.delete).not.toHaveBeenCalled();
    });

    test('retracts the DM and rethrows when the action fails', async () => {
        const user = makeUser();
        const boom = new Error('Missing Permissions');
        await expect(withTargetNotice(notice(user), async () => { throw boom; })).rejects.toBe(boom);
        expect(user.dm.delete).toHaveBeenCalledTimes(1);
    });

    test('closed DMs never block the action', async () => {
        const user = makeUser({ dmFails: true });
        const action = jest.fn().mockResolvedValue('done');
        expect(await withTargetNotice(notice(user), action)).toBe('done');
        expect(action).toHaveBeenCalledTimes(1);
    });

    test('a failed action with closed DMs still rethrows cleanly', async () => {
        const user = makeUser({ dmFails: true });
        await expect(withTargetNotice(notice(user), async () => { throw new Error('nope'); })).rejects.toThrow('nope');
    });
});

describe('tryRecordInfraction', () => {
    test('reports success', async () => {
        Infraction.create.mockResolvedValue({});
        expect(await tryRecordInfraction({
            guild: { id: 'g1', channels: { cache: new Map() } },
            targetUser: { id: 'u1', tag: 't' },
            moderator: { id: 'm1' },
            type: 'kick',
            reason: 'x',
        })).toBe(true);
    });

    test('reports a database failure instead of throwing', async () => {
        Infraction.create.mockRejectedValue(new Error('db down'));
        expect(await tryRecordInfraction({
            guild: { id: 'g1', channels: { cache: new Map() } },
            targetUser: { id: 'u1', tag: 't' },
            moderator: { id: 'm1' },
            type: 'kick',
            reason: 'x',
        })).toBe(false);
    });
});
