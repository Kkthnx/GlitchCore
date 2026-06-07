const { xpRequiredForLevel } = require('../src/utils/calculateXp');

describe('xpRequiredForLevel', () => {
    test('level 0 requires 0 XP', () => {
        expect(xpRequiredForLevel(0)).toBe(0);
    });

    test('matches the documented curve for the first few levels', () => {
        expect(xpRequiredForLevel(1)).toBe(150);
        expect(xpRequiredForLevel(2)).toBe(382);
    });

    test('is strictly increasing', () => {
        for (let level = 0; level < 100; level++) {
            expect(xpRequiredForLevel(level + 1)).toBeGreaterThan(xpRequiredForLevel(level));
        }
    });

    test('always returns an integer', () => {
        for (let level = 0; level < 50; level++) {
            expect(Number.isInteger(xpRequiredForLevel(level))).toBe(true);
        }
    });
});
