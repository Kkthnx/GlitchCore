/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const User = require('../database/UserSchema');
const LfgSession = require('../database/LfgSchema');
const BotState = require('../database/BotStateSchema');
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

        try {
            const [users, sessions, state] = await Promise.all([
                User.deleteMany({ guildId: guild.id }),
                LfgSession.deleteMany({ guildId: guild.id }),
                BotState.deleteMany({ guildId: guild.id }),
            ]);

            logger.info(
                `[GUILD_DELETE] Purged data for guild ${guild.id}: ` +
                `${users.deletedCount} users, ${sessions.deletedCount} LFG sessions, ${state.deletedCount} state docs.`
            );
        } catch (err) {
            logger.error(`[GUILD_DELETE] Failed to purge data for guild ${guild.id}:`, err);
        }
    },
};
