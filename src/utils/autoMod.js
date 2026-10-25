/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Automatic moderation for chat messages: the word filter and the anti-spam
// checks. messageCreate runs both on every new message, and messageUpdate runs
// the filter again on edits, since posting something clean and editing it into
// a slur is the oldest way around a filter.

const { PermissionFlagsBits } = require('discord.js');
const config = require('../../config.json');
const { checkMessage, getRandomClapback } = require('./filterManager');
const {
    recordAndCheckRate,
    recordAndCheckDuplicate,
    takeDuplicateRefs,
    resetRate,
    containsInvite,
    containsScamDomain,
    mentionCount,
} = require('./antiSpam');
const { tryRecordInfraction, checkStrikeEscalation } = require('./moderationManager');
const logger = require('./logger');

const AS = config.moderation?.antiSpam || {};

const NOTICE_TTL_MS = 6000;
const CLAPBACK_TTL_MS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CJK_VIOLATION = 'Chinese/Korean/Japanese Characters';

/**
 * Posts a short-lived channel notice. Never throws: a channel the bot can't
 * speak in must not stop the enforcement that comes after it.
 */
async function postTempNotice(channel, content, ttlMs = NOTICE_TTL_MS) {
    const sent = await channel.send(content).catch(() => null);
    if (sent) setTimeout(() => sent.delete().catch(() => {}), ttlMs);
    return sent;
}

/** Text carried by attachments, stickers and embeds, joined for the filter. */
function collectExtraText(message) {
    const extras = [];

    for (const attachment of message.attachments.values()) {
        if (attachment.name) extras.push(attachment.name);
        if (attachment.url) extras.push(attachment.url);
    }
    for (const sticker of message.stickers.values()) {
        if (sticker.name) extras.push(sticker.name);
    }
    for (const embed of message.embeds) {
        if (embed.title) extras.push(embed.title);
        if (embed.description) extras.push(embed.description);
        if (embed.fields) {
            for (const field of embed.fields) extras.push(field.name, field.value);
        }
    }
    return extras.join(' ');
}

/**
 * Runs the content filter against a message and returns the violation
 * category, or null when it is clean or the filter doesn't apply.
 *
 * This runs on every message in the server, so the plain-text case (very nearly
 * all of them) is checked on its own and costs no allocation. The combined text
 * of attachment names, sticker names and embeds is only built when the message
 * carries any of that.
 *
 * @param {import('discord.js').Message} message
 * @param {object} guildConfig
 * @returns {string|null}
 */
function evaluateContentFilter(message, guildConfig) {
    if (guildConfig.contentFilterEnabled === false) return null;

    let violation = checkMessage(message.content);

    if (!violation && (message.attachments.size || message.stickers.size || message.embeds.length)) {
        const extras = collectExtraText(message);
        if (extras) violation = checkMessage(extras);
    }

    // The CJK filter only applies to young accounts and never in exempt
    // channels. Applied server-wide it deletes legitimate messages from CJK
    // speakers outright; scoped this way it targets the actual pattern,
    // ban-evasion spam from fresh alts.
    if (violation === CJK_VIOLATION) {
        const minAgeDays = guildConfig.minAccountAgeDays ?? 7;
        const exempt = guildConfig.cjkExemptChannelIds || [];
        const accountAgeMs = Date.now() - (message.author.createdTimestamp || 0);
        const isNew = minAgeDays > 0 && accountAgeMs < minAgeDays * DAY_MS;
        if (!isNew || exempt.includes(message.channel.id)) return null;
    }

    return violation;
}

/**
 * Counts an auto-mod warn toward the member's strikes when the guild opted in
 * (autoModStrikes). Without this a repeat offender who only ever trips the
 * filter never reaches the escalation moderator warns feed into.
 */
async function escalateStrikes(message, guildConfig) {
    if (!guildConfig.autoModStrikes) return;
    try {
        await checkStrikeEscalation({
            guild: message.guild,
            member: message.member,
            targetUser: message.author,
            moderator: message.client.user,
        });
    } catch (err) {
        logger.error('[AUTOMOD] Strike escalation failed:', err);
    }
}

/**
 * Removes a message that tripped the filter, tells the author, and leaves an
 * infraction behind.
 *
 * @param {import('discord.js').Message} message
 * @param {string} violation category from evaluateContentFilter
 * @param {object} guildConfig
 */
async function enforceContentFilter(message, violation, guildConfig) {
    try {
        await message.delete();
    } catch (err) {
        // Already gone (10008) means someone else removed it first, which is
        // quiet and needs nothing from us. Anything else, usually missing Manage
        // Messages, means nothing was enforced, so say so. Either way stop here
        // instead of warning someone for a message that is no longer there.
        if (err.code !== 10008) logger.error('Failed to moderate message:', err);
        return;
    }

    const preview = message.content.slice(0, 50);
    logger.info(`[MOD] Deleted message from ${message.author.tag}: "${preview}${message.content.length > 50 ? '…' : ''}" (Trigger: ${violation})`);

    if (violation === 'Racism/Slurs') {
        // Slurs get the public clapback, that's the house style.
        await postTempNotice(message.channel, getRandomClapback(`<@${message.author.id}>`), CLAPBACK_TTL_MS);
    } else {
        // Politics derails and spam patterns get a quiet notice. Shaming
        // someone publicly for a politics mention starts the exact fight the
        // filter was trying to prevent.
        await postTempNotice(message.channel, `<@${message.author.id}>, that message tripped the word filter (${violation}) and was removed.`);
    }

    // Leave a record, the way anti-spam does. The notice is the only thing the
    // member sees, so without this a repeat offender left no trail for a mod to
    // find. The trigger category goes in the reason, so /infractions
    // distinguishes a slur from a politics derail.
    await tryRecordInfraction({
        guild: message.guild,
        targetUser: message.author,
        moderator: message.client.user,
        type: 'warn',
        reason: `Auto-mod: ${violation}`,
    });
    await escalateStrikes(message, guildConfig);
}

