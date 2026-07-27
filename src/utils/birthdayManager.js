/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const Birthday = require('../database/BirthdaySchema');
const BotState = require('../database/BotStateSchema');
const channels = require('./channels');
const { brandedEmbed, COLORS } = require('./brand');
const { getLocalDateString, msUntilNextLocalMidnight } = require('./time');
const logger = require('./logger');

// Month/day for the community's local "today", derived from the timezone-aware
// date string so the host timezone can't shift the birthday to the wrong day.
function localMonthDay(date = new Date()) {
    const [, month, day] = getLocalDateString(date).split('-').map(Number);
    return { month, day };
}

// Announces today's birthdays for one guild, guarding against a double-post on
// the same local day (e.g. after a restart) via BotState.lastBirthdayDate.
async function announceForGuild(client, guild) {
    const today = getLocalDateString();
    const state = await BotState.findOne({ guildId: guild.id });
    if (state?.lastBirthdayDate === today) return;

    const { month, day } = localMonthDay();
    const birthdays = await Birthday.find({ guildId: guild.id, month, day });

    // Mark the day handled even when nobody has a birthday, so we don't re-query
    // all day on every tick/restart.
    await BotState.findOneAndUpdate(
        { guildId: guild.id },
        { lastBirthdayDate: today },
        { upsert: true },
    );

    if (!birthdays.length) return;

    const channelId = channels.birthday || channels.announcements;
    const channel = channelId && guild.channels.cache.get(channelId);
    if (!channel) return;

    const mentions = birthdays.map(b => `<@${b.userId}>`).join(' ');
    const embed = brandedEmbed({ color: COLORS.hype, footer: 'Glitch Haven, Birthdays' })
        .setTitle('🎂 Happy Birthday!')
        .setDescription(`Everyone wish a happy birthday to ${mentions}. Have an awesome one.`);

    await channel.send({ content: mentions, embeds: [embed], allowedMentions: { users: birthdays.map(b => b.userId) } }).catch(() => {});
    logger.info(`[BIRTHDAY] Announced ${birthdays.length} birthday(s) in ${guild.id}.`);
}

async function runBirthdayCheck(client) {
    // Only this shard's guilds, so shards never double-announce.
    for (const guild of client.guilds.cache.values()) {
        await announceForGuild(client, guild).catch(err => logger.error('[BIRTHDAY] Guild check failed:', err));
    }
}

// Runs a check now (covers a mid-day restart), then re-arms at each local
// midnight so the shoutout lands at the start of the community's day.
function startBirthdayScheduler(client) {
    runBirthdayCheck(client).catch(err => logger.error('[BIRTHDAY] Initial check failed:', err));

    const arm = () => {
        setTimeout(() => {
            runBirthdayCheck(client).catch(err => logger.error('[BIRTHDAY] Midnight check failed:', err));
            arm();
        }, msUntilNextLocalMidnight() + 5000); // small cushion past midnight
    };
    arm();
}

module.exports = { runBirthdayCheck, startBirthdayScheduler, localMonthDay };
