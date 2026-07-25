/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder } = require('discord.js');
const User = require('../../database/UserSchema');
const { brandedEmbed, COLORS } = require('../../utils/brand');
const { getUserRank } = require('../../utils/ranking');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Displays the top 10 highest-level members in Glitch Haven'),

    async execute(interaction) {
        await interaction.deferReply();

        // Fetch top 10 users sorted by level (descending) and then XP (descending)
        const topUsers = await User.find({ guildId: interaction.guild.id })
            .sort({ level: -1, xp: -1 })
            .limit(10);

        if (!topUsers.length) {
            return interaction.editReply('No one has earned any XP yet — be the first to start chatting!');
        }

        const embed = brandedEmbed({ color: COLORS.hype })
            .setTitle('🏆 Glitch Haven Leaderboard')
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }));

        const lines = topUsers.map((user, index) => {
            const marker = MEDALS[index] || `**#${index + 1}**`;
            // <@id> formats the user without notifying them inside an embed
            return `${marker} <@${user.userId}> — Level **${user.level}** · ${user.xp.toLocaleString()} XP`;
        });

        embed.setDescription(lines.join('\n'));

        // If the requester isn't in the top 10, append their standing so the
        // command is useful to everyone, not just the leaders.
        const inTop = topUsers.some(u => u.userId === interaction.user.id);
        if (!inTop) {
            const me = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
            if (me) {
                const rank = await getUserRank(interaction.guild.id, me.level, me.xp);
                embed.addFields({
                    name: 'Your Standing',
                    value: `**#${rank}** — Level **${me.level}** · ${me.xp.toLocaleString()} XP`,
                });
            }
        }

        await interaction.editReply({ embeds: [embed] });
    }
};
