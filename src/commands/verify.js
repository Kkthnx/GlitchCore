/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, InteractionContextType } = require('discord.js');
const { getOrCreateGuildConfig, invalidateGuildConfig } = require('../utils/guildConfigCache');
const { buildGatePanel } = require('../utils/verifyManager');
const { LIMITS, clamp } = require('../utils/embedText');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Set up the 18+ verification gate')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(s => s
            .setName('setup')
            .setDescription('Choose the role members get after verifying')
            .addRoleOption(o => o.setName('role').setDescription('Role granted on verify').setRequired(true)))
        .addSubcommand(s => s
            .setName('post')
            .setDescription('Post the verification panel in a channel')
            .addChannelOption(o => o.setName('channel').setDescription('Where to post it').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
            .addStringOption(o => o.setName('rules').setDescription('Custom rules text (leave blank for the default)').setMaxLength(1500)))
        .addSubcommand(s => s
            .setName('off')
            .setDescription('Turn the gate off and go back to the automatic member role')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guild = interaction.guild;
        const cfg = await getOrCreateGuildConfig(guild.id);

        if (sub === 'setup') {
            const role = interaction.options.getRole('role');
            const me = guild.members.me;
            if (role.managed || role.id === guild.id) {
                return interaction.reply({ content: 'Pick a normal role, not @everyone or a bot role.', flags: MessageFlags.Ephemeral });
            }
            if (me.roles.highest.comparePositionTo(role) <= 0) {
                return interaction.reply({ content: 'That role is above mine, so I could not hand it out. Move my role higher first.', flags: MessageFlags.Ephemeral });
            }
            cfg.verifyRoleId = role.id;
            await cfg.save();
            invalidateGuildConfig(guild.id);
            return interaction.reply({
                content: `Verifying now gives <@&${role.id}>. New joins no longer get the automatic member role, so lock your channels to this role, then run \`/verify post\`.`,
                flags: MessageFlags.Ephemeral,
                allowedMentions: { parse: [] },
            });
        }

        if (sub === 'post') {
            if (!cfg.verifyRoleId) {
                return interaction.reply({ content: 'Run `/verify setup` first.', flags: MessageFlags.Ephemeral });
            }
            const channel = interaction.options.getChannel('channel');
            const rules = interaction.options.getString('rules');
            const panel = buildGatePanel(rules ? clamp(rules, LIMITS.description - 200) : null);
            await channel.send(panel);
            return interaction.reply({ content: `Panel posted in ${channel}.`, flags: MessageFlags.Ephemeral });
        }

        cfg.verifyRoleId = null;
        await cfg.save();
        invalidateGuildConfig(guild.id);
        return interaction.reply({ content: 'Gate off. Existing panels will say verification is not set up.', flags: MessageFlags.Ephemeral });
    },
};
