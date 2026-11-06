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
const { msUntilNextWeekStart } = require('../../utils/time');

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
        .setDescription('Show the top ranked members in Glitch Haven')
        .addStringOption(o => o
            .setName('period')
            .setDescription('All-time levels or XP earned this week (default all-time)')
            .addChoices({ name: 'All time', value: 'alltime' }, { name: 'This week', value: 'weekly' })),

    // Cooldown: sorted scan, a count, and a bulk member fetch.
    cooldown: 10,

    async execute(interaction) {
        await interaction.deferReply();
        const guildId = interaction.guild.id;
        const weekly = interaction.options.getString('period') === 'weekly';

        const [topUsers, totalRanked] = await Promise.all([
            weekly
                ? User.find({ guildId, weeklyXp: { $gt: 0 } }, { userId: 1, level: 1, xp: 1, weeklyXp: 1 }).sort({ weeklyXp: -1 }).limit(10).lean()
                : User.find({ guildId }, { userId: 1, level: 1, xp: 1 }).sort({ level: -1, xp: -1 }).limit(10).lean(),
            weekly ? User.countDocuments({ guildId, weeklyXp: { $gt: 0 } }) : User.countDocuments({ guildId }),
        ]);

        if (!topUsers.length) {
            return interaction.editReply(weekly
                ? '`ERROR_204` : Nobody has earned XP this week yet. Go be first.'
                : '`ERROR_204` : No rankings yet. Be the first to start chatting.');
        }

        // Resolve display names, preferring the cache. The top of the leaderboard
        // is by definition the most active members, so they are usually all
        // cached already and the REST fetch can be skipped entirely.
        const names = new Map();
        const missing = [];
        for (const u of topUsers) {
            const cached = interaction.guild.members.cache.get(u.userId);
            if (cached) names.set(u.userId, cached.displayName);
            else missing.push(u.userId);
        }
        if (missing.length) {
            try {
                const members = await interaction.guild.members.fetch({ user: missing });
                members.forEach(m => names.set(m.id, m.displayName));
            } catch { /* some may have left, handled by the fallback below */ }
        }
        const nameOf = id => names.get(id) || 'Unknown';

        const headerRow = `${col('RNK', 4)}${col('PLAYER', NAME_W)}  ${col('LVL', 6)}  ${(weekly ? 'WEEK XP' : 'XP').padStart(9)}`;
        const rows = topUsers.map((u, i) => row(`#${String(i + 1).padStart(2, '0')}`, nameOf(u.userId), u.level, weekly ? u.weeklyXp : u.xp));

        const block = [
            '```ansi',
            `${G}> DECRYPTING ${weekly ? 'WEEKLY ' : ''}RANKINGS...  PLAYERS: ${totalRanked}${RST}`,
            `${G}${headerRow}${RST}`,
            ...rows,
            '```',
        ].join('\n');

        const embed = new EmbedBuilder()
            .setColor(PALETTE.tech)
            .setAuthor({ name: '⚡ SYSTEM.LEADERBOARD' })
            .setTitle('> GLITCH HAVEN // TOP PLAYERS')
            .setThumbnail(interaction.guild.iconURL() || null)
            .setDescription(block)
            .setFooter({ text: weekly ? 'GLITCH_HAVEN // WEEKLY_LEADERBOARD' : 'GLITCH_HAVEN // LEADERBOARD' })
            .setTimestamp();
        if (weekly) {
            const resetAt = Math.floor((Date.now() + msUntilNextWeekStart()) / 1000);
            embed.addFields({ name: '> RESETS', value: `<t:${resetAt}:R>` });
        }

        // If the requester is not in the top 10, show their standing too.
        const inTop = topUsers.some(u => u.userId === interaction.user.id);
        if (!inTop && !weekly) {
            const me = await User.findOne({ userId: interaction.user.id, guildId }, { level: 1, xp: 1 }).lean();
            if (me) {
                const rank = await getUserRank(guildId, me.level, me.xp);
                const line = row(`#${rank}`, interaction.member.displayName, me.level, me.xp);
                embed.addFields({ name: '> YOUR_STANDING', value: `\`\`\`ansi\n${line}\n\`\`\`` });
            }
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
