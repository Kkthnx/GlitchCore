/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Tests for the moderation patch round: duplicate-message detection, filter
// normalization, the scam-domain blocklist, rate-limit weighting, audit reason
// truncation, raid mode state, and the temp-ban unban retry logic. The pure
// detectors need no mocks; the temp-ban scheduler fakes its model the same way
// xpFlush.test.js does.

const {
    recordAndCheckRate,
    recordAndCheckDuplicate,
    containsInvite,
    containsScamDomain,
    _clearAll: clearAntiSpam,
} = require('../src/utils/antiSpam');
const { checkMessage, normalizeForFilter } = require('../src/utils/filterManager');
const { auditReason } = require('../src/utils/moderationManager');
const { isRaidMode, setRaidMode, recordHeldJoin, _clearAll: clearRaidMode } = require('../src/utils/raidMode');

beforeEach(() => {
    clearAntiSpam();
    clearRaidMode();
});

describe('recordAndCheckDuplicate', () => {
    test('trips when the same content repeats inside the window', () => {
        const now = 1_000_000;
        expect(recordAndCheckDuplicate('u', 'WIN FREE NITRO CLICK HERE NOW', now, 3, 30000)).toBe(false);
        expect(recordAndCheckDuplicate('u', 'WIN FREE NITRO CLICK HERE NOW', now + 1000, 3, 30000)).toBe(false);
        expect(recordAndCheckDuplicate('u', 'WIN FREE NITRO CLICK HERE NOW', now + 2000, 3, 30000)).toBe(true);
    });

    test('ignores short messages so normal chat never trips it', () => {
        const now = 2_000_000;
        expect(recordAndCheckDuplicate('u', 'lol', now, 3, 30000)).toBe(false);
        expect(recordAndCheckDuplicate('u', 'lol', now + 100, 3, 30000)).toBe(false);
        expect(recordAndCheckDuplicate('u', 'lol', now + 200, 3, 30000)).toBe(false);
    });

    test('old duplicates age out of the window', () => {
        const now = 3_000_000;
        recordAndCheckDuplicate('u', 'SOME LONG SPAM MESSAGE HERE', now, 3, 30000);
        recordAndCheckDuplicate('u', 'SOME LONG SPAM MESSAGE HERE', now + 1000, 3, 30000);
        expect(recordAndCheckDuplicate('u', 'SOME LONG SPAM MESSAGE HERE', now + 60000, 3, 30000)).toBe(false);
    });

    test('different content does not accumulate', () => {
        const now = 4_000_000;
        expect(recordAndCheckDuplicate('u', 'FIRST DISTINCT MESSAGE HERE', now, 2, 30000)).toBe(false);
        expect(recordAndCheckDuplicate('u', 'SECOND DISTINCT MESSAGE HERE', now + 100, 2, 30000)).toBe(false);
    });
});

describe('recordAndCheckRate weight', () => {
    test('heavy payloads trip sooner', () => {
        const now = 5_000_000;
        // maxMessages 5: a weight-3 message counts as three toward the bucket.
        expect(recordAndCheckRate('w', now, 5, 5000, 3)).toBe(false);
        expect(recordAndCheckRate('w', now + 100, 5, 5000, 3)).toBe(true);
    });

    test('weight defaults to one', () => {
        const now = 6_000_000;
        expect(recordAndCheckRate('x', now, 5, 5000)).toBe(false);
        expect(recordAndCheckRate('x', now + 100, 5, 5000)).toBe(false);
    });
});

describe('containsInvite', () => {
    test('catches dsc.gg links', () => {
        expect(containsInvite('join dsc.gg/abc123')).toBe(true);
        expect(containsInvite('https://dsc.gg/xyz')).toBe(true);
    });

    test('still catches the classic forms', () => {
        expect(containsInvite('discord.gg/abcd')).toBe(true);
    });
});

describe('containsScamDomain', () => {
    test.each([
        'free nitro at disc0rdnitro.com claim now',
        'https://discord-nitro.gift/abc',
        'steamcommunitygift.com/trade',
    ])('flags %s', (text) => {
        expect(containsScamDomain(text)).toBe(true);
    });

    test('ignores normal text', () => {
        expect(containsScamDomain('check out the new nitro features')).toBe(false);
        expect(containsScamDomain('')).toBe(false);
    });
});

