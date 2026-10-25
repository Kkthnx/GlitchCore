/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const { blockReason, tryRecordInfraction, withTargetNotice, auditReason, RECORD_FAILED_NOTE } = require('../../utils/moderationManager');

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

        // Defer first: the kick, the DM and the history write can outlast the
        // 3 second reply window.
        await interaction.deferReply();

        // The DM goes out before the kick and is retracted if the kick fails.
        // Afterwards the member shares no server with the bot and Discord
        // refuses the message.
        try {
            await withTargetNotice(
                { targetUser, guildName: interaction.guild.name, type: 'kick', reason },
                () => member.kick(auditReason(interaction.user.tag, reason)),
            );
        } catch (err) {
            return interaction.editReply({ content: `Failed to kick that member: ${err.message}` });
        }

        const recorded = await tryRecordInfraction({ guild: interaction.guild, targetUser, moderator: interaction.user, type: 'kick', reason });
        return interaction.editReply({ content: `👢 Kicked <@${targetUser.id}>, ${recorded ? reason : RECORD_FAILED_NOTE}` });
    },
};
