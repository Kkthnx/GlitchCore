const { recordAndCheckRate, containsInvite, mentionCount, _clearAll } = require('../src/utils/antiSpam');

beforeEach(() => _clearAll());

describe('recordAndCheckRate', () => {
    test('trips once messages exceed the limit within the window', () => {
        const now = 1_000_000;
        // maxMessages = 3, window = 5s. The 4th message within the window trips.
        expect(recordAndCheckRate('u', now, 3, 5000)).toBe(false);
        expect(recordAndCheckRate('u', now + 100, 3, 5000)).toBe(false);
        expect(recordAndCheckRate('u', now + 200, 3, 5000)).toBe(false);
        expect(recordAndCheckRate('u', now + 300, 3, 5000)).toBe(true);
    });

    test('old messages outside the window do not count', () => {
        const now = 2_000_000;
        recordAndCheckRate('v', now, 3, 5000);
        recordAndCheckRate('v', now + 1000, 3, 5000);
        recordAndCheckRate('v', now + 2000, 3, 5000);
        // 10s later the earlier ones have aged out — should not trip.
        expect(recordAndCheckRate('v', now + 12000, 3, 5000)).toBe(false);
    });
});

describe('containsInvite', () => {
    test.each([
        'join here discord.gg/abcd',
        'https://discord.gg/xyz',
        'http://discord.com/invite/foo',
        'discordapp.com/invite/bar',
    ])('detects %s', (text) => {
        expect(containsInvite(text)).toBe(true);
    });

    test('ignores normal text', () => {
        expect(containsInvite('check out my discord server later')).toBe(false);
        expect(containsInvite('')).toBe(false);
    });
});

describe('mentionCount', () => {
    test('sums users, roles, and everyone', () => {
        const message = {
            mentions: {
                users: { size: 3 },
                roles: { size: 1 },
                everyone: true,
            },
        };
        expect(mentionCount(message)).toBe(5);
    });

    test('handles empty mentions', () => {
        expect(mentionCount({ mentions: { users: { size: 0 }, roles: { size: 0 }, everyone: false } })).toBe(0);
    });
});
