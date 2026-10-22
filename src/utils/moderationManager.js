/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const Infraction = require('../database/InfractionSchema');
const { AttachmentBuilder } = require('discord.js');
const { brandedEmbed, COLORS } = require('./brand');
const { getGuildConfig } = require('./guildConfigCache');
const { humanizeDuration, clampTimeout } = require('./duration');
const channels = require('./channels');
const logger = require('./logger');

const ACTION_VERB = { warn: 'warned', timeout: 'timed out', kick: 'kicked', ban: 'banned', unban: 'unbanned' };

// Discord caps audit log reasons at 512 characters. The reason option allows
// 500 and the moderator tag prefix adds up to ~39 more, so a max-length reason
// plus a long tag fails the action on a technicality. Truncate the composed
// string instead of letting the API reject it.
const AUDIT_REASON_MAX = 512;
function auditReason(moderatorTag, reason) {
    const composed = `${moderatorTag}: ${reason || 'No reason provided'}`;
    return composed.length > AUDIT_REASON_MAX ? composed.slice(0, AUDIT_REASON_MAX) : composed;
}

/**
 * Verifies the moderator may act on the target. Returns a reason string if the
 * action must be blocked, or null if it's allowed.
 */
function blockReason(interaction, targetMember, { needBannable = false, needKickable = false, requireBotAction = true } = {}) {
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
    // take no Discord-side action against the member). Each action has its own
    // test in discord.js. Using the timeout one (moderatable) for a kick would
    // demand the wrong permission and refuse any target holding Administrator.
    if (requireBotAction) {
        let canAct;
        if (needBannable) canAct = targetMember.bannable;
        else if (needKickable) canAct = targetMember.kickable;
        else canAct = targetMember.moderatable;

        if (!canAct) {
            return "I can't do that to this member. My role has to sit above theirs and I need the matching permission.";
        }
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
        // Per-guild override wins; fall back to the env-configured mod-log so
        // moderation and audit events land in the same place.
        const modLogId = cfg.modLogChannelId || channels.modLog;
        const channel = modLogId && guild.channels.cache.get(modLogId);
        if (channel) {
            const embed = brandedEmbed({ color: COLORS.danger, footer: 'Glitch Haven, Moderation' })
                .setTitle(`Member ${ACTION_VERB[type] || type}`)
                .setThumbnail(targetUser.displayAvatarURL())
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

/**
 * Writes a mod-log entry for an action that isn't an infraction against one
 * member, so there's nothing to append to anyone's history. A bulk purge is the
 * case that matters: it's the most destructive thing a mod can do to a channel
 * and it was the only message action leaving no trace, while single deletes and
 * edits were both logged.
 *
 * @param {object} opts
 * @param {import('discord.js').Guild} opts.guild
 * @param {import('discord.js').User} opts.moderator
 * @param {string} opts.title
 * @param {{name: string, value: string, inline?: boolean}[]} opts.fields
 */
async function logModAction({ guild, moderator, title, fields }) {
    try {
        const cfg = await getGuildConfig(guild.id) || {};
        const modLogId = cfg.modLogChannelId || channels.modLog;
        const channel = modLogId && guild.channels.cache.get(modLogId);
        if (!channel) return;

        const embed = brandedEmbed({ color: COLORS.danger, footer: 'Glitch Haven, Moderation' })
            .setTitle(title)
            .addFields({ name: 'Moderator', value: `<@${moderator.id}>`, inline: true }, ...fields);

        await channel.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
        logger.error('Failed to write mod-log action:', err);
    }
}

/**
 * Snapshots the messages a purge is about to delete into the mod-log, so the
 * evidence survives the deletion. Bulk deletes log a count and nothing else,
 * which is exactly backwards: purges usually target the messages mods most
 * need to see later (harassment, scam waves). The transcript goes up as a
 * text file so even a 100-message purge is one tidy mod-log entry.
 */
async function snapshotPurge({ guild, moderator, channel, messages, onlyUser = null }) {
    try {
        const cfg = await getGuildConfig(guild.id) || {};
        const modLogId = cfg.modLogChannelId || channels.modLog;
        const logChannel = modLogId && guild.channels.cache.get(modLogId);
        if (!logChannel || !messages.length) return;

        const sorted = [...messages].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const lines = sorted.map(m => {
            const time = new Date(m.createdTimestamp).toISOString();
            const body = (m.content || '').slice(0, 500);
            const attachments = m.attachments?.size ? ` [${m.attachments.size} attachment(s)]` : '';
            return `[${time}] ${m.author?.tag || 'unknown'} (${m.author?.id || '?'}): ${body}${attachments}`;
        });
        const transcript = lines.join('\n').slice(0, 200000);

        const embed = brandedEmbed({ color: COLORS.danger, footer: 'Glitch Haven, Moderation' })
            .setTitle('Messages purged')
            .addFields(
                { name: 'Moderator', value: `<@${moderator.id}>`, inline: true },
                { name: 'Channel', value: `<#${channel.id}>`, inline: true },
                { name: 'Deleted', value: `${messages.length}`, inline: true },
            );
        if (onlyUser) embed.addFields({ name: 'Only from', value: `<@${onlyUser.id}> \`${onlyUser.tag}\``, inline: false });

        const file = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), { name: `purge-${channel.id}-${Date.now()}.txt` });
        await logChannel.send({ embeds: [embed], files: [file] }).catch(() => {});
    } catch (err) {
        logger.error('Failed to snapshot purge evidence:', err);
    }
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

/**
 * Automatic strike escalation. When a member collects enough warns inside the
 * configured window, the configured action fires on its own so enforcement
 * doesn't depend on which moderator happens to be online. Returns a short
 * note for the command reply, or null when nothing tripped.
 */
async function checkStrikeEscalation({ guild, member, targetUser, moderator }) {
    const cfg = await getGuildConfig(guild.id) || {};
    const threshold = cfg.strikeWarnThreshold ?? 3;
    if (!(threshold > 0)) return null;

    const windowDays = cfg.strikeWindowDays ?? 30;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const recentWarns = await Infraction.countDocuments({
        guildId: guild.id,
        userId: targetUser.id,
        type: 'warn',
        createdAt: { $gte: since },
    });
    if (recentWarns < threshold) return null;

    const action = cfg.strikeAction || 'timeout';
    const reason = `Strike escalation: ${recentWarns} warns in ${windowDays}d`;
    const autoMod = moderator || guild.client?.user || { id: 'auto', tag: 'GlitchCore auto-mod' };

    try {
        if (action === 'timeout') {
            const durationMs = clampTimeout((cfg.strikeTimeoutMinutes ?? 60) * 60 * 1000);
            if (!member?.moderatable) return `\nStrike threshold hit (${recentWarns} warns in ${windowDays}d) but I can't time them out.`;
            await member.timeout(durationMs, auditReason(autoMod.tag || 'GlitchCore auto-mod', reason));
            await recordInfraction({ guild, targetUser, moderator: autoMod, type: 'timeout', reason, durationMs });
            await notifyTarget(targetUser, guild.name, 'timeout', reason, durationMs);
            return `\nStrike threshold hit: automatically timed out for ${humanizeDuration(durationMs)}.`;
        }
        if (action === 'kick') {
            if (!member) return `\nStrike threshold hit (${recentWarns} warns in ${windowDays}d) but they're not in the server.`;
            await member.kick(auditReason(autoMod.tag || 'GlitchCore auto-mod', reason));
            await recordInfraction({ guild, targetUser, moderator: autoMod, type: 'kick', reason });
            await notifyTarget(targetUser, guild.name, 'kick', reason);
            return '\nStrike threshold hit: automatically kicked.';
        }
        if (action === 'ban') {
            await guild.members.ban(targetUser.id, { reason: auditReason(autoMod.tag || 'GlitchCore auto-mod', reason) });
            await recordInfraction({ guild, targetUser, moderator: autoMod, type: 'ban', reason });
            await notifyTarget(targetUser, guild.name, 'ban', reason);
            return '\nStrike threshold hit: automatically banned.';
        }
        logger.warn(`[MOD] Unknown strikeAction "${action}" in guild ${guild.id}, skipping escalation.`);
        return null;
    } catch (err) {
        logger.error('[MOD] Strike escalation failed:', err);
        return `\nStrike threshold hit but the automatic ${action} failed: ${err.message}`;
    }
}

module.exports = { blockReason, recordInfraction, logModAction, snapshotPurge, notifyTarget, countInfractions, checkStrikeEscalation, auditReason, ACTION_VERB };
