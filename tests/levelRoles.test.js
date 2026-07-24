const { currentMilestone, roleNameFor, milestoneNameRegex } = require('../src/utils/levelRoles');

describe('currentMilestone', () => {
    test('returns the highest interval multiple at or below the level', () => {
        expect(currentMilestone(10, 10, 1000)).toBe(10);
        expect(currentMilestone(19, 10, 1000)).toBe(10);
        expect(currentMilestone(20, 10, 1000)).toBe(20);
        expect(currentMilestone(37, 10, 1000)).toBe(30);
    });

    test('returns 0 before the first milestone', () => {
        expect(currentMilestone(9, 10, 1000)).toBe(0);
        expect(currentMilestone(0, 10, 1000)).toBe(0);
    });

    test('caps at the configured max', () => {
        expect(currentMilestone(1500, 10, 1000)).toBe(1000);
        expect(currentMilestone(1000, 10, 1000)).toBe(1000);
    });

    test('disabled when interval is falsy', () => {
        expect(currentMilestone(50, 0, 1000)).toBe(0);
    });
});

describe('roleNameFor', () => {
    test('substitutes {level}', () => {
        expect(roleNameFor('Level {level}', 20)).toBe('Level 20');
        expect(roleNameFor('⭐ {level} Club', 100)).toBe('⭐ 100 Club');
    });
});

describe('milestoneNameRegex', () => {
    test('matches names the template produces and captures the number', () => {
        const re = milestoneNameRegex('Level {level}');
        expect(re.test('Level 10')).toBe(true);
        expect(re.test('Level 1000')).toBe(true);
        expect(re.test('Level Twenty')).toBe(false);
        expect(re.test('Some Level 10 thing')).toBe(false);
    });

    test('handles templates with regex-special characters', () => {
        const re = milestoneNameRegex('[{level}] Prestige');
        expect(re.test('[50] Prestige')).toBe(true);
        expect(re.test('50 Prestige')).toBe(false);
    });
});
