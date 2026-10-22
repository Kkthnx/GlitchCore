/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Tests for the XP flush state machine in src/utils/xpCache.js: what gets
// re-queued after a failed bulkWrite. A wrong re-queue silently inflates or
// drops XP, so the success / full-failure / partial-failure paths are pinned
// here. The User model is faked (same pattern as eventRsvpCommit.test.js) so
// the tests assert the re-queue behavior deterministically without a database.

jest.mock('../src/database/UserSchema', () => {
    const state = {
        // Set per test to control what bulkWrite does. Default: succeed.
        bulkWriteImpl: null,
        // Documents returned by User.find().lean() in the level-recompute step.
        findResult: [],
    };
    const query = value => ({ lean: () => Promise.resolve(value) });
    return {
        __state: state,
        bulkWrite: jest.fn((ops, opts) => state.bulkWriteImpl
            ? state.bulkWriteImpl(ops, opts)
            : Promise.resolve({})),
        find: jest.fn(() => query(state.findResult)),
    };
});

const User = require('../src/database/UserSchema');
const xpCache = require('../src/utils/xpCache');

beforeEach(() => {
    User.__state.bulkWriteImpl = null;
    User.__state.findResult = [];
    User.bulkWrite.mockClear();
    User.find.mockClear();
});

afterEach(async () => {
    // Drain anything a test left queued so the next test starts clean. The
    // module keeps its buffer in memory, so flushing (not re-requiring) is
    // what resets it. The default mock succeeds, which also closes the
    // circuit breaker a failure test may have opened.
    User.__state.bulkWriteImpl = null;
    await xpCache.flushXpBuffer();
});

// userIds of the updateOne ops a bulkWrite call carried, in order.
function opUserIds(ops) {
    return ops.map(op => op.updateOne.filter.userId);
}

describe('flushXpBuffer', () => {
    test('flush writes the batch once and clears the buffer', async () => {
        xpCache.queueXp('u1', 'g1', 10, 'c1');
        xpCache.queueXp('u1', 'g1', 5, 'c1'); // same user merges into one entry
        xpCache.queueXp('u2', 'g1', 20, 'c1', { isMessage: false });

        await xpCache.flushXpBuffer();

        expect(User.bulkWrite).toHaveBeenCalledTimes(1);
        expect(opUserIds(User.bulkWrite.mock.calls[0][0])).toEqual(['u1', 'u2']);
        // upserts carry the $inc payloads
        const u1op = User.bulkWrite.mock.calls[0][0][0].updateOne;
        expect(u1op.update.$inc).toEqual({ xp: 15, totalMessages: 2 });
        expect(u1op.upsert).toBe(true);

        // A second flush is a no-op: nothing was re-queued.
        await xpCache.flushXpBuffer();
        expect(User.bulkWrite).toHaveBeenCalledTimes(1);
    });

    test('total failure re-queues the whole batch', async () => {
        // No writeErrors on the error: nothing is known to be saved (e.g. the
        // database was unreachable), so the whole batch must go back.
        User.__state.bulkWriteImpl = async () => {
            throw new Error('connection closed');
        };

        xpCache.queueXp('u1', 'g1', 10, 'c1');
        xpCache.queueXp('u2', 'g1', 20, 'c1');
        await xpCache.flushXpBuffer();
        expect(User.bulkWrite).toHaveBeenCalledTimes(1);

        // The retry carries everything, exactly once.
        User.__state.bulkWriteImpl = null;
        await xpCache.flushXpBuffer();
        expect(User.bulkWrite).toHaveBeenCalledTimes(2);
        expect(opUserIds(User.bulkWrite.mock.calls[1][0])).toEqual(['u1', 'u2']);
    });

    test('partial failure re-queues only the failed entries', async () => {
        const applied = [];
        User.__state.bulkWriteImpl = async (ops) => {
            // The driver applies all but op 1, then reports the batch the way
            // a real partial failure looks: err.writeErrors carries the failed
            // op indexes into the ops array that was sent.
            applied.push(...opUserIds(ops.filter((_, i) => i !== 1)));
            const err = new Error('E11000 duplicate key error');
            err.writeErrors = [{ index: 1, code: 11000, errmsg: 'E11000 duplicate key error' }];
            throw err;
        };

        xpCache.queueXp('u1', 'g1', 10, 'c1');
        xpCache.queueXp('u2', 'g1', 20, 'c1');
        xpCache.queueXp('u3', 'g1', 30, 'c1');
        await xpCache.flushXpBuffer();

        // u1 and u3 landed on the first attempt; only u2 is retried. The old
        // code re-queued everything here and double-counted u1 and u3.
        User.__state.bulkWriteImpl = async (ops) => {
            applied.push(...opUserIds(ops));
            return {};
        };
        await xpCache.flushXpBuffer();

        expect(applied).toEqual(['u1', 'u3', 'u2']);
        expect(opUserIds(User.bulkWrite.mock.calls[1][0])).toEqual(['u2']);
    });

    test('ambiguous write-concern failure re-queues the whole batch', async () => {
        // A write-concern error means the writes may or may not have landed,
        // so the conservative choice is to retry everything.
        User.__state.bulkWriteImpl = async () => {
            const err = new Error('write concern failed');
            err.writeConcernError = { code: 64, errmsg: 'waiting for replication timed out' };
            err.writeErrors = [];
            throw err;
        };

        xpCache.queueXp('u1', 'g1', 10, 'c1');
        await xpCache.flushXpBuffer();

        User.__state.bulkWriteImpl = null;
        await xpCache.flushXpBuffer();
        expect(User.bulkWrite).toHaveBeenCalledTimes(2);
        expect(opUserIds(User.bulkWrite.mock.calls[1][0])).toEqual(['u1']);
    });

    test('level recompute failure does not re-queue saved XP', async () => {
        // Step 1 succeeds (the increments are saved), step 2 fails: the XP
        // must NOT go back in the queue, or the next flush would double-count
        // it. The failure is logged and swallowed by design.
        User.__state.findResult = [{ userId: 'u1', guildId: 'g1', xp: 200, level: 0 }];
        let calls = 0;
        User.__state.bulkWriteImpl = async () => {
            calls += 1;
            if (calls === 2) throw new Error('level write failed');
            return {};
        };

        xpCache.queueXp('u1', 'g1', 10, 'c1');
        await xpCache.flushXpBuffer();

        expect(calls).toBe(2); // increments + failed level write
        // Nothing was re-queued: the next flush is a no-op.
        await xpCache.flushXpBuffer();
        expect(calls).toBe(2);
    });
});
