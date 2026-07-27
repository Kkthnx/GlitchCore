/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const User = require('../database/UserSchema');
const LfgSession = require('../database/LfgSchema');
const BotState = require('../database/BotStateSchema');
const GuildConfig = require('../database/GuildConfigSchema');
const Infraction = require('../database/InfractionSchema');
const Reminder = require('../database/ReminderSchema');
const Giveaway = require('../database/GiveawaySchema');
const EventModel = require('../database/EventSchema');
const Streamer = require('../database/StreamerSchema');
const Suggestion = require('../database/SuggestionSchema');
const Starboard = require('../database/StarboardSchema');
const TempBan = require('../database/TempBanSchema');
const Tag = require('../database/TagSchema');
const ReactionRole = require('../database/ReactionRoleSchema');
const Birthday = require('../database/BirthdaySchema');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// When the bot is removed from a guild, purge all data we stored for it.
// Required for Discord Developer ToS / GDPR data-retention compliance:
// we must not retain user data beyond a legitimate business purpose.
// ---------------------------------------------------------------------------
module.exports = {
    name: 'guildDelete',
    async execute(guild) {
        // `guild` can be partial/unavailable during an outage. Skip if we
        // can't confirm an actual removal (id present but unavailable flag set).
        if (guild.available === false) {
            logger.warn(`[GUILD_DELETE] Guild ${guild.id} is unavailable (outage), skipping purge.`);
            return;
        }

        const filter = { guildId: guild.id };
        const models = {
            users: User, lfgSessions: LfgSession, state: BotState, config: GuildConfig,
            infractions: Infraction, reminders: Reminder, giveaways: Giveaway, events: EventModel,
            streamers: Streamer, suggestions: Suggestion, starboard: Starboard, tempBans: TempBan,
            tags: Tag, reactionRoles: ReactionRole, birthdays: Birthday,
        };

        try {
            const results = await Promise.all(Object.values(models).map(m => m.deleteMany(filter)));
            const total = results.reduce((sum, r) => sum + (r.deletedCount || 0), 0);
            logger.info(`[GUILD_DELETE] Purged ${total} documents across ${results.length} collections for guild ${guild.id}.`);
        } catch (err) {
            logger.error(`[GUILD_DELETE] Failed to purge data for guild ${guild.id}:`, err);
        }
    },
};
