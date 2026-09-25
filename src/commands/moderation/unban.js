/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const { recordInfraction } = require('../../utils/moderationManager');
const { clearTempBan } = require('../../utils/tempBanManager');

// Discord snowflakes are 17 to 20 digits.
const ID_PATTERN = /^\d{17,20}$/;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Lift a ban early')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .setContexts(InteractionContextType.Guild)
        .addStringOption(o => o.setName('user_id').setDescription('ID of the banned user').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(500)),

    async execute(interaction) {
        const userId = interaction.options.getString('user_id').trim();
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!ID_PATTERN.test(userId)) {
            return interaction.reply({ content: 'That is not a valid user ID. Right click the user in the ban list and copy their ID.', flags: MessageFlags.Ephemeral });
        }

        // Confirm they are actually banned so we can give a clear answer instead
        // of a raw API error.
        const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
        if (!ban) {
            return interaction.reply({ content: 'That user is not banned here.', flags: MessageFlags.Ephemeral });
        }

        try {
            await interaction.guild.members.unban(userId, `${interaction.user.tag}: ${reason}`);
        } catch (err) {
            return interaction.reply({ content: `Failed to unban that user: ${err.message}`, flags: MessageFlags.Ephemeral });
        }

        // Drop any pending temp-ban so the scheduler does not try to lift a ban
        // that is already gone.
        await clearTempBan(interaction.guild.id, userId);

        await recordInfraction({
            guild: interaction.guild,
            targetUser: ban.user,
            moderator: interaction.user,
            type: 'unban',
            reason,
        });

        return interaction.reply({ content: `♻️ Unbanned **${ban.user.tag}**, ${reason}` });
    },
};
