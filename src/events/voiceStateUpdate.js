/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const config = require('../../config.json');
const { getXpMultiplier } = require('../utils/isDoubleXp');
const { queueXp } = require('../utils/xpCache');
const { getGuildConfig } = require('../utils/guildConfigCache');
const { startPolling } = require('../utils/scheduler');
const logger = require('../utils/logger');

const tuning = config.tuning || {};
const VOICE_TICK_CHECK_MS = tuning.voiceTickCheckMs || 60 * 1000;
const VOICE_DEBOUNCE_MS = tuning.voiceDebounceMs || 5000;

// In-memory map tracking active voice session start times: `${userId}-${guildId}` -> timestamp
const voiceSessions = new Map();

// Debounce trackers to filter out rapid event fluctuations
const voiceDebounceTimers = new Map();

/**
 * Checks if a member is currently active and eligible for voice XP.
 */
function isMemberActive(member) {
    if (!member || member.user.bot) return false;

    const voiceState = member.voice;
    if (!voiceState.channelId) return false;

    // Ignore users in the guild's AFK channel
    if (voiceState.channelId === member.guild.afkChannelId) return false;

    // Ignore muted or deafened users (prevents sleeping/AFK farming)
    if (voiceState.selfMute || voiceState.serverMute) return false;
    if (voiceState.selfDeafen || voiceState.serverDeafen) return false;

    const channel = voiceState.channel;
    if (!channel) return false;

    // Must be at least one other non-bot, unmuted, undeafened member in the channel
    const activeMembersCount = channel.members.filter(m => {
        if (m.user.bot) return false;
        if (m.voice.selfMute || m.voice.serverMute) return false;
        if (m.voice.selfDeafen || m.voice.serverDeafen) return false;
        return true;
    }).size;
    return activeMembersCount >= 2;
}

/**
 * Shared function to grant voice XP via the high-performance memory cache.
 * Pass preloaded values when the caller already read the guild config, so a
 * tick over many members doesn't fetch it once per member.
 */
async function processVoiceXp(userId, guildId, member, client, ticks, preloaded = {}) {
    const guildConfig = preloaded.guildConfig || (await getGuildConfig(guildId)) || {};
    if (guildConfig.voiceXpEnabled === false) return;

    const voiceXpPerTick = preloaded.voiceXpPerTick ?? guildConfig.voiceXpPerTick ?? config.xpSettings.voiceXpPerTick;
    const xpToGive = Math.floor(ticks * voiceXpPerTick * getXpMultiplier());

    try {
        const voiceChannelId = member.voice.channelId || null;
        queueXp(userId, guildId, xpToGive, voiceChannelId, { isMessage: false });
    } catch (err) {
        logger.error('Error queueing voice XP:', err);
    }
}

/**
 * Updates a member's session status. Starts a timer if active, or awards XP and clears it if inactive.
 */
async function updateMemberSession(member, client) {
    const userId = member.id;
    const guildId = member.guild.id;
    const sessionKey = `${userId}-${guildId}`;
    const isActive = isMemberActive(member);
    const joinTime = voiceSessions.get(sessionKey);

    // Active and no session tracked -> start tracking
    if (isActive && !joinTime) {
        voiceSessions.set(sessionKey, Date.now());
        return;
    }

    // Inactive but session was tracked -> finalize session and award XP
    if (!isActive && joinTime) {
        voiceSessions.delete(sessionKey);

        const guildConfig = await getGuildConfig(guildId) || {};
        const voiceTickMinutes = guildConfig.voiceTickMinutes ?? config.xpSettings.voiceTickMinutes;
        const minutesInVoice = (Date.now() - joinTime) / 1000 / 60;
        const ticks = Math.floor(minutesInVoice / voiceTickMinutes);
        if (ticks >= 1) {
            try {
                await processVoiceXp(userId, guildId, member, client, ticks, { guildConfig });
            } catch (err) {
                logger.error('[VoiceXP] processVoiceXp failed; restoring session to retry next tick:', err);
                voiceSessions.set(sessionKey, joinTime);
            }
        }
    }
}

/**
 * Periodically checks all active voice sessions and awards XP in real-time.
 * Sessions are grouped by guild so the config is read once per guild per tick
 * (not once per member), and the per-guild tick length applies here exactly
 * like it does when a session is finalized on leave.
 */
