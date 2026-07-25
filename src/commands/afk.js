/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { setAfk } = require('../utils/afkManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set yourself AFK — I\'ll let people know if they ping you')
        .setDMPermission(false)
        .addStringOption(o => o.setName('reason').setDescription('Why you\'re away').setRequired(false).setMaxLength(200)),

    async execute(interaction) {
        const reason = interaction.options.getString('reason') || 'AFK';
        setAfk(interaction.guild.id, interaction.user.id, reason);
        return interaction.reply({ content: `💤 You're now AFK: **${reason}**. I'll clear it when you send a message.`, flags: MessageFlags.Ephemeral });
    },
};
