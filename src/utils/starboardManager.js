/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { EmbedBuilder } = require('discord.js');
const Starboard = require('../database/StarboardSchema');
const { getGuildConfig } = require('./guildConfigCache');
const { PALETTE } = require('./brand');
const logger = require('./logger');

// Resolve a possibly-partial structure, swallowing fetch errors.
async function resolvePartial(obj) {
    if (obj?.partial) {
        try { await obj.fetch(); } catch { return null; }
    }
    return obj;
}

function buildEmbed(message) {
    const embed = new EmbedBuilder()
        .setColor(PALETTE.gold)
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .setDescription(message.content?.slice(0, 2048) || '*[no text]*')
        .addFields({ name: '​', value: `[Jump to message](${message.url})` })
        .setFooter({ text: 'Glitch Haven, Starboard' })
        .setTimestamp(message.createdTimestamp);

    const image = message.attachments.find(a => a.contentType?.startsWith('image/'));
    if (image) embed.setImage(image.url);
    return embed;
}

// Recomputes the starboard state for a message from the live reaction count.
// Called on both add and remove so the count can go up or down and the post is
// removed if stars fall back under the threshold.
async function syncStarboard(reaction) {
    // Cheap gates first, using only what the gateway payload already carries.
    // Every reaction in the server lands here, and fetching a partial costs an
    // HTTP round trip, so nothing is fetched until we know this reaction can
    // actually affect the starboard.
    const guildId = reaction.message?.guildId;
    if (!guildId) return;

    const cfg = await getGuildConfig(guildId) || {};
    const channelId = cfg.starboardChannelId;
    if (!channelId) return; // starboard disabled for this guild

    // The emoji is present on partial reactions too, so mismatches cost nothing.
    const emoji = cfg.starboardEmoji || '⭐';
    if ((reaction.emoji.name || reaction.emoji.toString()) !== emoji) return;

    // Never star a message already sitting in the starboard channel.
    if (reaction.message.channelId === channelId) return;

    // Only now is a fetch worth paying for. A failed reaction fetch means the
    // last one of that emoji was just removed (Discord 404s it). That is not
    // fatal: count is then effectively 0, which still lets us tear down a post
    // that has fallen below the threshold.
    if (reaction.partial) {
        try { await reaction.fetch(); } catch { /* gone, count treated as 0 below */ }
    }
    const message = await resolvePartial(reaction.message);
    if (!message || !message.guild) return;

    const starChannel = message.guild.channels.cache.get(channelId);
    if (!starChannel) return;

    const threshold = cfg.starboardThreshold || 3;
    const count = reaction.count || 0;
    const header = `${emoji} **${count}**, <#${message.channel.id}>`;
    const existing = await Starboard.findOne({ originMessageId: message.id });

    try {
        // Below threshold: tear down any existing post so it doesn't linger.
        if (count < threshold) {
            if (existing) {
                const stale = await starChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
                if (stale) await stale.delete().catch(() => {});
                await Starboard.deleteOne({ originMessageId: message.id });
            }
            return;
        }

        if (existing) {
            const starMsg = await starChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
            if (starMsg) {
                await starMsg.edit({ content: header });
            } else {
                // The post was deleted out from under us, drop the stale record.
                await Starboard.deleteOne({ originMessageId: message.id });
            }
            return;
        }

        const posted = await starChannel.send({ content: header, embeds: [buildEmbed(message)] });
        await Starboard.create({
            guildId: message.guild.id,
            originMessageId: message.id,
            originChannelId: message.channel.id,
            starboardMessageId: posted.id,
        });
    } catch (err) {
        logger.error('[STARBOARD] Failed to sync entry:', err);
    }
}

/**
 * Tears down starboard posts whose ORIGINAL message was deleted. Without this a
 * message removed by a mod (or by its author) keeps a full copy of itself,
 * text and image, sitting in the highlights channel forever.
 *
 * Gated on the cached guild config, so a guild with no starboard pays nothing.
 *
 * @param {import('discord.js').Guild} guild
 * @param {string[]} messageIds ids of the deleted origin messages
 * @returns {Promise<number>} how many starboard entries were removed
 */
async function removeForDeletedOrigins(guild, messageIds) {
    if (!guild || !messageIds.length) return 0;

    const cfg = await getGuildConfig(guild.id) || {};
    if (!cfg.starboardChannelId) return 0;

    let records;
    try {
        // originMessageId is uniquely indexed, so this is a cheap indexed $in.
        // guildId is there to keep one guild from ever reaching another's rows.
        records = await Starboard.find({ guildId: guild.id, originMessageId: { $in: messageIds } }).lean();
    } catch (err) {
        logger.error('[STARBOARD] Orphan lookup failed:', err);
        return 0;
    }
    if (!records.length) return 0;

    // Drop the records even when the channel is gone, so nothing is left behind.
    const starChannel = guild.channels.cache.get(cfg.starboardChannelId);
    if (starChannel) {
        for (const rec of records) {
            await starChannel.messages.fetch(rec.starboardMessageId)
                .then(m => m.delete())
                .catch(() => { /* already gone, the record is dropped either way */ });
        }
    }

    try {
        await Starboard.deleteMany({ _id: { $in: records.map(r => r._id) } });
    } catch (err) {
        logger.error('[STARBOARD] Orphan record cleanup failed:', err);
    }

    logger.info(`[STARBOARD] Removed ${records.length} entr${records.length === 1 ? 'y' : 'ies'} for deleted message(s).`);
    return records.length;
}

module.exports = { syncStarboard, removeForDeletedOrigins };
