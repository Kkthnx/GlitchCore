const { parseDuration, clampTimeout, humanizeDuration, MAX_TIMEOUT_MS } = require('../src/utils/duration');

describe('parseDuration', () => {
    test('parses single units', () => {
        expect(parseDuration('45s')).toBe(45 * 1000);
        expect(parseDuration('10m')).toBe(10 * 60 * 1000);
        expect(parseDuration('2h')).toBe(2 * 60 * 60 * 1000);
        expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000);
    });

    test('sums compound units', () => {
        expect(parseDuration('1h30m')).toBe((60 + 30) * 60 * 1000);
    });

    test('rejects junk and zero', () => {
        expect(parseDuration('soon')).toBeNull();
        expect(parseDuration('')).toBeNull();
        expect(parseDuration(null)).toBeNull();
        expect(parseDuration('0m')).toBeNull();
    });
});

describe('clampTimeout', () => {
    test('caps at Discord max (28 days)', () => {
        expect(clampTimeout(parseDuration('60d'))).toBe(MAX_TIMEOUT_MS);
        expect(clampTimeout(parseDuration('10m'))).toBe(10 * 60 * 1000);
    });
});

describe('humanizeDuration', () => {
    test('formats readable strings', () => {
        expect(humanizeDuration(parseDuration('1d2h30m'))).toBe('1d 2h 30m');
        expect(humanizeDuration(0)).toBe('0s');
    });
});
