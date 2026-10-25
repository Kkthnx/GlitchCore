/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const { blockReason, tryRecordInfraction, withTargetNotice, auditReason, RECORD_FAILED_NOTE } = require('../../utils/moderationManager');
const { parseDuration, humanizeDuration, MAX_TEMPBAN_MS } = require('../../utils/duration');
const { scheduleTempBan, clearTempBan } = require('../../utils/tempBanManager');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .setContexts(InteractionContextType.Guild)
        .addUserOption(o => o.setName('target').setDescription('User to ban (works even if they left)').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(500))
        .addStringOption(o => o.setName('duration').setDescription('Temp-ban length, e.g. 3d, 12h, 1w (max 1y, blank = permanent)').setRequired(false))
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
            if (durationMs > MAX_TEMPBAN_MS) {
                return interaction.reply({ content: 'Temp-bans top out at 1 year. Leave the duration blank for a permanent ban.', flags: MessageFlags.Ephemeral });
            }
        }

        // If they're in the guild, enforce hierarchy/bannable. If not, allow ban by ID.
        if (member) {
            const block = blockReason(interaction, member, { needBannable: true });
            if (block) return interaction.reply({ content: block, flags: MessageFlags.Ephemeral });
        }

        // The ban, the DM and the history write each take a network round trip,
        // and a slow one means the 3 second reply window closes and the
        // moderator never sees the result.
        await interaction.deferReply();

        try {
            await withTargetNotice(
                { targetUser, guildName: interaction.guild.name, type: 'ban', reason, durationMs },
                () => interaction.guild.members.ban(targetUser.id, {
                    reason: auditReason(interaction.user.tag, reason),
                    deleteMessageSeconds: deleteDays * 24 * 60 * 60,
                }),
            );
        } catch (err) {
            return interaction.editReply({ content: `Failed to ban that user: ${err.message}` });
        }

        // Settle the unban timer before anything else can fail. It used to run
        // after the history write, so a database hiccup there skipped it and a
        // temp-ban quietly became permanent. A permanent ban also has to cancel
        // any earlier temp-ban, or the scheduler lifts it when the old timer ends.
        let timerNote = '';
        try {
            if (durationMs) await scheduleTempBan(interaction.guild.id, targetUser.id, new Date(Date.now() + durationMs), reason);
            else await clearTempBan(interaction.guild.id, targetUser.id);
        } catch (err) {
            logger.error(`Could not update the temp-ban timer for ${targetUser.id}:`, err);
            timerNote = durationMs
                ? '\n⚠️ The unban timer did not save, so this ban is permanent until someone runs `/unban`.'
                : '\n⚠️ An older unban timer may still be pending and could lift this ban early.';
        }

        const recorded = await tryRecordInfraction({ guild: interaction.guild, targetUser, moderator: interaction.user, type: 'ban', reason, durationMs });

        const lead = durationMs
            ? `🔨 Temp-banned <@${targetUser.id}> for ${humanizeDuration(durationMs)}`
            : `🔨 Banned <@${targetUser.id}>`;
        return interaction.editReply({ content: `${lead}, ${recorded ? reason : RECORD_FAILED_NOTE}${timerNote}` });
    },
};
