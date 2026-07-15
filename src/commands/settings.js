const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const GuildConfig = require('../database/GuildConfigSchema');
const { invalidateGuildConfig } = require('../utils/guildConfigCache');
const logger = require('../utils/logger');

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
                            { name: 'lfg_channel_id', value: 'lfgChannelId' },
                            { name: 'announcements_channel_id', value: 'announcementsChannelId' },
                            { name: 'levelup_log_channel_id', value: 'levelUpLogChannelId' },
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

        let config = await GuildConfig.findOne({ guildId });
        if (!config) {
            config = await GuildConfig.create({ guildId });
        }

        if (subcommand === 'view') {
            const fields = [
                `xpEnabled: ${config.xpEnabled}`,
                `voiceXpEnabled: ${config.voiceXpEnabled}`,
                `lfgChannelId: ${config.lfgChannelId || 'not set'}`,
                `announcementsChannelId: ${config.announcementsChannelId || 'not set'}`,
                `levelUpLogChannelId: ${config.levelUpLogChannelId || 'not set'}`,
                `textCooldownSeconds: ${config.textCooldownSeconds}`,
                `voiceXpPerTick: ${config.voiceXpPerTick}`,
                `voiceTickMinutes: ${config.voiceTickMinutes}`,
                `levelRewardRoles: ${config.levelRewardRoles.map(r => `level ${r.level}: <@&${r.roleId}>`).join(', ') || 'none'}`,
            ];
            return interaction.reply({ content: fields.join('\n'), ephemeral: true });
        }

        if (subcommand === 'set') {
            const key = interaction.options.getString('key');
            const value = interaction.options.getString('value');

            const numericKeys = ['textCooldownSeconds', 'voiceXpPerTick', 'voiceTickMinutes'];
            if (numericKeys.includes(key)) {
                if (isNaN(value)) {
                    return interaction.reply({ content: 'That value must be a number.', ephemeral: true });
                }
                config[key] = Number(value);
            } else if (['xpEnabled', 'voiceXpEnabled'].includes(key)) {
                if (!['true', 'false'].includes(value.toLowerCase())) {
                    return interaction.reply({ content: 'That value must be true or false.', ephemeral: true });
                }
                config[key] = value.toLowerCase() === 'true';
            } else {
                config[key] = value;
            }

            await config.save();
            invalidateGuildConfig(guildId);
            return interaction.reply({ content: `Updated \`${key}\` to \`${value}\`.`, ephemeral: true });
        }

        if (subcommand === 'reward') {
            const action = interaction.options.getString('action');
            const level = interaction.options.getInteger('level');
            const role = interaction.options.getRole('role');

            if (action === 'add') {
                if (config.levelRewardRoles.some(r => r.level === level && r.roleId === role.id)) {
                    return interaction.reply({ content: 'That reward already exists.', ephemeral: true });
                }
                config.levelRewardRoles.push({ level, roleId: role.id });
                await config.save();
                invalidateGuildConfig(guildId);
                return interaction.reply({ content: `Added role <@&${role.id}> as a reward for level ${level}.`, ephemeral: true });
            }

            if (action === 'remove') {
                config.levelRewardRoles = config.levelRewardRoles.filter(r => !(r.level === level && r.roleId === role.id));
                await config.save();
                invalidateGuildConfig(guildId);
                return interaction.reply({ content: `Removed role <@&${role.id}> from the level ${level} rewards.`, ephemeral: true });
            }
        }

        return interaction.reply({ content: 'Invalid settings command.', ephemeral: true });
    },
};
