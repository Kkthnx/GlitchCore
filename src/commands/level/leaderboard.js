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

const ESC = '\x1b';
const G = `${ESC}[1;32m`;  // green
const Y = `${ESC}[1;33m`;  // amber
const C = `${ESC}[1;36m`;  // cyan
const W = `${ESC}[1;37m`;  // white
const RST = `${ESC}[0m`;

const NAME_W = 16;

function col(text, width) {
    const s = String(text);
    return s.length > width ? s.slice(0, width) : s.padEnd(width);
}

// One monospace row: rank, name, level, xp, colored per column.
function row(rank, name, level, xp) {
    return `${G}${col(rank, 4)}${RST}${W}${col(name, NAME_W)}${RST}  ${Y}LV ${String(level).padStart(3)}${RST}  ${C}${xp.toLocaleString().padStart(9)}${RST}`;
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

        // Resolve display names in one bulk fetch so every name is readable.
        const names = new Map();
        try {
            const members = await interaction.guild.members.fetch({ user: topUsers.map(u => u.userId) });
            members.forEach(m => names.set(m.id, m.displayName));
        } catch { /* some may have left, handled by the fallback below */ }
        const nameOf = id => names.get(id) || 'Unknown';

        const headerRow = `${col('RNK', 4)}${col('PLAYER', NAME_W)}  ${col('LVL', 6)}  ${'XP'.padStart(9)}`;
        const rows = topUsers.map((u, i) => row(`#${String(i + 1).padStart(2, '0')}`, nameOf(u.userId), u.level, u.xp));

        const block = [
            '```ansi',
            `${G}> DECRYPTING RANKINGS...  PLAYERS: ${totalRanked}${RST}`,
            `${G}${headerRow}${RST}`,
            ...rows,
            '```',
        ].join('\n');

        const embed = new EmbedBuilder()
            .setColor(PALETTE.tech)
            .setAuthor({ name: '⚡ SYSTEM.LEADERBOARD' })
            .setTitle('> GLITCH HAVEN // TOP PLAYERS')
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }) || null)
            .setDescription(block)
            .setFooter({ text: 'GLITCH_HAVEN // LEADERBOARD' })
            .setTimestamp();

        // If the requester is not in the top 10, show their standing too.
        const inTop = topUsers.some(u => u.userId === interaction.user.id);
        if (!inTop) {
            const me = await User.findOne({ userId: interaction.user.id, guildId });
            if (me) {
                const rank = await getUserRank(guildId, me.level, me.xp);
                const line = row(`#${rank}`, interaction.member.displayName, me.level, me.xp);
                embed.addFields({ name: '> YOUR_STANDING', value: `\`\`\`ansi\n${line}\n\`\`\`` });
            }
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
