/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const TempVoice = require('../database/TempVoiceSchema');
const { getGuildConfig } = require('./guildConfigCache');
const { checkMessage } = require('./filterManager');
const logger = require('./logger');

const MAX_LOBBIES_PER_GUILD = 25;
const CREATE_COOLDOWN_MS = 10 * 1000;
const CHANNEL_NAME_MAX = 100;
// Discord allows two renames per channel every ten minutes. Past that the REST
// call queues for minutes, so the command refuses up front instead of hanging.
const RENAME_LIMIT = 2;
const RENAME_WINDOW_MS = 10 * 60 * 1000;

const REQUIRED_PERMISSIONS = [
    ['ViewChannel', PermissionFlagsBits.ViewChannel],
    ['Connect', PermissionFlagsBits.Connect],
    ['ManageChannels', PermissionFlagsBits.ManageChannels],
    ['MoveMembers', PermissionFlagsBits.MoveMembers],
];

// channelId -> { guildId, ownerId }. Mirrors the TempVoice collection.
const lobbies = new Map();
const lastCreate = new Map(); // `${guildId}:${userId}` -> epoch ms
const renameLog = new Map(); // channelId -> recent rename timestamps
const warnedGuilds = new Set();

function cleanChannelName(raw) {
    return String(raw ?? '')
        .replace(/[\p{Cc}\p{Cf}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, CHANNEL_NAME_MAX);
}

/**
 * Name for a fresh lobby. Display names are user controlled, so one that trips
 * the content filter falls back to a neutral name.
 */
function defaultLobbyName(displayName) {
    const base = cleanChannelName(displayName).slice(0, 80);
    if (!base || checkMessage(base)) return 'Glitch Lobby';
    return `${base}'s Lobby`;
}

/** Names of the required permissions the bot lacks in a channel. */
function missingPermissions(permissions) {
    if (!permissions) return REQUIRED_PERMISSIONS.map(([name]) => name);
    return REQUIRED_PERMISSIONS.filter(([, bit]) => !permissions.has(bit)).map(([name]) => name);
}

/** True and records the attempt when the member is not creating lobbies too fast. */
function consumeCreate(guildId, userId, now = Date.now(), store = lastCreate) {
    const key = `${guildId}:${userId}`;
    const last = store.get(key);
    if (last !== undefined && now - last < CREATE_COOLDOWN_MS) return false;
    store.set(key, now);
    if (store.size > 500) {
        for (const [k, t] of store) {
            if (now - t >= CREATE_COOLDOWN_MS) store.delete(k);
        }
    }
    return true;
}

/** True and records the rename when the channel is under the rename limit. */
function consumeRename(channelId, now = Date.now(), store = renameLog) {
    const recent = (store.get(channelId) || []).filter(t => now - t < RENAME_WINDOW_MS);
    if (recent.length >= RENAME_LIMIT) {
        store.set(channelId, recent);
        return false;
    }
    recent.push(now);
    store.set(channelId, recent);
    return true;
}

function countLobbies(guildId) {
    let n = 0;
    for (const info of lobbies.values()) {
        if (info.guildId === guildId) n += 1;
    }
    return n;
}

function getLobby(channelId) {
    return lobbies.get(channelId) || null;
}

async function forgetLobby(channelId) {
    lobbies.delete(channelId);
    renameLog.delete(channelId);
    await TempVoice.deleteOne({ channelId });
}

async function deleteIfEmpty(channel) {
    if (!channel || !lobbies.has(channel.id) || channel.members.size > 0) return;
    await forgetLobby(channel.id);
    await channel.delete('Temp voice channel is empty').catch(err => {
        if (err.code !== 10003) logger.warn(`[TEMPVOICE] Could not delete ${channel.id}: ${err.message}`);
    });
}

async function createLobby(state) {
    const { guild, member } = state;
    const hub = state.channel;
    if (!hub) return;

    const missing = missingPermissions(hub.permissionsFor(guild.members.me));
    if (missing.length > 0) {
        if (!warnedGuilds.has(guild.id)) {
            warnedGuilds.add(guild.id);
            logger.warn(`[TEMPVOICE] Cannot create lobbies in ${guild.id}, the bot is missing: ${missing.join(', ')}.`);
        }
        return;
    }
    if (!consumeCreate(guild.id, member.id)) return;
    if (countLobbies(guild.id) >= MAX_LOBBIES_PER_GUILD) return;

    const lobby = await guild.channels.create({
        name: defaultLobbyName(member.displayName),
        type: ChannelType.GuildVoice,
        parent: hub.parentId,
        bitrate: hub.bitrate,
        reason: `Temp voice for ${member.user.tag}`,
    });

    try {
        await TempVoice.create({ guildId: guild.id, channelId: lobby.id, ownerId: member.id });
    } catch (err) {
        await lobby.delete('Could not record temp voice channel').catch(() => {});
        throw err;
    }
    lobbies.set(lobby.id, { guildId: guild.id, ownerId: member.id });

    try {
        await member.voice.setChannel(lobby, 'Temp voice');
    } catch (err) {
        // Usually the member left the hub before the move landed.
        logger.info(`[TEMPVOICE] Could not move ${member.id} into ${lobby.id}: ${err.message}`);
        await deleteIfEmpty(lobby);
    }
}

/** voiceStateUpdate entry point: tear down emptied lobbies, spawn new ones. */
async function handleVoiceChange(oldState, newState) {
    if (oldState.channelId === newState.channelId) return;

    if (oldState.channelId && lobbies.has(oldState.channelId)) {
        await deleteIfEmpty(oldState.channel);
    }

    if (!newState.channelId || !newState.member || newState.member.user.bot) return;
    const guildConfig = await getGuildConfig(newState.guild.id) || {};
    if (guildConfig.tempVoiceHubChannelId && newState.channelId === guildConfig.tempVoiceHubChannelId) {
        await createLobby(newState);
    }
}

/**
 * Reloads tracked lobbies after a restart and removes the ones that emptied or
 * were deleted while the bot was offline. Also runs on a timer as a backstop.
 */
async function sweepTempVoice(client) {
    const guildIds = [...client.guilds.cache.keys()];
    const docs = await TempVoice.find({ guildId: { $in: guildIds } }).lean();

    for (const doc of docs) {
        const channel = client.guilds.cache.get(doc.guildId)?.channels.cache.get(doc.channelId);
        if (!channel) {
            await forgetLobby(doc.channelId);
            continue;
        }
        lobbies.set(doc.channelId, { guildId: doc.guildId, ownerId: doc.ownerId });
        await deleteIfEmpty(channel);
    }
}

/**
 * Finds the lobby a member is sitting in for a command.
 * @returns {{ channel?: object, info?: object, error?: string }}
 */
function resolveLobby(member) {
    const channel = member.voice?.channel;
    if (!channel) return { error: 'Join your lobby first.' };
    const info = getLobby(channel.id);
    if (!info) return { error: 'That is not a temporary lobby.' };
    return { channel, info };
}

async function transferOwner(channelId, newOwnerId) {
    const info = lobbies.get(channelId);
    if (!info) return;
    info.ownerId = newOwnerId;
    await TempVoice.updateOne({ channelId }, { $set: { ownerId: newOwnerId } });
}

module.exports = {
    cleanChannelName,
    defaultLobbyName,
    missingPermissions,
    consumeCreate,
    consumeRename,
    countLobbies,
    getLobby,
    forgetLobby,
    handleVoiceChange,
    sweepTempVoice,
    resolveLobby,
    transferOwner,
    MAX_LOBBIES_PER_GUILD,
    CREATE_COOLDOWN_MS,
};
