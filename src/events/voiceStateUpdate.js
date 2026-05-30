const { EmbedBuilder } = require('discord.js');
const User = require('../database/UserSchema');
const config = require('../../config.json');
const { getXpMultiplier, isDoubleXpActive } = require('../utils/isDoubleXp');
const { xpRequiredForLevel } = require('../utils/calculateXp');
const levelUpSayings = require('../utils/levelUpSayings');

// In-memory map tracking active voice session start times: `${userId}-${guildId}` -> timestamp
const voiceSessions = new Map();

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

    // Must be at least one other non-bot, unmuted, undeafened member in the channel (prevents solo farming with alts)
    const activeMembersCount = channel.members.filter(m => {
        if (m.user.bot) return false;
        if (m.voice.selfMute || m.voice.serverMute) return false;
        if (m.voice.selfDeafen || m.voice.serverDeafen) return false;
        return true;
    }).size;
    return activeMembersCount >= 2;
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

        const { voiceXpPerTick, voiceTickMinutes } = config.xpSettings;
        const minutesInVoice = (Date.now() - joinTime) / 1000 / 60;
        const ticks = Math.floor(minutesInVoice / voiceTickMinutes);
        if (ticks < 1) return; // Not active long enough to earn a tick

        const xpToGive = Math.floor(ticks * voiceXpPerTick * getXpMultiplier());

        try {
            let userData = await User.findOneAndUpdate(
                { userId, guildId },
                { $inc: { xp: xpToGive } },
                { upsert: true, returnDocument: 'after' }
            );

            console.log(`🎙️ Gave ${xpToGive} voice XP to ${member.user.tag} for their active session.`);

            // Check for level ups (loop ensures multi-level jumps are handled)
            let leveledUp = false;
            while (userData.xp >= xpRequiredForLevel(userData.level + 1)) {
                userData.level += 1;
                leveledUp = true;
            }

            if (leveledUp) {
                await userData.save();
                console.log(`⬆️ ${member.user.tag} leveled up to Level ${userData.level} via voice!`);

                const levelUpLogChannel = client.channels.cache.get(config.channels.levelUpLog);
                if (levelUpLogChannel) {
                    const randomSaying = levelUpSayings[Math.floor(Math.random() * levelUpSayings.length)];
                    const levelUpEmbed = new EmbedBuilder()
                        .setTitle('⬆️ Level Up!')
                        .setDescription(
                            `Congratulations ${member}! You just hit **Level ${userData.level}** by hanging out in voice!\n\n*${randomSaying}*` +
                            (isDoubleXpActive() ? '\n\n🔥 **Double XP Weekend** — you earned 2× XP!' : '')
                        )
                        .setColor(config.theme.silver)
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

                    await levelUpLogChannel.send({ content: `${member}`, embeds: [levelUpEmbed] });
                }
            }
        } catch (err) {
            console.error('Error granting voice XP or handling level up:', err);
        }
    }
}

module.exports = {
    name: 'voiceStateUpdate',
    voiceSessions,
    isMemberActive,
    updateMemberSession,
    async execute(oldState, newState, client) {
        const membersToUpdate = new Set();

        // Add the primary member whose state changed
        if (oldState.member) membersToUpdate.add(oldState.member);
        if (newState.member) membersToUpdate.add(newState.member);

        // Add all members in the previous channel (to re-verify solo status for remaining members)
        if (oldState.channel) {
            for (const m of oldState.channel.members.values()) {
                membersToUpdate.add(m);
            }
        }

        // Add all members in the new channel (to activate/re-verify status for members there)
        if (newState.channel) {
            for (const m of newState.channel.members.values()) {
                membersToUpdate.add(m);
            }
        }

        // Evaluate and update session timers for all affected users
        for (const member of membersToUpdate) {
            await updateMemberSession(member, client);
        }
    }
};


