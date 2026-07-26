/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder } = require('discord.js');
const { brandedEmbed, COLORS } = require('../../utils/brand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Show info about a user')
        .setDMPermission(false)
        .addUserOption(o => o.setName('target').setDescription('User to look up (defaults to you)').setRequired(false)),

    async execute(interaction) {
        const user = interaction.options.getUser('target') || interaction.user;
        const member = interaction.options.getMember('target') || (user.id === interaction.user.id ? interaction.member : null);

        const embed = brandedEmbed({ color: member?.displayHexColor && member.displayHexColor !== '#000000' ? member.displayHexColor : COLORS.primary, footer: 'Glitch Haven' })
            .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true }) })
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: 'User', value: `<@${user.id}>`, inline: true },
                { name: 'ID', value: `\`${user.id}\``, inline: true },
                { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
                { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
            );

        if (member) {
            if (member.joinedTimestamp) {
                embed.addFields({ name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true });
            }
            const roles = member.roles.cache.filter(r => r.id !== interaction.guild.id).sort((a, b) => b.position - a.position);
            embed.addFields({
                name: `Roles (${roles.size})`,
                value: roles.size ? roles.map(r => `<@&${r.id}>`).slice(0, 20).join(' ') : 'None',
            });
        }

        return interaction.reply({ embeds: [embed] });
    },
};
