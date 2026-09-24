/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const User = require('../database/UserSchema');
const Infraction = require('../database/InfractionSchema');
const Event = require('../database/EventSchema');
const LfgSession = require('../database/LfgSchema');
const Birthday = require('../database/BirthdaySchema');
const Reminder = require('../database/ReminderSchema');
const Giveaway = require('../database/GiveawaySchema');
const Streamer = require('../database/StreamerSchema');
const Suggestion = require('../database/SuggestionSchema');
const { brandedEmbed, COLORS } = require('./brand');
const logger = require('./logger');

/**
 * Gathers everything GlitchCore stores about a user in one guild, for a
 * self-service data export (GDPR/PRIVACY.md honoring).
 *
 * This has to cover every collection that keys on a user, or the export quietly
 * understates what's held. Anything added here needs a matching row in
 * PRIVACY.md and, unless there's a reason to keep it, in deleteUserData below.
 */
async function exportUserData(guildId, userId) {
    const [profile, infractions, events, lfg, birthday, reminders, giveaways, streamers, suggestions] = await Promise.all([
        User.findOne({ guildId, userId }).lean(),
        Infraction.find({ guildId, userId }).lean(),
        Event.find({ guildId, $or: [{ 'going.userId': userId }, { 'maybe.userId': userId }, { 'waitlist.userId': userId }] }, { title: 1, game: 1, startsAt: 1 }).lean(),
        LfgSession.find({ guildId, $or: [{ 'roster.userId': userId }, { 'waitlist.userId': userId }] }, { game: 1, activity: 1 }).lean(),
        Birthday.findOne({ guildId, userId }, { month: 1, day: 1 }).lean(),
        Reminder.find({ guildId, userId }, { message: 1, remindAt: 1 }).lean(),
        Giveaway.find({ guildId, entries: userId }, { prize: 1, endsAt: 1, winners: 1 }).lean(),
        Streamer.find({ guildId, discordUserId: userId }, { twitchLogin: 1, twitchDisplayName: 1 }).lean(),
        Suggestion.find({ guildId, authorId: userId }, { text: 1, status: 1, createdAt: 1 }).lean(),
    ]);

    return {
        exportedAt: new Date().toISOString(),
        guildId,
        userId,
        profile: profile
            ? {
                xp: profile.xp,
                level: profile.level,
                totalMessages: profile.totalMessages,
                cardStyle: profile.cardStyle,
                dailyStreak: profile.dailyStreak,
                lastDailyDate: profile.lastDailyDate,
            }
            : null,
        birthday: birthday ? { month: birthday.month, day: birthday.day } : null,
        infractions: infractions.map(i => ({ type: i.type, reason: i.reason, at: i.createdAt })),
        eventMemberships: events.map(e => ({ title: e.title, game: e.game, startsAt: e.startsAt })),
        lfgMemberships: lfg.map(l => ({ game: l.game, activity: l.activity })),
        reminders: reminders.map(r => ({ message: r.message, remindAt: r.remindAt })),
        giveawayEntries: giveaways.map(g => ({ prize: g.prize, endsAt: g.endsAt, won: (g.winners || []).includes(userId) })),
        twitchLinks: streamers.map(s => ({ twitchLogin: s.twitchLogin, displayName: s.twitchDisplayName })),
        suggestions: suggestions.map(s => ({ text: s.text, status: s.status, at: s.createdAt })),
    };
}

/**
 * Erases the user's personal data and removes them from rosters and entry lists.
 *
 * Two categories are deliberately kept, and both are reported back so the
 * request stays transparent:
 *
 *   - Moderation infractions, as server records (legitimate interest). Erasing
 *     them on request would let anyone clear their own history.
 *   - Suggestions, which are content they published to the server, the same way
 *     a message is. A manager can remove an individual post.
 */
async function deleteUserData(guildId, userId) {
    const [
        profileRes, eventRes, lfgRes, birthdayRes, reminderRes, giveawayRes, streamerRes,
        infractionCount, suggestionCount,
    ] = await Promise.all([
        User.deleteOne({ guildId, userId }),
        Event.updateMany(
            { guildId },
            { $pull: { going: { userId }, maybe: { userId }, waitlist: { userId } } },
        ),
        // The waitlist was previously missed here, so somebody queued behind a
        // full lobby stayed on it after asking to be erased.
        LfgSession.updateMany(
            { guildId },
            { $pull: { roster: { userId }, waitlist: { userId } } },
        ),
        Birthday.deleteOne({ guildId, userId }),
        Reminder.deleteMany({ guildId, userId }),
        Giveaway.updateMany({ guildId, entries: userId }, { $pull: { entries: userId } }),
        // Unlink their Discord account from any tracked Twitch channel, without
        // removing the channel itself, which is the server's config not theirs.
        Streamer.updateMany({ guildId, discordUserId: userId }, { $set: { discordUserId: null } }),
        Infraction.countDocuments({ guildId, userId }),
        Suggestion.countDocuments({ guildId, authorId: userId }),
    ]);

    logger.info(
        `[PRIVACY] Erased data for ${userId} in ${guildId} ` +
        `(kept ${infractionCount} moderation record(s), ${suggestionCount} published suggestion(s)).`,
    );

    return {
        profileDeleted: profileRes.deletedCount > 0,
        birthdayDeleted: birthdayRes.deletedCount > 0,
        remindersDeleted: reminderRes.deletedCount,
        eventsUpdated: eventRes.modifiedCount,
        lfgUpdated: lfgRes.modifiedCount,
        giveawaysUpdated: giveawayRes.modifiedCount,
        twitchUnlinked: streamerRes.modifiedCount,
        infractionsKept: infractionCount,
        suggestionsKept: suggestionCount,
    };
}

const CONFIRM_ID = 'forgetme:confirm';

async function handleForgetConfirm(interaction) {
    const result = await deleteUserData(interaction.guild.id, interaction.user.id);

    const lines = [
        `Profile, XP and level: **${result.profileDeleted ? 'deleted' : 'nothing stored'}**`,
        `Birthday: **${result.birthdayDeleted ? 'deleted' : 'nothing stored'}**`,
        `Reminders: **${result.remindersDeleted}** deleted`,
        `Removed from **${result.eventsUpdated}** event roster(s) and **${result.lfgUpdated}** LFG roster(s)`,
    ];
    if (result.giveawaysUpdated) lines.push(`Withdrawn from **${result.giveawaysUpdated}** giveaway(s)`);
    if (result.twitchUnlinked) lines.push(`Unlinked **${result.twitchUnlinked}** Twitch channel(s) from your account`);
    if (result.infractionsKept) lines.push(`**${result.infractionsKept}** moderation record(s) were retained as server records`);
    if (result.suggestionsKept) lines.push(`**${result.suggestionsKept}** suggestion(s) you posted were left up, ask a manager to remove one`);
    if (!result.infractionsKept && !result.suggestionsKept) lines.push('Nothing was retained.');

    const embed = brandedEmbed({ color: COLORS.success, footer: 'Glitch Haven, Privacy' })
        .setTitle('✅ Your data was erased')
        .setDescription(lines.map(l => ` ${l}`).join('\n'));

    // Disable the button on the original ephemeral message.
    await interaction.update({ embeds: [embed], components: [] });
}

module.exports = { exportUserData, deleteUserData, handleForgetConfirm, CONFIRM_ID };
