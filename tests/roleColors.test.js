const { smartColor } = require('../src/utils/roleColors');

describe('smartColor', () => {
    test('matches known games regardless of case/spacing', () => {
        expect(smartColor('Valorant')).toBe('#ff4655');
        expect(smartColor('  world of warcraft ')).toBe('#f4c430');
        expect(smartColor('WoW')).toBe('#f4c430');
        expect(smartColor('Minecraft')).toBe('#5ca935');
    });

    test('matches platforms and pings', () => {
        expect(smartColor('Xbox')).toBe('#107c10');
        expect(smartColor('PlayStation')).toBe('#1f6feb');
        expect(smartColor('Streams')).toBe('#9146ff'); // Twitch purple
    });

    test('returns null for unknown names (caller falls back to random)', () => {
        expect(smartColor('Some Indie Game')).toBeNull();
        expect(smartColor('')).toBeNull();
        expect(smartColor(null)).toBeNull();
    });
});