async function tickVoiceSessions(client) {
    const now = Date.now();

    const sessionsByGuild = new Map();
    for (const [sessionKey, joinTime] of voiceSessions.entries()) {
        const [userId, guildId] = sessionKey.split('-');
        const list = sessionsByGuild.get(guildId);
        if (list) list.push({ sessionKey, userId, joinTime });
        else sessionsByGuild.set(guildId, [{ sessionKey, userId, joinTime }]);
    }

    for (const [guildId, sessions] of sessionsByGuild) {
        const guildConfig = await getGuildConfig(guildId) || {};
        if (guildConfig.voiceXpEnabled === false) continue;

        const voiceTickMinutes = guildConfig.voiceTickMinutes ?? config.xpSettings.voiceTickMinutes;
        const voiceXpPerTick = guildConfig.voiceXpPerTick ?? config.xpSettings.voiceXpPerTick;

        for (const { sessionKey, userId, joinTime } of sessions) {
            const minutesInVoice = (now - joinTime) / 1000 / 60;
            const ticks = Math.floor(minutesInVoice / voiceTickMinutes);
            if (ticks < 1) continue;

            const guild = client.guilds.cache.get(guildId);
            const member = guild ? guild.members.cache.get(userId) : null;

            // Sanity check: Ensure they are actually still active. If not, delete their ghost session.
            if (!member || !isMemberActive(member)) {
                voiceSessions.delete(sessionKey);
                continue;
            }

            // Fire and forget, but never unhandled: a DB blip here would
            // otherwise surface as an unhandled rejection.
            processVoiceXp(userId, guildId, member, client, ticks, { guildConfig, voiceXpPerTick })
                .catch(err => logger.error('[VoiceXP] Tick grant failed:', err));

            // Reset the joinTime so they can start earning the next tick
            voiceSessions.set(sessionKey, now);
        }
    }
}

/**
 * Finalizes every tracked voice session, queueing the XP earned so far.
 * Called on graceful shutdown so a restart or redeploy doesn't silently drop
 * the voice XP accumulated since the last tick.
 * @returns {number} sessions that earned XP
 */
async function finalizeVoiceSessions() {
    let finalized = 0;

    const sessionsByGuild = new Map();
    for (const [sessionKey, joinTime] of voiceSessions.entries()) {
        const [userId, guildId] = sessionKey.split('-');
        const list = sessionsByGuild.get(guildId);
        if (list) list.push({ sessionKey, userId, joinTime });
        else sessionsByGuild.set(guildId, [{ sessionKey, userId, joinTime }]);
    }

    for (const [guildId, sessions] of sessionsByGuild) {
        const guildConfig = await getGuildConfig(guildId) || {};
        const voiceTickMinutes = guildConfig.voiceTickMinutes ?? config.xpSettings.voiceTickMinutes;
        const voiceXpPerTick = guildConfig.voiceXpPerTick ?? config.xpSettings.voiceXpPerTick;
        const enabled = guildConfig.voiceXpEnabled !== false;

        for (const { sessionKey, userId, joinTime } of sessions) {
            voiceSessions.delete(sessionKey);
            if (!enabled) continue;
            const minutesInVoice = (Date.now() - joinTime) / 1000 / 60;
            const ticks = Math.floor(minutesInVoice / voiceTickMinutes);
            if (ticks < 1) continue;
            const xpToGive = Math.floor(ticks * voiceXpPerTick * getXpMultiplier());
            if (xpToGive > 0) {
                queueXp(userId, guildId, xpToGive, null, { isMessage: false });
                finalized += 1;
            }
        }
    }

    return finalized;
}

/**
 * Starts the periodic voice XP tick. Routed through the shared scheduler so a
 * slow tick can never overlap the next one.
 */
function startVoiceXpSync(client) {
    startPolling({
        name: 'VOICEXP',
        task: () => tickVoiceSessions(client),
        intervalMs: VOICE_TICK_CHECK_MS,
    });
}

module.exports = {
    name: 'voiceStateUpdate',
    voiceSessions,
    isMemberActive,
    updateMemberSession,
    startVoiceXpSync,
    finalizeVoiceSessions,
    async execute(oldState, newState, client) {
        const membersToUpdate = new Set();

        if (oldState.member) membersToUpdate.add(oldState.member);
        if (newState.member) membersToUpdate.add(newState.member);

        if (oldState.channel) {
            for (const m of oldState.channel.members.values()) {
                membersToUpdate.add(m);
            }
        }

        if (newState.channel) {
            for (const m of newState.channel.members.values()) {
                membersToUpdate.add(m);
            }
        }

        // Apply a 5-second debounce loop across all targeted channel members
        for (const member of membersToUpdate) {
            const debounceKey = `${member.id}-${member.guild.id}`;

            if (voiceDebounceTimers.has(debounceKey)) {
                clearTimeout(voiceDebounceTimers.get(debounceKey));
            }

            const timer = setTimeout(async () => {
                await updateMemberSession(member, client).catch(err => logger.error('[VoiceXP] updateMemberSession failed:', err));
                voiceDebounceTimers.delete(debounceKey);
            }, VOICE_DEBOUNCE_MS); // 5-second stabilization frame

            voiceDebounceTimers.set(debounceKey, timer);
        }
    }
};