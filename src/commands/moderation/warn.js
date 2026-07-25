/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { blockReason, recordInfraction, notifyTarget, countInfractions } = require('../../utils/moderationManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Issue a warning to a member')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false)
        .addUserOption(o => o.setName('target').setDescription('Member to warn').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');
        const member = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!member) {
            return interaction.reply({ content: 'That user is not in this server.', flags: MessageFlags.Ephemeral });
        }
        // Warnings take no Discord-side action, so the bot need not outrank the target.
        const block = blockReason(interaction, member, { requireBotAction: false });
        if (block) return interaction.reply({ content: block, flags: MessageFlags.Ephemeral });

        await recordInfraction({ guild: interaction.guild, targetUser, moderator: interaction.user, type: 'warn', reason });
        await notifyTarget(targetUser, interaction.guild.name, 'warn', reason);

        const total = await countInfractions(interaction.guild.id, targetUser.id);
        return interaction.reply({ content: `⚠️ Warned <@${targetUser.id}> — ${reason}\nThey now have **${total}** infraction(s) on record.` });
    },
};
