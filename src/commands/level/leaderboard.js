/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../database/UserSchema');
const { PALETTE } = require('../../utils/brand');
const { getUserRank } = require('../../utils/ranking');

const MEDALS = ['🥇', '🥈', '🥉'];
const ESC = '\x1b';
const G = `${ESC}[1;32m`;
const Y = `${ESC}[1;33m`;
const RST = `${ESC}[0m`;

function rankTag(i) {
    return MEDALS[i] || `\`#${String(i + 1).padStart(2, '0')}\``;
}
function playerLine(tag, userId, level, xp) {
    return `${tag} <@${userId}> \`LV ${level}\` \`${xp.toLocaleString()} XP\``;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show the top ranked members in Glitch Haven'),

    async execute(interaction) {
        await interaction.deferReply();
        const guildId = interaction.guild.id;

        const [topUsers, totalRanked] = await Promise.all([
            User.find({ guildId }).sort({ level: -1, xp: -1 }).limit(10),
            User.countDocuments({ guildId }),
        ]);

        if (!topUsers.length) {
            return interaction.editReply('`ERROR_204` : No rankings yet. Be the first to start chatting.');
        }

        const header = [
            '```ansi',
            `${G}> DECRYPTING RANKINGS...${RST}`,
            `${G}PLAYERS${RST} : ${Y}${totalRanked.toLocaleString()}${RST}`,
            '```',
        ].join('\n');

        const lines = topUsers.map((u, i) => playerLine(rankTag(i), u.userId, u.level, u.xp));

        const embed = new EmbedBuilder()
            .setColor(PALETTE.tech)
            .setAuthor({ name: '⚡ SYSTEM.LEADERBOARD' })
            .setTitle('> GLITCH HAVEN // TOP PLAYERS')
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }) || null)
            .setDescription(`${header}\n${lines.join('\n')}`)
            .setFooter({ text: 'GLITCH_HAVEN // LEADERBOARD' })
            .setTimestamp();

        // If the requester is not in the top 10, show their standing too.
        const inTop = topUsers.some(u => u.userId === interaction.user.id);
        if (!inTop) {
            const me = await User.findOne({ userId: interaction.user.id, guildId });
            if (me) {
                const rank = await getUserRank(guildId, me.level, me.xp);
                embed.addFields({
                    name: '> YOUR_STANDING',
                    value: playerLine(`\`#${rank}\``, me.userId, me.level, me.xp),
                });
            }
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
