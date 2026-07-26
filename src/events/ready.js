/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { ActivityType } = require('discord.js');
const config = require('../../config.json');
const { brandedEmbed, COLORS } = require('../utils/brand');
const { isDoubleXpStartDay } = require('../utils/isDoubleXp');
const BotState = require('../database/BotStateSchema');
const botStatuses = require('../utils/botStatuses');
const { randomWatchingStatus } = require('../utils/watchingStatuses');
const logger = require('../utils/logger');

// Import the background synchronization handlers
const { startXpSync } = require('../utils/xpCache');
const { startVoiceXpSync } = require('./voiceStateUpdate');
const { getGuildConfig } = require('../utils/guildConfigCache');
const { getLocalDateString, getLocalDayName, msUntilNextLocalMidnight } = require('../utils/time');

// ---------------------------------------------------------------------------
// Returns today's date as a YYYY-MM-DD string (community timezone) for dedup.
// Must use the SAME timezone as isDoubleXpActive(), or the announce check and
// the dedup key can disagree and produce a duplicate post.
// ---------------------------------------------------------------------------
function getTodayString() {
    return getLocalDateString();
}

// ---------------------------------------------------------------------------
// Builds and sends the Double XP announcement embed with @everyone.
// Saves today's date to BotState so restarts within the same day are silent.
// ---------------------------------------------------------------------------
async function announceDoubleXp(client, guildId) {
    try {
        const guildConfig = await getGuildConfig(guildId) || {};
        const channelId = guildConfig.announcementsChannelId || config.channels.announcements;
        const channel = client.channels.cache.get(channelId);
        if (!channel) return logger.warn(`Announcements channel not found for guild ${guildId}. Check guild settings or config.json.`);

        const dayName = getLocalDayName();

        // Prefer pinging the opt-in @DoubleXP role so we don't @everyone twice a
        // week. Falls back to @everyone only if no role is configured.
        const roleId = guildConfig.doubleXpRoleId;
        const optInLine = roleId
            ? `\n\n🔔 Not pinged? Opt in with \`/roles menu\` to grab the Double XP role.`
            : '';

        const guild = client.guilds.cache.get(guildId);
        const embed = brandedEmbed({ color: COLORS.hype, footer: 'Glitch Haven, Runs every Friday & Saturday' })
            .setAuthor({ name: 'Double XP Weekend' })
            .setTitle('🔥 Double XP is LIVE!')
            .setDescription(
                `It's **${dayName}**, every message and minute in voice counts **double** all weekend long.` +
                optInLine
            )
            .addFields(
                { name: '💬 Text', value: '`2× XP` / message', inline: true },
                { name: '🎙️ Voice', value: '`2× XP` / minute', inline: true },
                { name: '📈 Progress', value: 'Track it with `/rank`', inline: true },
            );
        const icon = guild?.iconURL({ size: 128 });
        if (icon) embed.setThumbnail(icon);

        const content = roleId ? `<@&${roleId}>` : '@everyone';
        const allowedMentions = roleId ? { roles: [roleId] } : { parse: ['everyone'] };
        await channel.send({ content, embeds: [embed], allowedMentions });
        logger.info(`Double XP announcement sent for ${dayName}.`);

        // Persist today's date so we don't re-announce on restart
        await BotState.findOneAndUpdate(
            { guildId },
            { lastDoubleXpDate: getTodayString() },
            { upsert: true }
        );
    } catch (err) {
        logger.error('Failed to send double XP announcement:', err);
    }
}

// ---------------------------------------------------------------------------
// Checks if we already announced today, if not, announces.
// ---------------------------------------------------------------------------
async function checkAndAnnounceDoubleXp(client, guildId) {
    // Only announce on the first day of the weekend (Friday), not every double
    // XP day, so it posts once per weekend. The XP bonus still applies Fri+Sat.
    if (!isDoubleXpStartDay()) return;

    const state = await BotState.findOne({ guildId });
    const alreadyAnnouncedToday = state?.lastDoubleXpDate === getTodayString();

    if (alreadyAnnouncedToday) {
        logger.info('Double XP already announced today, skipping.');
        return;
    }

    await announceDoubleXp(client, guildId);
}

// ---------------------------------------------------------------------------
// Schedules a check at the next midnight, then reschedules itself every 24h.
// ---------------------------------------------------------------------------
function scheduleMidnightCheck(client) {
    // Fire at the next midnight in the community timezone, not the host's.
    const msUntilMidnight = msUntilNextLocalMidnight();

    setTimeout(async () => {
        await Promise.all(
            Array.from(client.guilds.cache.values()).map(guild => checkAndAnnounceDoubleXp(client, guild.id))
        );
        scheduleMidnightCheck(client);
    }, msUntilMidnight);

    const hrs = Math.floor(msUntilMidnight / 1000 / 60 / 60);
    const mins = Math.floor((msUntilMidnight / 1000 / 60) % 60);
    logger.info(`Next double XP check scheduled in ${hrs}h ${mins}m (midnight).`);
}

