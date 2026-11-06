/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

jest.mock('../src/database/ReminderSchema', () => ({ countDocuments: jest.fn(), create: jest.fn() }));
jest.mock('../src/database/SuggestionSchema', () => ({ create: jest.fn() }));
jest.mock('../src/utils/guildConfigCache', () => ({ getGuildConfig: jest.fn().mockResolvedValue({}) }));

const { screenText, TEXT_REFUSED } = require('../src/utils/textGuard');
const afk = require('../src/commands/afk');
const suggest = require('../src/commands/suggest');

describe('screenText', () => {
    test('lets ordinary text through', () => {
        expect(screenText('Ranked grind, bring snacks')).toBeNull();
        expect(screenText('World of Warcraft', 'Mythic+')).toBeNull();
    });

    test('skips empty and missing inputs', () => {
        expect(screenText()).toBeNull();
        expect(screenText('', null, undefined)).toBeNull();
    });

    test('flags text the word filter would delete', () => {
        expect(screenText('Trump rally night')).toBe('American Politics');
    });

    test('catches a violation in any one of several inputs', () => {
        expect(screenText('Valorant', 'ranked', 'Trump stuff')).toBe('American Politics');
    });

    test('flags invite and scam links', () => {
        expect(screenText('join discord.gg/abc123')).toBe('Invite link');
        expect(screenText('free-nitro.com for everyone')).toBe('Scam link');
    });

    test('allows CJK game titles, which are ordinary input here', () => {
        expect(screenText('리그 오브 레전드')).toBeNull();
        expect(screenText('原神')).toBeNull();
    });

    test('catches a filter bypass hidden with a zero-width character', () => {
        expect(screenText('Tru​mp rally')).toBe('American Politics');
    });
});

describe('commands that echo member text', () => {
    function makeInteraction(options) {
        return {
            guild: { id: 'g1', channels: { cache: new Map() } },
            channel: { id: 'c1' },
            user: { id: 'u1' },
            options: { getString: name => options[name] ?? null },
            reply: jest.fn().mockResolvedValue(),
            deferReply: jest.fn().mockResolvedValue(),
        };
    }

    test('/afk refuses a filtered reason and stores nothing', async () => {
        const interaction = makeInteraction({ reason: 'Trump rally' });
        await afk.execute(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toBe(TEXT_REFUSED);
    });

    test('/afk accepts a normal reason', async () => {
        const interaction = makeInteraction({ reason: 'getting food' });
        await afk.execute(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toMatch(/now AFK/);
    });

    test('/suggest refuses a filtered suggestion before posting anything', async () => {
        const interaction = makeInteraction({ text: 'Add a Trump channel' });
        await suggest.execute(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toBe(TEXT_REFUSED);
        expect(interaction.deferReply).not.toHaveBeenCalled();
    });
});
