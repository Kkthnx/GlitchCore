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
const { getModLogChannel } = require('./auditLog');
const { humanizeDuration, clampTimeout } = require('./duration');
const logger = require('./logger');

const MOD_FOOTER = 'Glitch Haven, Moderation';

/** The base embed every moderation message shares. */
function modEmbed() {
    return brandedEmbed({ color: COLORS.danger, footer: MOD_FOOTER });
}

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
        const channel = await getModLogChannel(guild);
        if (channel) {
            const embed = modEmbed()
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
        const channel = await getModLogChannel(guild);
        if (!channel) return;

        const embed = modEmbed()
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
        const logChannel = await getModLogChannel(guild);
        if (!logChannel || !messages.length) return;

        const sorted = [...messages].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const lines = sorted.map(m => {
            const time = new Date(m.createdTimestamp).toISOString();
            const body = (m.content || '').slice(0, 500);
            const attachments = m.attachments?.size ? ` [${m.attachments.size} attachment(s)]` : '';
            return `[${time}] ${m.author?.tag || 'unknown'} (${m.author?.id || '?'}): ${body}${attachments}`;
        });
        const transcript = lines.join('\n').slice(0, 200000);

        const embed = modEmbed()
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

/**
 * Best-effort DM to the target so they know what happened and why. Resolves to
 * the sent message, or null when the DM couldn't be delivered (closed DMs are
 * normal, not an error).
 */
async function notifyTarget(targetUser, guildName, type, reason, durationMs) {
    try {
        const embed = modEmbed()
            .setTitle(`You were ${ACTION_VERB[type] || type} in ${guildName}`)
            .addFields({ name: 'Reason', value: reason || 'No reason provided' });
        if (durationMs) embed.addFields({ name: 'Duration', value: humanizeDuration(durationMs), inline: true });
        return await targetUser.send({ embeds: [embed] });
    } catch {
        return null;
    }
}

/**
 * Runs a kick, ban or timeout with the target's DM sent FIRST, and retracts the
 * DM if the action then fails. The DM has to go out before a kick or ban:
 * afterwards the member is gone, and when the bot shares no other server with
 * them Discord refuses the DM (error 50007 / 50278), so "DM after the action"
 * silently never reached anyone. Sending first and deleting on failure keeps
 * both properties: the member is told, and nobody is told about an action that
 * didn't happen.
 *
 * @param {{targetUser: import('discord.js').User, guildName: string, type: string, reason?: string, durationMs?: number|null}} notice
 * @param {() => Promise<any>} action the Discord-side action
 */
async function withTargetNotice({ targetUser, guildName, type, reason, durationMs }, action) {
    const dm = await notifyTarget(targetUser, guildName, type, reason, durationMs);
    try {
        return await action();
    } catch (err) {
        if (dm) await dm.delete().catch(() => {});
        throw err;
    }
}

/**
 * Records an infraction for an action that already landed on Discord. A failed
 * history write must not look like a failed action, so this logs and reports
 * instead of throwing.
 * @returns {Promise<boolean>} whether the record was saved
 */
async function tryRecordInfraction(opts) {
    try {
        await recordInfraction(opts);
        return true;
    } catch (err) {
        logger.error(`recordInfraction failed after a ${opts.type} of ${opts.targetUser?.id}:`, err);
        return false;
    }
}

/** Appended to a command reply when the action worked but its record didn't save. */
const RECORD_FAILED_NOTE = "but I couldn't write the infraction record. Check /infractions for them later.";

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
            await withTargetNotice({ targetUser, guildName: guild.name, type: 'timeout', reason, durationMs },
                () => member.timeout(durationMs, auditReason(autoMod.tag || 'GlitchCore auto-mod', reason)));
            await recordInfraction({ guild, targetUser, moderator: autoMod, type: 'timeout', reason, durationMs });
            return `\nStrike threshold hit: automatically timed out for ${humanizeDuration(durationMs)}.`;
        }
        if (action === 'kick') {
            if (!member) return `\nStrike threshold hit (${recentWarns} warns in ${windowDays}d) but they're not in the server.`;
            await withTargetNotice({ targetUser, guildName: guild.name, type: 'kick', reason },
                () => member.kick(auditReason(autoMod.tag || 'GlitchCore auto-mod', reason)));
            await recordInfraction({ guild, targetUser, moderator: autoMod, type: 'kick', reason });
            return '\nStrike threshold hit: automatically kicked.';
        }
        if (action === 'ban') {
            await withTargetNotice({ targetUser, guildName: guild.name, type: 'ban', reason },
                () => guild.members.ban(targetUser.id, { reason: auditReason(autoMod.tag || 'GlitchCore auto-mod', reason) }));
            await recordInfraction({ guild, targetUser, moderator: autoMod, type: 'ban', reason });
            return '\nStrike threshold hit: automatically banned.';
        }
        logger.warn(`[MOD] Unknown strikeAction "${action}" in guild ${guild.id}, skipping escalation.`);
        return null;
    } catch (err) {
        logger.error('[MOD] Strike escalation failed:', err);
        return `\nStrike threshold hit but the automatic ${action} failed: ${err.message}`;
    }
}

module.exports = {
    blockReason,
    recordInfraction,
    tryRecordInfraction,
    logModAction,
    snapshotPurge,
    notifyTarget,
    withTargetNotice,
    countInfractions,
    checkStrikeEscalation,
    auditReason,
    ACTION_VERB,
    RECORD_FAILED_NOTE,
    MOD_FOOTER,
    modEmbed,
};
