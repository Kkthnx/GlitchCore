/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

jest.mock('../src/database/CountingSchema', () => ({ findOneAndUpdate: jest.fn() }));
jest.mock('../src/utils/autoMod', () => ({ postTempNotice: jest.fn().mockResolvedValue(null) }));

const Counting = require('../src/database/CountingSchema');
const { postTempNotice } = require('../src/utils/autoMod');
const { evaluateCount, handleCountingMessage } = require('../src/utils/countingManager');

// findOneAndUpdate(...).lean() is how the manager reads results.
const resolves = value => ({ lean: () => Promise.resolve(value) });

describe('evaluateCount', () => {
    const state = { current: 7, lastUserId: 'alice' };

    test('accepts the next number from someone new', () => {
        expect(evaluateCount(state, 'bob', '8')).toEqual({ kind: 'ok', number: 8 });
    });

    test('tolerates surrounding whitespace', () => {
        expect(evaluateCount(state, 'bob', '  8 ')).toEqual({ kind: 'ok', number: 8 });
    });

    test('rejects the same member counting twice', () => {
        expect(evaluateCount(state, 'alice', '8')).toEqual({ kind: 'repeat', number: 8 });
    });

    test('a number that was already taken is late, not a reset', () => {
        expect(evaluateCount(state, 'bob', '7')).toEqual({ kind: 'late', number: 7 });
        expect(evaluateCount(state, 'bob', '3')).toEqual({ kind: 'late', number: 3 });
    });

    test('a skipped number resets', () => {
        expect(evaluateCount(state, 'bob', '10')).toEqual({ kind: 'wrong', number: 10 });
    });

    test('ordinary chat is ignored', () => {
        expect(evaluateCount(state, 'bob', 'nice one')).toEqual({ kind: 'ignore' });
        expect(evaluateCount(state, 'bob', '8 lol')).toEqual({ kind: 'ignore' });
        expect(evaluateCount(state, 'bob', '')).toEqual({ kind: 'ignore' });
        expect(evaluateCount(state, 'bob', '-8')).toEqual({ kind: 'ignore' });
    });

    test('very long digit strings are ignored instead of parsed', () => {
        expect(evaluateCount(state, 'bob', '9'.repeat(40))).toEqual({ kind: 'ignore' });
    });

    test('a fresh game starts at 1', () => {
        const fresh = { current: 0, lastUserId: null };
        expect(evaluateCount(fresh, 'bob', '1')).toEqual({ kind: 'ok', number: 1 });
        expect(evaluateCount(fresh, 'bob', '2')).toEqual({ kind: 'wrong', number: 2 });
    });
});

describe('handleCountingMessage', () => {
    function makeMessage(content, userId = 'bob') {
        return {
            content,
            author: { id: userId },
            guild: { id: 'g1' },
            channel: { send: jest.fn().mockResolvedValue({}) },
            react: jest.fn().mockResolvedValue(),
            delete: jest.fn().mockResolvedValue(),
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('a correct count reacts and advances atomically', async () => {
        Counting.findOneAndUpdate
            .mockReturnValueOnce(resolves({ current: 7, lastUserId: 'alice', highScore: 20 }))
            .mockReturnValueOnce(resolves({ current: 8 }));
        const message = makeMessage('8');

        await handleCountingMessage(message);

        const [filter] = Counting.findOneAndUpdate.mock.calls[1];
        expect(filter).toMatchObject({ guildId: 'g1', current: 7, lastUserId: { $ne: 'bob' } });
        expect(message.react).toHaveBeenCalledWith('✅');
    });

    test('losing the race to another member deletes the message', async () => {
        Counting.findOneAndUpdate
            .mockReturnValueOnce(resolves({ current: 7, lastUserId: 'alice', highScore: 20 }))
            .mockReturnValueOnce(resolves(null));
        const message = makeMessage('8');

        await handleCountingMessage(message);

        expect(message.delete).toHaveBeenCalled();
        expect(message.react).not.toHaveBeenCalled();
    });

    test('a wrong number resets the count and says where it ended', async () => {
        Counting.findOneAndUpdate
            .mockReturnValueOnce(resolves({ current: 7, lastUserId: 'alice', highScore: 20 }))
            .mockReturnValueOnce(resolves({ current: 7 }));
        const message = makeMessage('12');

        await handleCountingMessage(message);

        expect(Counting.findOneAndUpdate.mock.calls[1][1]).toMatchObject({ $set: { current: 0, lastUserId: null } });
        expect(message.channel.send.mock.calls[0][0].content).toMatch(/ruined it at \*\*7\*\*/);
    });

    test('a milestone number gets a cheer', async () => {
        Counting.findOneAndUpdate
            .mockReturnValueOnce(resolves({ current: 99, lastUserId: 'alice', highScore: 120 }))
            .mockReturnValueOnce(resolves({ current: 100 }));
        const message = makeMessage('100');

        await handleCountingMessage(message);

        expect(message.channel.send.mock.calls[0][0]).toMatch(/100!/);
    });

    test('chat does not touch the count', async () => {
        Counting.findOneAndUpdate.mockReturnValueOnce(resolves({ current: 7, lastUserId: 'alice', highScore: 20 }));
        const message = makeMessage('gg everyone');

        await handleCountingMessage(message);

        expect(Counting.findOneAndUpdate).toHaveBeenCalledTimes(1);
        expect(message.react).not.toHaveBeenCalled();
    });

    test('counting twice in a row warns and keeps the count', async () => {
        Counting.findOneAndUpdate.mockReturnValueOnce(resolves({ current: 7, lastUserId: 'bob', highScore: 20 }));
        const message = makeMessage('8', 'bob');

        await handleCountingMessage(message);

        expect(message.react).toHaveBeenCalledWith('❌');
        expect(postTempNotice).toHaveBeenCalled();
        expect(Counting.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });
});
