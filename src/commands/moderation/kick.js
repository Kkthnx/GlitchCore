/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const { blockReason, recordInfraction, notifyTarget, auditReason } = require('../../utils/moderationManager');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member from the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .setContexts(InteractionContextType.Guild)
        .addUserOption(o => o.setName('target').setDescription('Member to kick').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(500)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');
        const member = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!member) return interaction.reply({ content: 'That user is not in this server.', flags: MessageFlags.Ephemeral });

        const block = blockReason(interaction, member, { needKickable: true });
        if (block) return interaction.reply({ content: block, flags: MessageFlags.Ephemeral });

        // DM after the kick lands. DMing first meant a failed kick still sent
        // "you were kicked" to someone sitting in the server.
        try {
            await member.kick(auditReason(interaction.user.tag, reason));
        } catch (err) {
            return interaction.reply({ content: `Failed to kick that member: ${err.message}`, flags: MessageFlags.Ephemeral });
        }
        await notifyTarget(targetUser, interaction.guild.name, 'kick', reason);

        // The kick already landed, so a failed history write must not look
        // like a failed kick. Say so plainly instead.
        try {
            await recordInfraction({ guild: interaction.guild, targetUser, moderator: interaction.user, type: 'kick', reason });
        } catch (err) {
            logger.error('recordInfraction failed after a successful kick:', err);
            return interaction.reply({ content: `👢 Kicked <@${targetUser.id}>, but I couldn't write the infraction record. Check /infractions for them later.`, flags: MessageFlags.Ephemeral });
        }
        return interaction.reply({ content: `👢 Kicked <@${targetUser.id}>, ${reason}` });
    },
};
