/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { humanizeDuration } = require('../../utils/duration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set slowmode (rate limit) on a channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false)
        .addIntegerOption(o => o.setName('seconds').setDescription('Seconds between messages (0 to turn off, max 21600)').setMinValue(0).setMaxValue(21600).setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Channel (defaults to here)').addChannelTypes(ChannelType.GuildText).setRequired(false)),

    async execute(interaction) {
        const seconds = interaction.options.getInteger('seconds');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        try {
            await channel.setRateLimitPerUser(seconds, `Slowmode by ${interaction.user.tag}`);
            return interaction.reply({
                content: seconds === 0 ? `✅ Slowmode turned off in ${channel}.` : `🐌 Slowmode in ${channel} set to **${humanizeDuration(seconds * 1000)}**.`,
                flags: MessageFlags.Ephemeral,
            });
        } catch (err) {
            return interaction.reply({ content: `Failed to set slowmode: ${err.message}`, flags: MessageFlags.Ephemeral });
        }
    },
};
