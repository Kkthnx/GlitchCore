const config = require('../../config.json');
const { getXpMultiplier } = require('../utils/isDoubleXp');
const { queueXp } = require('../utils/xpCache');
const { getGuildConfig } = require('../utils/guildConfigCache');
const logger = require('../utils/logger');

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
 */
async function processVoiceXp(userId, guildId, member, client, ticks) {
    const guildConfig = await getGuildConfig(guildId) || {};
    if (guildConfig.voiceXpEnabled === false) return;

    const voiceXpPerTick = guildConfig.voiceXpPerTick ?? config.xpSettings.voiceXpPerTick;
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
                await processVoiceXp(userId, guildId, member, client, ticks);
            } catch (err) {
                logger.error('[VoiceXP] processVoiceXp failed; restoring session to retry next tick:', err);
                voiceSessions.set(sessionKey, joinTime);
            }
        }
    }
}

/**
 * Periodically checks all active voice sessions and awards XP in real-time.
 */
function startVoiceXpSync(client) {
    let running = false;
    setInterval(async () => {
        if (running) return;
        running = true;
        try {
            const now = Date.now();
            const { voiceTickMinutes } = config.xpSettings;

            for (const [sessionKey, joinTime] of voiceSessions.entries()) {
                const minutesInVoice = (now - joinTime) / 1000 / 60;
                const ticks = Math.floor(minutesInVoice / voiceTickMinutes);

                if (ticks >= 1) {
                    const [userId, guildId] = sessionKey.split('-');
                    const guild = client.guilds.cache.get(guildId);
                    let member = null;
                    if (guild) {
                        member = guild.members.cache.get(userId);
                    }

                    // Sanity check: Ensure they are actually still active. If not, delete their ghost session.
                    if (!member || !isMemberActive(member)) {
                        voiceSessions.delete(sessionKey);
                        continue;
                    }

                    processVoiceXp(userId, guildId, member, client, ticks);

                    // Reset the joinTime so they can start earning the next tick
                    voiceSessions.set(sessionKey, now);
                }
            }
        } finally {
            running = false;
        }
    }, 60 * 1000); // Check every minute
}

module.exports = {
    name: 'voiceStateUpdate',
    voiceSessions,
    isMemberActive,
    updateMemberSession,
    startVoiceXpSync,
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
            }, 5000); // 5-second stabilization frame

            voiceDebounceTimers.set(debounceKey, timer);
        }
    }
};