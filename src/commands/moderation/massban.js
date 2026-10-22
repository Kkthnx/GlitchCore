/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const { recordInfraction, auditReason } = require('../../utils/moderationManager');
const logger = require('../../utils/logger');

// Banning raiders one /ban at a time is too slow when fifteen spam accounts
// join in a minute. This takes a space-separated list of user IDs and bans
// each with the same reason, reporting per-ID results.
const MAX_TARGETS = 25;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('massban')
        .setDescription('Ban several users by ID at once (raid cleanup)')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .setContexts(InteractionContextType.Guild)
        .addStringOption(o => o.setName('ids').setDescription('Space-separated user IDs to ban').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for all bans').setRequired(false).setMaxLength(500))
        .addIntegerOption(o => o.setName('delete_days').setDescription('Delete their messages from the last N days (0-7)').setMinValue(0).setMaxValue(7).setRequired(false)),

    async execute(interaction) {
        const rawIds = interaction.options.getString('ids').split(/\s+/).filter(Boolean);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

        const ids = [...new Set(rawIds)];
        const bad = ids.filter(id => !/^\d{17,20}$/.test(id));
        if (bad.length) {
            return interaction.reply({ content: `These aren't valid user IDs: ${bad.join(', ')}`, flags: MessageFlags.Ephemeral });
        }
        if (ids.length > MAX_TARGETS) {
            return interaction.reply({ content: `Too many IDs, the limit is ${MAX_TARGETS} per command.`, flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const banned = [];
        const failed = [];
        for (const id of ids) {
            // Never ban the moderator running this or the bot itself.
            if (id === interaction.user.id || id === interaction.client.user.id) {
                failed.push(`${id} (not banning you or me)`);
                continue;
            }
            try {
                const user = await interaction.client.users.fetch(id).catch(() => null);
                await interaction.guild.members.ban(id, {
                    reason: auditReason(interaction.user.tag, reason),
                    deleteMessageSeconds: deleteDays * 24 * 60 * 60,
                });
                banned.push(id);
                try {
                    await recordInfraction({
                        guild: interaction.guild,
                        targetUser: user || { id, tag: `unknown (${id})`, displayAvatarURL: () => null },
                        moderator: interaction.user,
                        type: 'ban',
                        reason: `Mass-ban: ${reason}`,
                    });
                } catch (err) {
                    logger.error(`recordInfraction failed after mass-banning ${id}:`, err);
                }
            } catch (err) {
                failed.push(`${id} (${err.message})`);
            }
        }

        const lines = [`🔨 Mass-ban done: **${banned.length}** banned, **${failed.length}** failed.`];
        if (failed.length) lines.push(`Failed: ${failed.join(', ')}`);
        return interaction.editReply({ content: lines.join('\n') });
    },
};