/**
 * Times the author out and records it. The infraction and the channel notice
 * only happen when Discord accepted the timeout: they used to be written
 * whether or not it worked, so a failed timeout was logged as enforced.
 * @returns {Promise<boolean>} whether the timeout was applied
 */
async function applyAutoTimeout(message, reason, durationMs, { announce = false } = {}) {
    if (!message.member?.moderatable) return false;

    try {
        await message.member.timeout(durationMs, `Auto-mod: ${reason}`);
    } catch (err) {
        logger.warn(`[AUTOMOD] Could not time out ${message.author.id} for ${reason}: ${err.message}`);
        return false;
    }

    await tryRecordInfraction({
        guild: message.guild,
        targetUser: message.author,
        moderator: message.client.user,
        type: 'timeout',
        reason: `Auto-mod: ${reason}`,
        durationMs,
    });
    if (announce) await postTempNotice(message.channel, `<@${message.author.id}> was timed out for spamming.`);
    return true;
}

/** Deletes messages by {channelId, id}, ignoring any that are already gone. */
async function deleteMessageRefs(guild, refs) {
    await Promise.all(refs.map(ref => guild.channels.cache.get(ref.channelId)?.messages?.delete(ref.id).catch(() => {})));
}

/** Handles a message carrying a link we never allow: delete, notify, warn. */
async function blockLink(message, guildConfig, { notice, reason }) {
    await message.delete().catch(() => {});
    await postTempNotice(message.channel, `<@${message.author.id}>, ${notice}`);
    await tryRecordInfraction({ guild: message.guild, targetUser: message.author, moderator: message.client.user, type: 'warn', reason: `Auto-mod: ${reason}` });
    await escalateStrikes(message, guildConfig);
    return true;
}

/**
 * Anti-spam and anti-raid checks. Returns true when the message was actioned,
 * so the caller skips XP and further processing.
 *
 * @param {import('discord.js').Message} message
 * @param {object} guildConfig
 */
async function runAntiSpam(message, guildConfig) {
    // Members who can manage messages are trusted and exempt.
    if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

    const key = `${message.author.id}-${message.guild.id}`;
    const timeoutMs = (AS.timeoutMinutes ?? 5) * 60 * 1000;

    // 1. Invite links
    if (AS.blockInvites && containsInvite(message.content)) {
        return blockLink(message, guildConfig, { notice: "posting invite links isn't allowed here.", reason: 'posted an invite link' });
    }

    // 1b. Phishing / scam domains (fake Nitro, Steam). Same handling as invites:
    // these are the links that actually compromise accounts.
    if (containsScamDomain(message.content)) {
        return blockLink(message, guildConfig, { notice: "that link looks like a phishing scam and isn't allowed here.", reason: 'posted a phishing/scam link' });
    }

    // 2. Mass mentions
    if (mentionCount(message) > (AS.maxMentions ?? 5)) {
        await message.delete().catch(() => {});
        await applyAutoTimeout(message, 'mass mentions', timeoutMs);
        return true;
    }

    // 3. Rapid-fire message flooding. Attachments, stickers and custom emoji add
    // weight: five messages carrying ten images apiece is a raid, not chat.
    const customEmoji = (message.content.match(/<a?:\w+:\d+>/g) || []).length;
    const weight = 1 + (message.attachments.size + message.stickers.size) * 2 + customEmoji;
    if (recordAndCheckRate(key, Date.now(), AS.maxMessages ?? 5, (AS.windowSeconds ?? 5) * 1000, weight)) {
        resetRate(key);
        await message.delete().catch(() => {});
        await applyAutoTimeout(message, 'message flooding', timeoutMs, { announce: true });
        return true;
    }

    // 3b. Duplicate-message spam: the same link or scam text posted a few times
    // just slowly enough to stay under the rate limiter. Every copy goes, not
    // just the one that tripped it, since the earlier ones are the same scam.
    const ref = { channelId: message.channel.id, id: message.id };
    if (recordAndCheckDuplicate(key, message.content, Date.now(), AS.maxDuplicates ?? 3, (AS.duplicateWindowSeconds ?? 30) * 1000, ref)) {
        await deleteMessageRefs(message.guild, takeDuplicateRefs(key, message.content));
        resetRate(key);
        await applyAutoTimeout(message, 'duplicate message spam', timeoutMs, { announce: true });
        return true;
    }

    return false;
}

module.exports = {
    evaluateContentFilter,
    enforceContentFilter,
    runAntiSpam,
    postTempNotice,
};
