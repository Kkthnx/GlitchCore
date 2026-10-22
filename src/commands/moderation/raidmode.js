/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const { isRaidMode, setRaidMode, AUTO_DURATION_MS } = require('../../utils/raidMode');
const { logModAction } = require('../../utils/moderationManager');
const { humanizeDuration } = require('../../utils/duration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('raidmode')
        .setDescription('Hold new joins during a raid (no auto-role, no welcomes)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setContexts(InteractionContextType.Guild)
        .addSubcommand(s => s.setName('on').setDescription('Turn raid mode on')
            .addIntegerOption(o => o.setName('minutes').setDescription('How long (default 10)').setMinValue(1).setMaxValue(180).setRequired(false)))
        .addSubcommand(s => s.setName('off').setDescription('Turn raid mode off'))
        .addSubcommand(s => s.setName('status').setDescription('Check whether raid mode is active')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'status') {
            const active = isRaidMode(guildId);
            return interaction.reply({
                content: active ? '🚨 Raid mode is **on**, new joins are being held.' : 'Raid mode is off.',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (sub === 'off') {
            setRaidMode(guildId, false);
            await logModAction({
                guild: interaction.guild,
                moderator: interaction.user,
                title: 'Raid mode disabled',
                fields: [],
            });
            return interaction.reply({ content: 'Raid mode is off, joins are back to normal.', flags: MessageFlags.Ephemeral });
        }

        const minutes = interaction.options.getInteger('minutes') ?? Math.round(AUTO_DURATION_MS / 60000);
        setRaidMode(guildId, true, minutes * 60 * 1000, false);
        await logModAction({
            guild: interaction.guild,
            moderator: interaction.user,
            title: 'Raid mode enabled',
            fields: [{ name: 'Duration', value: humanizeDuration(minutes * 60 * 1000), inline: true }],
        });
        return interaction.reply({ content: `🚨 Raid mode is **on** for ${humanizeDuration(minutes * 60 * 1000)}. New joins get no role, no DM, no welcome post until it ends.`, flags: MessageFlags.Ephemeral });
    },
};
