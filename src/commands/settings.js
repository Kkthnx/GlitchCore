/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getOrCreateGuildConfig, invalidateGuildConfig } = require('../utils/guildConfigCache');

// Ranges for the numeric settings. These are guard rails, not taste: a zero or
// negative tick length divides by zero in the voice XP loop, and an absurd
// per-tick value inflates the whole leaderboard.
const NUMERIC_BOUNDS = {
    textCooldownSeconds: { min: 0, max: 3600 },
    voiceXpPerTick: { min: 1, max: 1000 },
    voiceTickMinutes: { min: 1, max: 1440 },
    starboardThreshold: { min: 1, max: 100 },
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('View or update GlitchCore settings for this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View current server configuration'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Update a server setting')
                .addStringOption(option =>
                    option.setName('key')
                        .setDescription('The setting name to update')
                        .setRequired(true)
                        .addChoices(
                            { name: 'xp_enabled', value: 'xpEnabled' },
                            { name: 'voice_xp_enabled', value: 'voiceXpEnabled' },
                            { name: 'anti_spam_enabled', value: 'antiSpamEnabled' },
                            { name: 'content_filter_enabled', value: 'contentFilterEnabled' },
                            { name: 'lfg_channel_id', value: 'lfgChannelId' },
                            { name: 'lfg_ping_role_id', value: 'lfgPingRoleId' },
                            { name: 'announcements_channel_id', value: 'announcementsChannelId' },
                            { name: 'levelup_log_channel_id', value: 'levelUpLogChannelId' },
                            { name: 'mod_log_channel_id', value: 'modLogChannelId' },
                            { name: 'double_xp_role_id', value: 'doubleXpRoleId' },
                            { name: 'starboard_channel_id', value: 'starboardChannelId' },
                            { name: 'starboard_threshold', value: 'starboardThreshold' },
                            { name: 'starboard_emoji', value: 'starboardEmoji' },
                            { name: 'streamer_channel_id', value: 'streamerChannelId' },
                            { name: 'streamer_ping_role_id', value: 'streamerPingRoleId' },
                            { name: 'suggestion_channel_id', value: 'suggestionChannelId' },
                            { name: 'text_cooldown_seconds', value: 'textCooldownSeconds' },
                            { name: 'voice_xp_per_tick', value: 'voiceXpPerTick' },
                            { name: 'voice_tick_minutes', value: 'voiceTickMinutes' },
                        ))
                .addStringOption(option =>
                    option.setName('value')
                        .setDescription('The new value for the setting')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reward')
                .setDescription('Add or remove a level reward role')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('add or remove')
                        .setRequired(true)
                        .addChoices(
                            { name: 'add', value: 'add' },
                            { name: 'remove', value: 'remove' },
                        ))
                .addIntegerOption(option =>
                    option.setName('level')
                        .setDescription('Level threshold for the role reward')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Role to grant at that level')
                        .setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        const config = await getOrCreateGuildConfig(guildId);

        if (subcommand === 'view') {
            const fields = [
                `xpEnabled: ${config.xpEnabled}`,
                `voiceXpEnabled: ${config.voiceXpEnabled}`,
                `lfgChannelId: ${config.lfgChannelId || 'not set'}`,
                `announcementsChannelId: ${config.announcementsChannelId || 'not set'}`,
                `levelUpLogChannelId: ${config.levelUpLogChannelId || 'not set'}`,
                `modLogChannelId: ${config.modLogChannelId || 'not set'}`,
                `doubleXpRoleId: ${config.doubleXpRoleId || 'not set'}`,
                `antiSpamEnabled: ${config.antiSpamEnabled}`,
                `contentFilterEnabled: ${config.contentFilterEnabled}`,
                `selfRoles: ${config.selfRoles?.length || 0} configured (manage with /roles)`,
                `textCooldownSeconds: ${config.textCooldownSeconds}`,
                `voiceXpPerTick: ${config.voiceXpPerTick}`,
                `voiceTickMinutes: ${config.voiceTickMinutes}`,
                `levelRewardRoles: ${config.levelRewardRoles.map(r => `level ${r.level}: <@&${r.roleId}>`).join(', ') || 'none'}`,
            ];
            return interaction.reply({ content: fields.join('\n'), flags: MessageFlags.Ephemeral });
        }

        if (subcommand === 'set') {
            const key = interaction.options.getString('key');
            const value = interaction.options.getString('value');

            if (NUMERIC_BOUNDS[key]) {
                const { min, max } = NUMERIC_BOUNDS[key];
                const n = Number(value);
                // Number('') is 0 and Number(' ') is 0, so isNaN alone lets an
                // empty value through as zero. voiceTickMinutes: 0 then divides
                // by zero in the voice tick and writes Infinity XP to everyone
                // it touches, so each key carries an explicit range.
                if (value.trim() === '' || !Number.isInteger(n)) {
                    return interaction.reply({ content: `\`${key}\` must be a whole number.`, flags: MessageFlags.Ephemeral });
                }
                if (n < min || n > max) {
                    return interaction.reply({ content: `\`${key}\` must be between ${min} and ${max}.`, flags: MessageFlags.Ephemeral });
                }
                config[key] = n;
            } else if (['xpEnabled', 'voiceXpEnabled', 'antiSpamEnabled', 'contentFilterEnabled'].includes(key)) {
                if (!['true', 'false'].includes(value.toLowerCase())) {
                    return interaction.reply({ content: 'That value must be true or false.', flags: MessageFlags.Ephemeral });
                }
                config[key] = value.toLowerCase() === 'true';
            } else {
                config[key] = value;
            }

            await config.save();
            invalidateGuildConfig(guildId);
            return interaction.reply({ content: `Updated \`${key}\` to \`${value}\`.`, flags: MessageFlags.Ephemeral });
        }

        if (subcommand === 'reward') {
            const action = interaction.options.getString('action');
            const level = interaction.options.getInteger('level');
            const role = interaction.options.getRole('role');

            if (action === 'add') {
                if (config.levelRewardRoles.some(r => r.level === level && r.roleId === role.id)) {
                    return interaction.reply({ content: 'That reward already exists.', flags: MessageFlags.Ephemeral });
                }
                config.levelRewardRoles.push({ level, roleId: role.id });
                await config.save();
                invalidateGuildConfig(guildId);
                return interaction.reply({ content: `Added role <@&${role.id}> as a reward for level ${level}.`, flags: MessageFlags.Ephemeral });
            }

            if (action === 'remove') {
                config.levelRewardRoles = config.levelRewardRoles.filter(r => !(r.level === level && r.roleId === role.id));
                await config.save();
                invalidateGuildConfig(guildId);
                return interaction.reply({ content: `Removed role <@&${role.id}> from the level ${level} rewards.`, flags: MessageFlags.Ephemeral });
            }
        }

        return interaction.reply({ content: 'Invalid settings command.', flags: MessageFlags.Ephemeral });
    },
};
