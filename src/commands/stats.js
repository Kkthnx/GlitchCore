/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder } = require('discord.js');
const User = require('../database/UserSchema');
const Infraction = require('../database/InfractionSchema');
const Event = require('../database/EventSchema');
const LfgSession = require('../database/LfgSchema');
const { brandedEmbed, COLORS } = require('../utils/brand');
const { humanizeDuration } = require('../utils/duration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Server activity dashboard and bot health'),

    async execute(interaction) {
        await interaction.deferReply();
        const guildId = interaction.guild.id;

        const [[agg], top, activeEvents, openLfgs, infractions] = await Promise.all([
            User.aggregate([
                { $match: { guildId } },
                { $group: { _id: null, users: { $sum: 1 }, totalXp: { $sum: '$xp' }, totalMsgs: { $sum: '$totalMessages' }, maxLevel: { $max: '$level' }, avgLevel: { $avg: '$level' } } },
            ]),
            User.find({ guildId }).sort({ level: -1, xp: -1 }).limit(1),
            Event.countDocuments({ guildId, status: 'SCHEDULED' }),
            LfgSession.countDocuments({ guildId, status: 'OPEN' }),
            Infraction.countDocuments({ guildId }),
        ]);

        const stats = agg || { users: 0, totalXp: 0, totalMsgs: 0, maxLevel: 0, avgLevel: 0 };
        const topUser = top[0];
        const ping = Math.max(0, Math.round(interaction.client.ws.ping));
        const uptime = humanizeDuration(process.uptime() * 1000);

        const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven • Stats' })
            .setAuthor({ name: `${interaction.guild.name} — Server Stats`, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
            .addFields(
                { name: '👥 Members', value: `${interaction.guild.memberCount.toLocaleString()}`, inline: true },
                { name: '📊 Ranked', value: `${stats.users.toLocaleString()}`, inline: true },
                { name: '⭐ Total XP', value: `${Math.round(stats.totalXp).toLocaleString()}`, inline: true },
                { name: '💬 Messages', value: `${Math.round(stats.totalMsgs).toLocaleString()}`, inline: true },
                { name: '🏆 Top Level', value: `${stats.maxLevel}${topUser ? ` — <@${topUser.userId}>` : ''}`, inline: true },
                { name: '📈 Avg Level', value: `${(stats.avgLevel || 0).toFixed(1)}`, inline: true },
                { name: '📅 Active Events', value: `${activeEvents}`, inline: true },
                { name: '🎮 Open LFGs', value: `${openLfgs}`, inline: true },
                { name: '🛡️ Infractions', value: `${infractions}`, inline: true },
                { name: '🤖 Bot Health', value: `Latency \`${ping}ms\` · Uptime \`${uptime}\``, inline: false },
            );

        return interaction.editReply({ embeds: [embed] });
    },
};
