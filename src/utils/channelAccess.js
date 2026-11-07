/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { PermissionFlagsBits } = require('discord.js');
const channels = require('./channels');
const logger = require('./logger');

const DISCORD_MISSING_PERMISSIONS = 50013;

// What a plain post, an embed post and an embed-with-image post each need.
const NEEDS = {
    text: ['ViewChannel', 'SendMessages'],
    embed: ['ViewChannel', 'SendMessages', 'EmbedLinks'],
    file: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles'],
};

/**
 * Names of the permissions the bot lacks in a channel, empty when it has them
 * all (or when the channel is not one we can check, such as a partial).
 *
 * @param {import('discord.js').GuildBasedChannel | null | undefined} channel
 * @param {'text' | 'embed' | 'file'} [kind]
 * @returns {string[]}
 */
function missingPermissions(channel, kind = 'file') {
    const me = channel?.guild?.members?.me;
    const perms = me && channel.permissionsFor?.(me);
    if (!perms) return [];
    return NEEDS[kind].filter(name => !perms.has(PermissionFlagsBits[name]));
}

/** True when an error is Discord refusing the bot for lack of permission. */
function isMissingPermissions(err) {
    return err?.code === DISCORD_MISSING_PERMISSIONS;
}

/**
 * Sends a message, and when the image attachment is what Discord refuses,
 * retries once with the files stripped so the text still gets through. Any
 * other failure is thrown to the caller, who decides whether it matters.
 *
 * @param {import('discord.js').TextBasedChannel} channel
 * @param {import('discord.js').MessageCreateOptions} payload
 */
async function sendWithFallback(channel, payload) {
    try {
        return await channel.send(payload);
    } catch (err) {
        const hasFiles = Array.isArray(payload.files) && payload.files.length > 0;
        if (!isMissingPermissions(err) || !hasFiles) throw err;
        const rest = { ...payload };
        delete rest.files;
        return channel.send(rest);
    }
}

/**
 * One readable line for a channel the bot cannot post to properly.
 * @returns {string}
 */
function describeMissing(channel, missing) {
    return `#${channel.name} (${channel.id}) is missing ${missing.join(', ')}`;
}

/**
 * Logs, once at boot, every channel the bot posts to where its permissions
 * fall short. A channel that denies the bot Send Messages fails every
 * announcement silently from the feature's side, so this puts the cause in the
 * log where an owner will see it, instead of leaving it as a vague 50013.
 *
 * @param {import('discord.js').Client} client
 * @param {(guildId: string) => Promise<object | null>} getConfig
 * @returns {Promise<number>} how many channels had a problem
 */
async function auditChannelAccess(client, getConfig) {
    let problems = 0;
    for (const guild of client.guilds.cache.values()) {
        const cfg = (await getConfig(guild.id).catch(() => null)) || {};
        const wanted = {
            announcements: cfg.announcementsChannelId || channels.announcements,
            lfg: cfg.lfgChannelId || channels.lfg,
            levelUpLog: cfg.levelUpLogChannelId || channels.levelUpLog,
            modLog: cfg.modLogChannelId || channels.modLog,
            streamer: cfg.streamerChannelId,
            starboard: cfg.starboardChannelId,
            suggestions: cfg.suggestionChannelId,
            counting: cfg.countingChannelId,
        };

        for (const [label, id] of Object.entries(wanted)) {
            if (!id) continue;
            const channel = guild.channels.cache.get(id);
            if (!channel) continue;
            const missing = missingPermissions(channel, 'file');
            if (!missing.length) continue;
            problems += 1;
            logger.warn(`[ACCESS] ${label}: ${describeMissing(channel, missing)}. Give the bot role those permissions in that channel.`);
        }
    }
    return problems;
}

module.exports = {
    missingPermissions,
    isMissingPermissions,
    sendWithFallback,
    describeMissing,
    auditChannelAccess,
    DISCORD_MISSING_PERMISSIONS,
};
