/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { brandedEmbed, COLORS } = require('../../utils/brand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Show info about a user')
        .setContexts(InteractionContextType.Guild)
        .addUserOption(o => o.setName('target').setDescription('User to look up (defaults to you)').setRequired(false)),

    async execute(interaction) {
        const user = interaction.options.getUser('target') || interaction.user;
        const member = interaction.options.getMember('target') || (user.id === interaction.user.id ? interaction.member : null);

        const embed = brandedEmbed({ color: member?.displayHexColor && member.displayHexColor !== '#000000' ? member.displayHexColor : COLORS.primary, footer: 'Glitch Haven' })
            .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
            .setThumbnail(user.displayAvatarURL({ size: 256 }))
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
            const roles = [...member.roles.cache.values()]
                .filter(r => r.id !== interaction.guild.id)
                .sort((a, b) => b.position - a.position);
            // Cap the list so a member with dozens of roles can't overflow the
            // embed field, and say so rather than silently truncating.
            const shown = roles.slice(0, 20);
            const label = roles.length > shown.length
                ? `Roles (${shown.length} of ${roles.length})`
                : `Roles (${roles.length})`;
            embed.addFields({
                name: label,
                value: shown.length ? shown.map(r => `<@&${r.id}>`).join(' ') : 'None',
            });
        }

        return interaction.reply({ embeds: [embed] });
    },
};
