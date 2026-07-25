/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const Infraction = require('../../database/InfractionSchema');
const { brandedEmbed, COLORS } = require('../../utils/brand');
const { humanizeDuration } = require('../../utils/duration');

const TYPE_ICON = { warn: '⚠️', timeout: '🔇', kick: '👢', ban: '🔨' };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('infractions')
        .setDescription('View or clear a member\'s moderation history')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false)
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
        const records = await Infraction.find({ guildId: interaction.guild.id, userId: targetUser.id })
            .sort({ createdAt: -1 })
            .limit(15);

        const embed = brandedEmbed({ color: COLORS.danger, footer: 'Glitch Haven • Moderation' })
            .setAuthor({ name: `Infractions — ${targetUser.tag}`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) });

        if (!records.length) {
            embed.setDescription('✅ This member has a clean record.');
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const counts = records.reduce((acc, r) => { acc[r.type] = (acc[r.type] || 0) + 1; return acc; }, {});
        const summary = Object.entries(counts).map(([t, n]) => `${TYPE_ICON[t] || ''} ${n} ${t}`).join(' · ');

        embed.setDescription(`**Summary:** ${summary}\n\n` + records.map(r => {
            const when = `<t:${Math.floor(new Date(r.createdAt).getTime() / 1000)}:R>`;
            const dur = r.durationMs ? ` (${humanizeDuration(r.durationMs)})` : '';
            return `${TYPE_ICON[r.type] || ''} **${r.type}**${dur} — ${r.reason}\n└ by <@${r.moderatorId}> ${when}`;
        }).join('\n'));

        if (records.length === 15) embed.setFooter({ text: 'Glitch Haven • Moderation — showing latest 15' });

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
