const { EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const { isDoubleXpActive } = require('../utils/isDoubleXp');
const BotState = require('../database/BotStateSchema');

// ---------------------------------------------------------------------------
// Returns today's date as a YYYY-MM-DD string for deduplication
// ---------------------------------------------------------------------------
function getTodayString() {
    return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Builds and sends the Double XP announcement embed with @everyone.
// Saves today's date to BotState so restarts within the same day are silent.
// ---------------------------------------------------------------------------
async function announceDoubleXp(client, guildId) {
    try {
        const channel = client.channels.cache.get(config.channels.announcements);
        if (!channel) return console.warn('⚠️  Announcements channel not found. Check config.json.');

        const dayName = new Date().getDay() === 5 ? 'Friday' : 'Saturday';

        const embed = new EmbedBuilder()
            .setTitle('🔥 Double XP Weekend — ACTIVE!')
            .setDescription(
                `It's **${dayName}**, which means **Double XP is now live in GlitchHaven!**\n\n` +
                `> 💬 **Send messages** — earn **2× text XP**\n` +
                `> 🎙️ **Hang in voice** — earn **2× voice XP**\n` +
                `> 📈 **Climb the leaderboard** — use \`/rank\` to check your progress\n\n` +
                `⏰ Double XP runs every **Friday & Saturday**. Don't sleep on it!`
            )
            .setColor(config.theme.blue)
            .setFooter({ text: 'GlitchHaven • Double XP Weekend' })
            .setTimestamp();

        await channel.send({ content: '@everyone', embeds: [embed] });
        console.log(`📢 Double XP announcement sent for ${dayName}.`);

        // Persist today's date so we don't re-announce on restart
        await BotState.findOneAndUpdate(
            { guildId },
            { lastDoubleXpDate: getTodayString() },
            { upsert: true }
        );
    } catch (err) {
        console.error('❌ Failed to send double XP announcement:', err);
    }
}

// ---------------------------------------------------------------------------
// Checks if we already announced today — if not, announces.
// ---------------------------------------------------------------------------
async function checkAndAnnounceDoubleXp(client, guildId) {
    if (!isDoubleXpActive()) return;

    const state = await BotState.findOne({ guildId });
    const alreadyAnnouncedToday = state?.lastDoubleXpDate === getTodayString();

    if (alreadyAnnouncedToday) {
        console.log('⏭️  Double XP already announced today — skipping.');
        return;
    }

    await announceDoubleXp(client, guildId);
}

// ---------------------------------------------------------------------------
// Schedules a check at the next midnight, then reschedules itself every 24h.
// ---------------------------------------------------------------------------
function scheduleMidnightCheck(client, guildId) {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = nextMidnight - now;

    setTimeout(async () => {
        await checkAndAnnounceDoubleXp(client, guildId);
        scheduleMidnightCheck(client, guildId); // reschedule for next midnight
    }, msUntilMidnight);

    const hrs  = Math.floor(msUntilMidnight / 1000 / 60 / 60);
    const mins = Math.floor((msUntilMidnight / 1000 / 60) % 60);
    console.log(`⏰ Next double XP check scheduled in ${hrs}h ${mins}m (midnight).`);
}

// ---------------------------------------------------------------------------
// Recover and initialize sessions for users already in voice channels on start
// ---------------------------------------------------------------------------
function recoverActiveVoiceSessions(client) {
    const { voiceSessions, isMemberActive } = require('./voiceStateUpdate');
    let recoveredCount = 0;

    for (const guild of client.guilds.cache.values()) {
        for (const channel of guild.channels.cache.values()) {
            if (channel.isVoiceBased()) {
                for (const member of channel.members.values()) {
                    if (isMemberActive(member)) {
                        const sessionKey = `${member.id}-${guild.id}`;
                        voiceSessions.set(sessionKey, Date.now());
                        recoveredCount++;
                    }
                }
            }
        }
    }

    if (recoveredCount > 0) {
        console.log(`📡 Recovered and initialized ${recoveredCount} active voice sessions from startup check.`);
    }
}

// ---------------------------------------------------------------------------
// Ready event
// ---------------------------------------------------------------------------
module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        console.log(`✅ Logged in as ${client.user.tag}`);
        console.log(`📡 Serving ${client.guilds.cache.size} guild(s)`);

        // Recover active voice sessions across all channels
        recoverActiveVoiceSessions(client);

        // Run stale LFG cleanup once on startup
        const { cleanUpStaleLfgSessions } = require('../utils/lfgManager');
        cleanUpStaleLfgSessions(client).catch(console.error);

        // Schedule periodic stale LFG cleanup every 30 minutes (1,800,000 ms)
        setInterval(() => {
            cleanUpStaleLfgSessions(client).catch(console.error);
        }, 30 * 60 * 1000);

        // Use the first guild's ID for state tracking (single-server setup)
        const guildId = client.guilds.cache.first()?.id;
        if (!guildId) return console.warn('⚠️  No guilds found in cache.');

        // Only announce if it's a double XP day AND we haven't already announced today
        await checkAndAnnounceDoubleXp(client, guildId);

        // Schedule all future midnight checks
        scheduleMidnightCheck(client, guildId);
    },
};


