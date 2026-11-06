/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

jest.mock('../src/database/LfgSchema', () => ({ create: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/utils/steamGridClient', () => ({ fetchGameBanner: jest.fn().mockResolvedValue(null) }));
jest.mock('../src/utils/guildConfigCache', () => ({ getGuildConfig: jest.fn() }));
jest.mock('../src/utils/channels', () => ({ lfg: 'env-chan', roles: {} }));

const { getGuildConfig } = require('../src/utils/guildConfigCache');
const LfgSession = require('../src/database/LfgSchema');
const { handleModalSubmit } = require('../src/utils/lfgManager');

function makeInteraction(fields) {
    const send = chan => jest.fn().mockResolvedValue({ id: 'm1', url: `https://discord.com/${chan}` });
    const channels = new Map([
        ['env-chan', { id: 'env-chan', send: send('env') }],
        ['guild-chan', { id: 'guild-chan', send: send('guild') }],
    ]);
    return {
        channels,
        interaction: {
            user: { id: 'u1', username: 'kk' },
            guild: { id: 'g1', channels: { cache: channels } },
            fields: { getTextInputValue: id => fields[id] },
            reply: jest.fn().mockResolvedValue(),
            deferReply: jest.fn().mockResolvedValue(),
            editReply: jest.fn().mockResolvedValue(),
        },
    };
}

const FIELDS = { lfg_game: 'Valorant', lfg_activity: 'Ranked', lfg_slots: '5' };

beforeEach(() => jest.clearAllMocks());

describe('LFG channel selection', () => {
    test('uses the per-server setting when one is set', async () => {
        getGuildConfig.mockResolvedValue({ lfgChannelId: 'guild-chan' });
        const { interaction, channels } = makeInteraction(FIELDS);

        await handleModalSubmit(interaction);

        expect(channels.get('guild-chan').send).toHaveBeenCalledTimes(1);
        expect(channels.get('env-chan').send).not.toHaveBeenCalled();
        expect(LfgSession.create).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'guild-chan' }));
    });

    test('falls back to the environment channel when no setting exists', async () => {
        getGuildConfig.mockResolvedValue({});
        const { interaction, channels } = makeInteraction(FIELDS);

        await handleModalSubmit(interaction);

        expect(channels.get('env-chan').send).toHaveBeenCalledTimes(1);
    });
});

describe('LFG text screening', () => {
    test('refuses a filtered game name before anything is posted', async () => {
        getGuildConfig.mockResolvedValue({ lfgChannelId: 'guild-chan' });
        const { interaction, channels } = makeInteraction({ ...FIELDS, lfg_game: 'Trump simulator' });

        await handleModalSubmit(interaction);

        expect(channels.get('guild-chan').send).not.toHaveBeenCalled();
        expect(LfgSession.create).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalled();
    });
});
