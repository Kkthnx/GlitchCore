const User = require('../database/UserSchema');
const Infraction = require('../database/InfractionSchema');
const Event = require('../database/EventSchema');
const LfgSession = require('../database/LfgSchema');
const { brandedEmbed, COLORS } = require('./brand');
const logger = require('./logger');

/**
 * Gathers everything GlitchCore stores about a user in one guild, for a
 * self-service data export (GDPR/PRIVACY.md honoring).
 */
async function exportUserData(guildId, userId) {
    const [profile, infractions, events, lfg] = await Promise.all([
        User.findOne({ guildId, userId }).lean(),
        Infraction.find({ guildId, userId }).lean(),
        Event.find({ guildId, $or: [{ 'going.userId': userId }, { 'maybe.userId': userId }, { 'waitlist.userId': userId }] }, { title: 1, game: 1, startsAt: 1 }).lean(),
        LfgSession.find({ guildId, 'roster.userId': userId }, { game: 1, activity: 1 }).lean(),
    ]);

    return {
        exportedAt: new Date().toISOString(),
        guildId,
        userId,
        profile: profile
            ? { xp: profile.xp, level: profile.level, totalMessages: profile.totalMessages, cardStyle: profile.cardStyle }
            : null,
        infractions: infractions.map(i => ({ type: i.type, reason: i.reason, at: i.createdAt })),
        eventMemberships: events.map(e => ({ title: e.title, game: e.game, startsAt: e.startsAt })),
        lfgMemberships: lfg.map(l => ({ game: l.game, activity: l.activity })),
    };
}

/**
 * Erases the user's personal profile data and removes them from event/LFG
 * rosters. Moderation infractions are retained as server records (legitimate
 * interest) and reported back so the request is transparent.
 */
async function deleteUserData(guildId, userId) {
    const [profileRes, eventRes, lfgRes, infractionCount] = await Promise.all([
        User.deleteOne({ guildId, userId }),
        Event.updateMany(
            { guildId },
            { $pull: { going: { userId }, maybe: { userId }, waitlist: { userId } } },
        ),
        LfgSession.updateMany({ guildId }, { $pull: { roster: { userId } } }),
        Infraction.countDocuments({ guildId, userId }),
    ]);

    logger.info(`[PRIVACY] Erased profile for ${userId} in ${guildId} (kept ${infractionCount} moderation record(s)).`);
    return {
        profileDeleted: profileRes.deletedCount > 0,
        eventsUpdated: eventRes.modifiedCount,
        lfgUpdated: lfgRes.modifiedCount,
        infractionsKept: infractionCount,
    };
}

const CONFIRM_ID = 'forgetme:confirm';

async function handleForgetConfirm(interaction) {
    const result = await deleteUserData(interaction.guild.id, interaction.user.id);
    const embed = brandedEmbed({ color: COLORS.success, footer: 'Glitch Haven • Privacy' })
        .setTitle('✅ Your data was erased')
        .setDescription(
            `• Profile/XP: **${result.profileDeleted ? 'deleted' : 'nothing stored'}**\n` +
            `• Removed from **${result.eventsUpdated}** event roster(s) and **${result.lfgUpdated}** LFG roster(s)\n` +
            (result.infractionsKept
                ? `• **${result.infractionsKept}** moderation record(s) were retained as server records.`
                : '• No moderation records were on file.')
        );
    // Disable the button on the original ephemeral message.
    await interaction.update({ embeds: [embed], components: [] });
}

module.exports = { exportUserData, deleteUserData, handleForgetConfirm, CONFIRM_ID };
