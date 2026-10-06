/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

jest.mock('../src/utils/guildConfigCache', () => ({ getGuildConfig: jest.fn() }));

const { getGuildConfig } = require('../src/utils/guildConfigCache');
const { getAuditChannel, postAudit } = require('../src/utils/auditLog');

function guildWith(channel) {
    return { id: 'g1', channels: { cache: new Map(channel ? [[channel.id, channel]] : []) } };
}
const textChannel = (extra = {}) => ({ id: 'log1', isTextBased: () => true, send: jest.fn().mockResolvedValue({}), ...extra });

beforeEach(() => jest.resetAllMocks());

describe('getAuditChannel', () => {
    test('returns the configured mod-log channel', async () => {
        const ch = textChannel();
        getGuildConfig.mockResolvedValue({ modLogChannelId: 'log1' });
        expect(await getAuditChannel(guildWith(ch))).toBe(ch);
    });

    test('returns null when audit logging is switched off', async () => {
        getGuildConfig.mockResolvedValue({ modLogChannelId: 'log1', auditLogEnabled: false });
        expect(await getAuditChannel(guildWith(textChannel()))).toBeNull();
    });

    test('an unset switch counts as on', async () => {
        const ch = textChannel();
        getGuildConfig.mockResolvedValue({ modLogChannelId: 'log1' });
        expect(await getAuditChannel(guildWith(ch))).toBe(ch);
    });

    test('returns null when no channel is configured', async () => {
        getGuildConfig.mockResolvedValue({});
        expect(await getAuditChannel(guildWith(textChannel()))).toBeNull();
    });

    test('returns null when the configured channel no longer exists', async () => {
        getGuildConfig.mockResolvedValue({ modLogChannelId: 'gone' });
        expect(await getAuditChannel(guildWith(textChannel()))).toBeNull();
    });

    test('returns null when the configured channel cannot hold messages', async () => {
        getGuildConfig.mockResolvedValue({ modLogChannelId: 'log1' });
        expect(await getAuditChannel(guildWith(textChannel({ isTextBased: () => false })))).toBeNull();
    });

    test('works when the guild has no saved config at all', async () => {
        getGuildConfig.mockResolvedValue(null);
        expect(await getAuditChannel(guildWith(textChannel()))).toBeNull();
    });
});

describe('postAudit', () => {
    const entry = { title: 'TEST', color: 'danger', fields: [{ name: 'Member', value: 'someone' }] };

    test('sends one embed with no pings', async () => {
        const ch = textChannel();
        expect(await postAudit(guildWith(ch), entry, ch)).toBe(true);
        const payload = ch.send.mock.calls[0][0];
        expect(payload.embeds).toHaveLength(1);
        expect(payload.allowedMentions).toEqual({ parse: [] });
    });

    test('styles the header and field names like the rest of the bot', async () => {
        const ch = textChannel();
        await postAudit(guildWith(ch), entry, ch);
        const embed = ch.send.mock.calls[0][0].embeds[0].toJSON();
        expect(embed.author.name).toBe('⚡ SYSTEM.TEST');
        expect(embed.fields[0].name).toBe('> MEMBER');
        expect(embed.footer.text).toBe('GLITCH_HAVEN // AUDIT');
    });

    test('clamps an oversized field instead of failing to send', async () => {
        const ch = textChannel();
        await postAudit(guildWith(ch), { title: 'X', fields: [{ name: 'Big', value: 'z'.repeat(5000) }] }, ch);
        const embed = ch.send.mock.calls[0][0].embeds[0].toJSON();
        expect(embed.fields[0].value.length).toBeLessThanOrEqual(1024);
    });

    test('returns false and never throws when the send is rejected', async () => {
        const ch = textChannel({ send: jest.fn().mockRejectedValue(new Error('Missing Permissions')) });
        await expect(postAudit(guildWith(ch), entry, ch)).resolves.toBe(false);
    });

    test('does nothing when there is nowhere to post', async () => {
        getGuildConfig.mockResolvedValue({});
        expect(await postAudit(guildWith(null), entry)).toBe(false);
    });
});
