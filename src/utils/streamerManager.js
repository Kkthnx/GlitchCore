/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { EmbedBuilder } = require('discord.js');
const Streamer = require('../database/StreamerSchema');
const { getLiveStreams, isConfigured } = require('./twitchClient');
const { getGuildConfig } = require('./guildConfigCache');
const logger = require('./logger');

const TWITCH_PURPLE = 0x9146ff;
const POLL_INTERVAL_MS = 3 * 60 * 1000;

async function announceLive(client, streamer, stream) {
    const cfg = await getGuildConfig(streamer.guildId) || {};
    const channelId = cfg.streamerChannelId;
    if (!channelId) return; // no go-live channel configured for this guild

    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    const url = `https://twitch.tv/${streamer.twitchLogin}`;
    const thumb = (stream.thumbnail_url || '')
        .replace('{width}', '440').replace('{height}', '248') + `?t=${Date.now()}`;

    const embed = new EmbedBuilder()
        .setColor(TWITCH_PURPLE)
        .setAuthor({ name: `${stream.user_name} is now LIVE on Twitch!` })
        .setTitle((stream.title || 'Live now').slice(0, 256))
        .setURL(url)
        .setDescription(
            (streamer.discordUserId ? `<@${streamer.discordUserId}> is streaming\n` : '') +
            `🎮 **${stream.game_name || 'Just Chatting'}**`
        )
        .addFields(
            { name: 'Watch', value: `[twitch.tv/${streamer.twitchLogin}](${url})`, inline: true },
            { name: 'Viewers', value: `${stream.viewer_count ?? 0}`, inline: true },
        )
        .setFooter({ text: 'Glitch Haven • Twitch' })
        .setTimestamp();
    if (thumb.startsWith('http')) embed.setImage(thumb);

    const rolePing = cfg.streamerPingRoleId ? `<@&${cfg.streamerPingRoleId}> ` : '';
    const msg = await channel.send({
        content: `${rolePing}🔴 **${stream.user_name}** is live!`,
        embeds: [embed],
        allowedMentions: { roles: cfg.streamerPingRoleId ? [cfg.streamerPingRoleId] : [] },
    });

    // Remember the message so we can clean it up when they go offline.
    streamer.liveMessageId = msg.id;
    streamer.liveChannelId = channel.id;
    await streamer.save().catch(() => {});
    logger.info(`[TWITCH] Announced ${streamer.twitchLogin} live in guild ${streamer.guildId}.`);
}

// Deletes the live announcement when a streamer goes offline.
async function cleanupAnnouncement(client, streamer) {
    if (!streamer.liveMessageId || !streamer.liveChannelId) return;
    const channel = client.channels.cache.get(streamer.liveChannelId);
    if (channel) {
        await channel.messages.fetch(streamer.liveMessageId)
            .then(m => m.delete())
            .catch(() => { /* already gone */ });
    }
    streamer.liveMessageId = null;
    streamer.liveChannelId = null;
}

async function pollStreamers(client) {
    if (!isConfigured()) return;

    // Only this shard's guilds — avoids cross-shard channel misses and duplicate posts.
    const guildIds = [...client.guilds.cache.keys()];
    if (!guildIds.length) return;

    const streamers = await Streamer.find({ guildId: { $in: guildIds } });
    if (!streamers.length) return;

    const logins = [...new Set(streamers.map(s => s.twitchLogin))];
    let live;
    try {
        live = await getLiveStreams(logins);
    } catch (err) {
        return logger.error('[TWITCH] Poll failed:', err.message);
    }
    const byLogin = new Map(live.map(s => [String(s.user_login).toLowerCase(), s]));

    for (const streamer of streamers) {
        const stream = byLogin.get(streamer.twitchLogin);
        if (stream) {
            // Announce only on a fresh stream (new id) or a live edge.
            if (!streamer.isLive || streamer.lastStreamId !== stream.id) {
                streamer.isLive = true;
                streamer.lastStreamId = stream.id;
                await streamer.save().catch(() => {});
                await announceLive(client, streamer, stream).catch(err => logger.error('[TWITCH] Announce failed:', err));
            }
        } else if (streamer.isLive) {
            // Went offline — remove the announcement and reset state.
            streamer.isLive = false;
            await cleanupAnnouncement(client, streamer);
            await streamer.save().catch(() => {});
            logger.info(`[TWITCH] ${streamer.twitchLogin} went offline — cleaned up announcement.`);
        }
    }
}

function startStreamerScheduler(client) {
    if (!isConfigured()) {
        logger.info('[TWITCH] Twitch credentials not set — streamer notifications disabled.');
        return;
    }
    setTimeout(() => pollStreamers(client).catch(err => logger.error('[TWITCH] Initial poll failed:', err)), 15_000);
    setInterval(() => pollStreamers(client).catch(err => logger.error('[TWITCH] Scheduler tick failed:', err)), POLL_INTERVAL_MS);
    logger.info('[TWITCH] Streamer go-live poller started.');
}

module.exports = { pollStreamers, announceLive, startStreamerScheduler };
