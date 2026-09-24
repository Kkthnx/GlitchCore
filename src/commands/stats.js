/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
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

    // Cooldown: an aggregate plus four counts.
    cooldown: 10,

    async execute(interaction) {
        await interaction.deferReply();
        const guildId = interaction.guild.id;

        const [[agg], top, activeEvents, openLfgs, infractions] = await Promise.all([
            User.aggregate([
                { $match: { guildId } },
                { $group: { _id: null, users: { $sum: 1 }, totalXp: { $sum: '$xp' }, totalMsgs: { $sum: '$totalMessages' }, maxLevel: { $max: '$level' }, avgLevel: { $avg: '$level' } } },
            ]),
            User.find({ guildId }, { userId: 1 }).sort({ level: -1, xp: -1 }).limit(1).lean(),
            Event.countDocuments({ guildId, status: 'SCHEDULED' }),
            LfgSession.countDocuments({ guildId, status: 'OPEN' }),
            Infraction.countDocuments({ guildId }),
        ]);

        const stats = agg || { users: 0, totalXp: 0, totalMsgs: 0, maxLevel: 0, avgLevel: 0 };
        const topUser = top[0];
        const ping = Math.max(0, Math.round(interaction.client.ws.ping));
        const uptime = humanizeDuration(process.uptime() * 1000);

        // Memory and cache sizes for this shard. Worth surfacing because the
        // member cache is the one discord.js never sweeps on its own: if memory
        // ever does climb over a long uptime, this is where it shows up, and
        // comparing it against uptime turns "is it leaking?" into something you
        // can actually check rather than guess at.
        const mem = process.memoryUsage();
        const mb = bytes => `${Math.round(bytes / 1024 / 1024)}MB`;
        const cache = interaction.client;
        const cachedMembers = [...cache.guilds.cache.values()]
            .reduce((sum, g) => sum + g.members.cache.size, 0);
        const cachedMessages = [...cache.channels.cache.values()]
            .reduce((sum, c) => sum + (c.messages?.cache.size ?? 0), 0);

        const shardLabel = interaction.client.shard ? `, shard ${interaction.client.shard.ids[0]}` : '';
        const embed = brandedEmbed({ color: COLORS.primary, footer: `Glitch Haven, Stats${shardLabel}` })
            .setAuthor({ name: `${interaction.guild.name}, Server Stats`, iconURL: interaction.guild.iconURL() || undefined })
            .addFields(
                { name: '👥 Members', value: `${interaction.guild.memberCount.toLocaleString()}`, inline: true },
                { name: '📊 Ranked', value: `${stats.users.toLocaleString()}`, inline: true },
                { name: '⭐ Total XP', value: `${Math.round(stats.totalXp).toLocaleString()}`, inline: true },
                { name: '💬 Messages', value: `${Math.round(stats.totalMsgs).toLocaleString()}`, inline: true },
                { name: '🏆 Top Level', value: `${stats.maxLevel}${topUser ? `, <@${topUser.userId}>` : ''}`, inline: true },
                { name: '📈 Avg Level', value: `${(stats.avgLevel || 0).toFixed(1)}`, inline: true },
                { name: '📅 Active Events', value: `${activeEvents}`, inline: true },
                { name: '🎮 Open LFGs', value: `${openLfgs}`, inline: true },
                { name: '🛡️ Infractions', value: `${infractions}`, inline: true },
                { name: '🤖 Bot Health', value: `Latency \`${ping}ms\`, Uptime \`${uptime}\``, inline: false },
                {
                    name: '🧠 Memory',
                    value: `Heap \`${mb(mem.heapUsed)}\` / \`${mb(mem.heapTotal)}\`, RSS \`${mb(mem.rss)}\``,
                    inline: true,
                },
                {
                    name: '📇 Caches',
                    value: `${cachedMembers.toLocaleString()} members, ${cache.users.cache.size.toLocaleString()} users, ${cachedMessages.toLocaleString()} messages`,
                    inline: true,
                },
            );

        return interaction.editReply({ embeds: [embed] });
    },
};
