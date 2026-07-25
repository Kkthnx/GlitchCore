/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder } = require('discord.js');
const { brandedEmbed, COLORS } = require('../../utils/brand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription("Show a user's avatar")
        .addUserOption(o => o.setName('target').setDescription('User (defaults to you)').setRequired(false)),

    async execute(interaction) {
        const user = interaction.options.getUser('target') || interaction.user;
        const url = user.displayAvatarURL({ dynamic: true, size: 1024 });
        const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven' })
            .setAuthor({ name: user.tag, iconURL: url })
            .setImage(url);
        return interaction.reply({ embeds: [embed] });
    },
};
