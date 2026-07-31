/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { blockReason, recordInfraction, notifyTarget } = require('../../utils/moderationManager');
const { parseDuration, humanizeDuration } = require('../../utils/duration');
const { scheduleTempBan, clearTempBan } = require('../../utils/tempBanManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .setDMPermission(false)
        .addUserOption(o => o.setName('target').setDescription('User to ban (works even if they left)').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
        .addStringOption(o => o.setName('duration').setDescription('Temp-ban length, e.g. 3d, 12h, 1w (blank = permanent)').setRequired(false))
        .addIntegerOption(o => o.setName('delete_days').setDescription('Delete their messages from the last N days (0-7)').setMinValue(0).setMaxValue(7).setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');
        const member = interaction.options.getMember('target'); // null if not in guild
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

        // Optional temp-ban duration. Invalid input is rejected rather than
        // silently treated as a permanent ban.
        const durationInput = interaction.options.getString('duration');
        let durationMs = null;
        if (durationInput) {
            durationMs = parseDuration(durationInput);
            if (!durationMs) {
                return interaction.reply({ content: 'Invalid duration. Use formats like `3d`, `12h`, `1w`.', flags: MessageFlags.Ephemeral });
            }
        }

        // If they're in the guild, enforce hierarchy/bannable. If not, allow ban by ID.
        if (member) {
            const block = blockReason(interaction, member, { needBannable: true });
            if (block) return interaction.reply({ content: block, flags: MessageFlags.Ephemeral });
        }

        // DM first, while we can still resolve them.
        await notifyTarget(targetUser, interaction.guild.name, 'ban', reason);

        try {
            await interaction.guild.members.ban(targetUser.id, {
                reason: `${interaction.user.tag}: ${reason}`,
                deleteMessageSeconds: deleteDays * 24 * 60 * 60,
            });
        } catch (err) {
            return interaction.reply({ content: `Failed to ban that user: ${err.message}`, flags: MessageFlags.Ephemeral });
        }

        await recordInfraction({ guild: interaction.guild, targetUser, moderator: interaction.user, type: 'ban', reason, durationMs });

        if (durationMs) {
            const unbanAt = new Date(Date.now() + durationMs);
            await scheduleTempBan(interaction.guild.id, targetUser.id, unbanAt, reason);
            return interaction.reply({ content: `🔨 Temp-banned <@${targetUser.id}> for ${humanizeDuration(durationMs)}, ${reason}` });
        }

        // A permanent ban must cancel any earlier temp-ban so the scheduler
        // doesn't quietly unban them when the old timer expires.
        await clearTempBan(interaction.guild.id, targetUser.id);
        return interaction.reply({ content: `🔨 Banned <@${targetUser.id}>, ${reason}` });
    },
};