// ---------------------------------------------------------------------------
// Recover and initialize sessions for users already in voice channels on start
// ---------------------------------------------------------------------------
function recoverActiveVoiceSessions(client) {
    const { voiceSessions, isMemberActive } = require('./voiceStateUpdate');
    const { voiceTickMinutes } = config.xpSettings;
    const recoveredCount = { value: 0 };

    for (const guild of client.guilds.cache.values()) {
        for (const channel of guild.channels.cache.values()) {
            if (!channel.isVoiceBased()) continue;

            for (const member of channel.members.values()) {
                if (!isMemberActive(member)) continue;

                const sessionKey = `${member.id}-${guild.id}`;
                const joinTime = Date.now() - Math.max(0, (voiceTickMinutes * 60 * 1000) - 15 * 1000);
                voiceSessions.set(sessionKey, joinTime);
                recoveredCount.value += 1;
            }
        }
    }

    if (recoveredCount.value > 0) {
        logger.info(`Recovered and initialized ${recoveredCount.value} active voice sessions from startup check.`);
    }
}

// ---------------------------------------------------------------------------
// Ready event
// ---------------------------------------------------------------------------
module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        logger.info(`Logged in as ${client.user.tag}`);
        logger.info(`Serving ${client.guilds.cache.size} guild(s)`);

        // Capture + log the commit this process booted on (primes /version).
        const v = require('../utils/version').getVersionInfo();
        logger.info(`Build: ${v.commit ? `commit ${v.commit} (${v.branch})` : `v${v.version}`}${v.subject ? `, ${v.subject}` : ''}`);

        // Forward error logs to a Discord channel if ERROR_CHANNEL_ID is set.
        require('../utils/errorAlerts').attachErrorAlerts(client);

        // Keep slash commands in sync automatically (guild commands are instant),
        // so a code deploy never leaves stale commands. Runs once (shard 0).
        if (process.env.AUTO_DEPLOY !== 'false' && (!client.shard || client.shard.ids.includes(0))) {
            await require('../utils/registerCommands').registerGuildCommands(client);
        }

        // Warm the member cache so name-based statuses have people to call out
        // right away instead of waiting for members to chat. Skip very large
        // guilds so a full fetch can't stall startup, and refresh on a slow
        // timer so the pool stays current as members join or leave.
        const MEMBER_FETCH_LIMIT = 2000;
        const warmMemberCache = () => {
            for (const guild of client.guilds.cache.values()) {
                if (guild.memberCount > MEMBER_FETCH_LIMIT) continue;
                guild.members.fetch().catch(() => { /* missing intent, skip */ });
            }
        };
        warmMemberCache();
        setInterval(warmMemberCache, 6 * 60 * 60 * 1000);

        // Set initial random status and rotate every 10 minutes
        const updateStatus = () => {
            // Roughly 40% of the time, call out a random member by name.
            const status = (Math.random() < 0.4 && randomWatchingStatus(client))
                || botStatuses[Math.floor(Math.random() * botStatuses.length)];
            client.user.setPresence({
                activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: status }],
                status: 'online',
            });
        };
        updateStatus();
        setInterval(updateStatus, 10 * 60 * 1000);

        // 1. Initialize High-Performance Caching & Voice Real-time Loops
        startXpSync(client);
        startVoiceXpSync(client);
        logger.info('[XP_SYSTEM] Dynamic background synchronization processors actively running.');

        // 2. Recover active voice sessions across all channels
        recoverActiveVoiceSessions(client);

        // 3. Run stale LFG cleanup once on startup
        const { cleanUpStaleLfgSessions } = require('../utils/lfgManager');
        cleanUpStaleLfgSessions(client).catch(err => logger.error('Stale LFG cleanup failed:', err));

        // Schedule periodic stale LFG cleanup every 30 minutes (1,800,000 ms)
        setInterval(() => {
            cleanUpStaleLfgSessions(client).catch(err => logger.error('Stale LFG cleanup failed:', err));
        }, 30 * 60 * 1000);

        // 3b. Game-night event scheduler, pings rosters at start time (1-min ticks)
        const { startEventScheduler } = require('../utils/eventManager');
        startEventScheduler(client);

        // 3c. Giveaway scheduler, draws winners when giveaways end (30s ticks)
        const { startGiveawayScheduler } = require('../utils/giveawayManager');
        startGiveawayScheduler(client);

        // 3d. Twitch go-live poller (no-op if Twitch creds aren't configured)
        const { startStreamerScheduler } = require('../utils/streamerManager');
        startStreamerScheduler(client);

        // 3e. Reminder scheduler, fires due /remind reminders (30s ticks)
        const { startReminderScheduler } = require('../utils/reminderManager');
        startReminderScheduler(client);

        if (client.guilds.cache.size === 0) {
            return logger.warn('No guilds found in cache.');
        }

        for (const guild of client.guilds.cache.values()) {
            await checkAndAnnounceDoubleXp(client, guild.id);
        }

        scheduleMidnightCheck(client);
    },
};