describe('normalizeForFilter', () => {
    const ZWSP = String.fromCodePoint(0x200b);
    const ZWNJ = String.fromCodePoint(0x200c);

    test('strips zero-width characters', () => {
        expect(normalizeForFilter(`a${ZWSP}b${ZWNJ}c`)).toBe('abc');
    });

    test('folds fullwidth characters via NFKC', () => {
        expect(normalizeForFilter('ｒetard')).toBe('retard');
    });

    test('folds Cyrillic lookalikes', () => {
        // U+0435 CYRILLIC SMALL LETTER IE looks exactly like a Latin e.
        expect(normalizeForFilter('r\u0435tard')).toBe('retard'); // U+0435 CYRILLIC SMALL LETTER IE
    });

    test('checkMessage catches the obfuscated slur', () => {
        expect(checkMessage(`you are a re${ZWSP}tard`)).toBe('Racism/Slurs');
        expect(checkMessage('you are a r\u0435tard')).toBe('Racism/Slurs');
    });

    test('normalization does not create false positives', () => {
        expect(checkMessage('I love adding spice to my food')).toBeNull();
        expect(checkMessage('hey everyone, ready to raid tonight?')).toBeNull();
    });
});

describe('auditReason', () => {
    test('passes short reasons through untouched', () => {
        expect(auditReason('Mod#1234', 'spam')).toBe('Mod#1234: spam');
    });

    test('truncates the composed reason to 512 characters', () => {
        const long = 'x'.repeat(600);
        const result = auditReason('SomeVeryLongModeratorTag#9999', long);
        expect(result.length).toBeLessThanOrEqual(512);
        expect(result.startsWith('SomeVeryLongModeratorTag#9999: ')).toBe(true);
    });
});

describe('raidMode', () => {
    test('starts off, turns on and off', () => {
        expect(isRaidMode('g1')).toBe(false);
        setRaidMode('g1', true, 60000, false, 1000);
        expect(isRaidMode('g1', 2000)).toBe(true);
        setRaidMode('g1', false);
        expect(isRaidMode('g1', 2000)).toBe(false);
    });

    test('expires on its own', () => {
        setRaidMode('g1', true, 60000, true, 1000);
        expect(isRaidMode('g1', 61001)).toBe(false);
    });

    test('counts held joins', () => {
        setRaidMode('g1', true, 60000, false, 1000);
        expect(recordHeldJoin('g1')).toBe(1);
        expect(recordHeldJoin('g1')).toBe(2);
    });
});

describe('processDueUnbans retry logic', () => {
    const TempBan = require('../src/database/TempBanSchema');
    const { processDueUnbans } = require('../src/utils/tempBanManager');

    jest.mock('../src/database/TempBanSchema', () => {
        const state = { findResult: [] };
        const deleted = [];
        return {
            __state: state,
            __deleted: deleted,
            find: jest.fn(() => ({ limit: () => Promise.resolve(state.findResult) })),
            deleteOne: jest.fn(query => {
                deleted.push(query);
                return Promise.resolve({});
            }),
        };
    });

    function makeClient(unbanImpl) {
        const guild = { id: 'g1', members: { unban: unbanImpl } };
        return { guilds: { cache: new Map([['g1', guild]]) } };
    }

    beforeEach(() => {
        TempBan.__state.findResult = [];
        TempBan.__deleted.length = 0;
        TempBan.find.mockClear();
        TempBan.deleteOne.mockClear();
    });

    test('deletes the record after a successful unban', async () => {
        const ban = { _id: 'b1', guildId: 'g1', userId: 'u1' };
        TempBan.__state.findResult = [ban];
        await processDueUnbans(makeClient(jest.fn().mockResolvedValue()));
        expect(TempBan.deleteOne).toHaveBeenCalledWith({ _id: 'b1' });
    });

    test('deletes the record on 10026 (already unbanned)', async () => {
        const ban = { _id: 'b2', guildId: 'g1', userId: 'u2' };
        TempBan.__state.findResult = [ban];
        const err = new Error('Unknown Ban');
        err.code = 10026;
        await processDueUnbans(makeClient(jest.fn().mockRejectedValue(err)));
        expect(TempBan.deleteOne).toHaveBeenCalledWith({ _id: 'b2' });
    });

    test('keeps the record on permission errors so the next tick retries', async () => {
        const ban = { _id: 'b3', guildId: 'g1', userId: 'u3' };
        TempBan.__state.findResult = [ban];
        const err = new Error('Missing Permissions');
        err.code = 50013;
        await processDueUnbans(makeClient(jest.fn().mockRejectedValue(err)));
        expect(TempBan.deleteOne).not.toHaveBeenCalled();
    });

    test('skips guilds the shard does not serve', async () => {
        TempBan.__state.findResult = [{ _id: 'b4', guildId: 'elsewhere', userId: 'u4' }];
        const unban = jest.fn();
        await processDueUnbans(makeClient(unban));
        expect(unban).not.toHaveBeenCalled();
        expect(TempBan.deleteOne).not.toHaveBeenCalled();
    });
});
