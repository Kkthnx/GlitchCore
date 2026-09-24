/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const Infraction = require('../../database/InfractionSchema');
const { brandedEmbed, COLORS } = require('../../utils/brand');
const { humanizeDuration } = require('../../utils/duration');

const TYPE_ICON = { warn: '⚠️', timeout: '🔇', kick: '👢', ban: '🔨', unban: '🔓' };

const PAGE_SIZE = 15;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('infractions')
        .setDescription('View or clear a member\'s moderation history')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setContexts(InteractionContextType.Guild)
        .addSubcommand(sub => sub
            .setName('view')
            .setDescription('Show a member\'s infraction history')
            .addUserOption(o => o.setName('target').setDescription('Member to look up').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('clear')
            .setDescription('Clear a member\'s infraction history (Manage Server)')
            .addUserOption(o => o.setName('target').setDescription('Member to clear').setRequired(true))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('target');

        if (sub === 'clear') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ content: 'You need the **Manage Server** permission to clear infractions.', flags: MessageFlags.Ephemeral });
            }
            const { deletedCount } = await Infraction.deleteMany({ guildId: interaction.guild.id, userId: targetUser.id });
            return interaction.reply({ content: `🧹 Cleared **${deletedCount}** infraction(s) for <@${targetUser.id}>.`, flags: MessageFlags.Ephemeral });
        }

        // view
        const filter = { guildId: interaction.guild.id, userId: targetUser.id };
        const [records, totals] = await Promise.all([
            Infraction.find(filter).sort({ createdAt: -1 }).limit(PAGE_SIZE).lean(),
            // Counted across the whole history, not just the page below. Summing
            // the page called 3 warns a summary when the member had 50.
            Infraction.aggregate([{ $match: filter }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
        ]);

        const embed = brandedEmbed({ color: COLORS.danger, footer: 'Glitch Haven, Moderation' })
            .setAuthor({ name: `Infractions, ${targetUser.tag}`, iconURL: targetUser.displayAvatarURL() });

        if (!records.length) {
            embed.setDescription('✅ This member has a clean record.');
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const total = totals.reduce((sum, t) => sum + t.n, 0);
        const summary = totals
            .sort((a, b) => b.n - a.n)
            .map(t => `${TYPE_ICON[t._id] || ''} ${t.n} ${t._id}`)
            .join(', ');

        embed.setDescription(`**Summary:** ${summary}\n\n` + records.map(r => {
            const when = `<t:${Math.floor(new Date(r.createdAt).getTime() / 1000)}:R>`;
            const dur = r.durationMs ? ` (${humanizeDuration(r.durationMs)})` : '';
            return `${TYPE_ICON[r.type] || ''} **${r.type}**${dur}, ${r.reason}\n└ by <@${r.moderatorId}> ${when}`;
        }).join('\n'));

        if (total > records.length) {
            embed.setFooter({ text: `Glitch Haven, Moderation, showing the latest ${records.length} of ${total}` });
        }

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
