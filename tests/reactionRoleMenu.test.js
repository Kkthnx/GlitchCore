/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { buildMenuEmbed } = require('../src/utils/reactionRoleManager');

describe('buildMenuEmbed', () => {
    test('lists each pair using its stored label', () => {
        // Regression: the embed read `pair.display`, a field the schema never
        // had, so every line rendered "undefined for @Role".
        const embed = buildMenuEmbed({
            title: 'Game Roles',
            description: null,
            pairs: [
                { emoji: '🎮', label: '🎮', roleId: '111' },
                { emoji: '999', label: '<:glitch:999>', roleId: '222' },
            ],
        });

        expect(embed.data.description).toContain('🎮 for <@&111>');
        expect(embed.data.description).toContain('<:glitch:999> for <@&222>');
        expect(embed.data.description).not.toContain('undefined');
    });

    test('keeps the blurb above the role list', () => {
        const embed = buildMenuEmbed({
            title: 'Pings',
            description: 'Pick what you want pinged for.',
            pairs: [{ emoji: '🔔', label: '🔔', roleId: '333' }],
        });

        expect(embed.data.description.startsWith('Pick what you want pinged for.')).toBe(true);
        expect(embed.data.description).toContain('🔔 for <@&333>');
    });

    test('prompts a manager when the menu has no pairs yet', () => {
        const embed = buildMenuEmbed({ title: 'Empty', description: null, pairs: [] });
        expect(embed.data.description).toContain('/reactionrole add');
    });
});
