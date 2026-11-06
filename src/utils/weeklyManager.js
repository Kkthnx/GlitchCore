/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const User = require('../database/UserSchema');
const BotState = require('../database/BotStateSchema');
const { getGuildConfig } = require('./guildConfigCache');
const { getLocalWeekStart } = require('./time');
const { startPolling } = require('./scheduler');
const { brandedEmbed, COLORS } = require('./brand');
const channels = require('./channels');
const logger = require('./logger');
const config = require('../../config.json');

const PODIUM_SIZE = 5;
const MEDALS = ['🥇', '🥈', '🥉'];
const CHECK_INTERVAL_MS = (config.tuning && config.tuning.weeklyCheckMs) || 60 * 60 * 1000;

/**
 * Podium lines for the weekly announcement.
 * @param {{ userId: string, weeklyXp: number }[]} top ordered best first
 */
function podiumLines(top) {
    return top.map((entry, i) => {
        const place = MEDALS[i] || `**#${i + 1}**`;
        return `${place} <@${entry.userId}>, ${entry.weeklyXp.toLocaleString()} XP`;
    });
}

function buildWeeklyEmbed(top) {
    return brandedEmbed({ color: COLORS.hype, footer: 'Glitch Haven, Weekly MVP' })
        .setAuthor({ name: 'SYSTEM.WEEKLY_RESET' })
        .setTitle('> THIS WEEK\'S TOP PLAYERS')
        .setDescription(`${podiumLines(top).join('\n')}\n\nA new week just started. Everyone is back at zero.`);
}

/**
 * Claims this week's rollover for a guild. Returns the previous BotState when
 * this caller won the claim, null when the week was already handled. The write
 * is the check, so two shards or a restart cannot both announce.
 */
async function claimRollover(guildId, weekKey) {
    try {
        const previous = await BotState.findOneAndUpdate(
            { guildId, lastWeeklyKey: { $ne: weekKey } },
            { $set: { lastWeeklyKey: weekKey } },
            { upsert: true, returnDocument: 'before' },
        ).lean();
        return previous || {};
    } catch (err) {
        // Duplicate key means a document exists and already carries this week.
        if (err && err.code === 11000) return null;
        throw err;
    }
}

async function passMvpRole(guild, roleId, previousWinnerId, winnerId) {
    const role = guild.roles.cache.get(roleId);
    if (!role) return;

    if (previousWinnerId && previousWinnerId !== winnerId) {
        const old = await guild.members.fetch(previousWinnerId).catch(() => null);
        if (old) await old.roles.remove(role, 'Weekly MVP passed on').catch(err => logger.warn(`[WEEKLY] Could not remove MVP role: ${err.message}`));
    }
    const winner = await guild.members.fetch(winnerId).catch(() => null);
    if (winner && !winner.roles.cache.has(role.id)) {
        await winner.roles.add(role, 'Weekly MVP').catch(err => logger.warn(`[WEEKLY] Could not give MVP role: ${err.message}`));
    }
}

/**
 * Closes out the week for one guild: announce the podium, pass the MVP role,
 * zero the counters. The first run after install only records the week, since
 * the counters then hold a partial week.
 */
async function runWeeklyRollover(client, guild, now = new Date()) {
    const weekKey = getLocalWeekStart(now);
    const previous = await claimRollover(guild.id, weekKey);
    if (!previous) return false;

    const hadPriorWeek = Boolean(previous.lastWeeklyKey);
    if (!hadPriorWeek) return false;

    const top = await User.find({ guildId: guild.id, weeklyXp: { $gt: 0 } }, { userId: 1, weeklyXp: 1 })
        .sort({ weeklyXp: -1 })
        .limit(PODIUM_SIZE)
        .lean();

    await User.updateMany({ guildId: guild.id, weeklyXp: { $ne: 0 } }, { $set: { weeklyXp: 0 } });
    if (!top.length) {
        await BotState.updateOne({ guildId: guild.id }, { $set: { lastWeeklyWinnerId: null } });
        return true;
    }

    const cfg = await getGuildConfig(guild.id) || {};
    const channel = client.channels.cache.get(cfg.announcementsChannelId || channels.announcements);
    if (channel) {
        await channel.send({ embeds: [buildWeeklyEmbed(top)], allowedMentions: { parse: [] } })
            .catch(err => logger.warn(`[WEEKLY] Could not post the podium in ${guild.id}: ${err.message}`));
    }

    if (cfg.weeklyMvpRoleId) {
        await passMvpRole(guild, cfg.weeklyMvpRoleId, previous.lastWeeklyWinnerId, top[0].userId);
    }
    await BotState.updateOne({ guildId: guild.id }, { $set: { lastWeeklyWinnerId: top[0].userId } });

    logger.info(`[WEEKLY] Closed the week for ${guild.id}, ${top.length} on the podium.`);
    return true;
}

async function checkWeeklyRollover(client) {
    for (const guild of client.guilds.cache.values()) {
        await runWeeklyRollover(client, guild).catch(err => logger.error(`[WEEKLY] Rollover failed for ${guild.id}:`, err));
    }
}

function startWeeklyScheduler(client) {
    startPolling({
        name: 'WEEKLY',
        task: () => checkWeeklyRollover(client),
        intervalMs: CHECK_INTERVAL_MS,
        immediate: true,
        delayMs: 20_000,
    });
}

module.exports = { podiumLines, buildWeeklyEmbed, claimRollover, runWeeklyRollover, startWeeklyScheduler };
