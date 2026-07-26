/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const Infraction = require('../database/InfractionSchema');
const { brandedEmbed, COLORS } = require('./brand');
const { getGuildConfig } = require('./guildConfigCache');
const { humanizeDuration } = require('./duration');
const logger = require('./logger');

const ACTION_VERB = { warn: 'warned', timeout: 'timed out', kick: 'kicked', ban: 'banned' };

/**
 * Verifies the moderator may act on the target. Returns a reason string if the
 * action must be blocked, or null if it's allowed.
 */
function blockReason(interaction, targetMember, { needBannable = false, requireBotAction = true } = {}) {
    if (!targetMember) return null; // e.g. banning a user not in the guild, caller decides
    if (targetMember.id === interaction.user.id) return "You can't moderate yourself.";
    if (targetMember.id === interaction.client.user.id) return "I can't moderate myself.";
    if (targetMember.id === interaction.guild.ownerId) return "You can't moderate the server owner.";

    // Moderator must outrank the target (owner bypasses).
    if (interaction.guild.ownerId !== interaction.user.id) {
        if (interaction.member.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
            return "You can't moderate someone with an equal or higher role.";
        }
    }

    // The bot must be able to act on the target (skipped for warnings, which
    // take no Discord-side action against the member).
    if (requireBotAction && (needBannable ? !targetMember.bannable : !targetMember.moderatable)) {
        return "I don't have permission to action that member (check my role position).";
    }
    return null;
}

/**
 * Persists an infraction and posts it to the configured mod-log channel.
 */
async function recordInfraction({ guild, targetUser, moderator, type, reason, durationMs = null }) {
    const infraction = await Infraction.create({
        guildId: guild.id,
        userId: targetUser.id,
        moderatorId: moderator.id,
        type,
        reason: reason || 'No reason provided',
        durationMs,
    });

    try {
        const cfg = await getGuildConfig(guild.id) || {};
        const channel = cfg.modLogChannelId && guild.channels.cache.get(cfg.modLogChannelId);
        if (channel) {
            const embed = brandedEmbed({ color: COLORS.danger, footer: 'Glitch Haven, Moderation' })
                .setTitle(`Member ${ACTION_VERB[type] || type}`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'User', value: `<@${targetUser.id}> \`${targetUser.tag}\``, inline: true },
                    { name: 'Moderator', value: `<@${moderator.id}>`, inline: true },
                    { name: 'Reason', value: reason || 'No reason provided', inline: false },
                );
            if (durationMs) embed.addFields({ name: 'Duration', value: humanizeDuration(durationMs), inline: true });
            await channel.send({ embeds: [embed] }).catch(() => {});
        }
    } catch (err) {
        logger.error('Failed to write mod-log entry:', err);
    }

    return infraction;
}

/** Best-effort DM to the target so they know what happened and why. */
async function notifyTarget(targetUser, guildName, type, reason, durationMs) {
    try {
        const embed = brandedEmbed({ color: COLORS.danger, footer: 'Glitch Haven, Moderation' })
            .setTitle(`You were ${ACTION_VERB[type] || type} in ${guildName}`)
            .addFields({ name: 'Reason', value: reason || 'No reason provided' });
        if (durationMs) embed.addFields({ name: 'Duration', value: humanizeDuration(durationMs), inline: true });
        await targetUser.send({ embeds: [embed] });
    } catch {
        // User has DMs closed, not an error.
    }
}

async function countInfractions(guildId, userId) {
    return Infraction.countDocuments({ guildId, userId });
}

module.exports = { blockReason, recordInfraction, notifyTarget, countInfractions, ACTION_VERB };
