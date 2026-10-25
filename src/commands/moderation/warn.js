/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const { blockReason, recordInfraction, notifyTarget, countInfractions, checkStrikeEscalation } = require('../../utils/moderationManager');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Issue a warning to a member')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setContexts(InteractionContextType.Guild)
        .addUserOption(o => o.setName('target').setDescription('Member to warn').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(false).setMaxLength(500)),

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

        // The write, the DM and a possible escalation all take round trips, so
        // acknowledge first or a slow one closes the 3 second reply window.
        await interaction.deferReply();

        // A warning IS the database record (no Discord-side action), so a failed
        // write means the warn didn't happen. Say so instead of pretending.
        try {
            await recordInfraction({ guild: interaction.guild, targetUser, moderator: interaction.user, type: 'warn', reason });
        } catch (err) {
            logger.error('recordInfraction failed for warn:', err);
            return interaction.editReply({ content: 'Failed to record the warning, nothing was issued. Try again.' });
        }
        await notifyTarget(targetUser, interaction.guild.name, 'warn', reason);

        // Automatic strike escalation runs here, so repeat offenders face the
        // configured consequence even when no mod connects the dots.
        let escalationNote = '';
        try {
            escalationNote = await checkStrikeEscalation({
                guild: interaction.guild,
                member,
                targetUser,
                moderator: interaction.client.user,
            }) || '';
        } catch (err) {
            logger.error('Strike escalation check failed:', err);
        }

        const total = await countInfractions(interaction.guild.id, targetUser.id);
        return interaction.editReply({ content: `⚠️ Warned <@${targetUser.id}>, ${reason}\nThey now have **${total}** infraction(s) on record.${escalationNote}` });
    },
};
