/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { removeForDeletedOrigins } = require('../utils/starboardManager');
const logger = require('../utils/logger');

// Bulk deletes (a /purge, or a mod clearing a channel) fire this instead of one
// messageDelete per message, so the starboard teardown has to be hooked here
// too or purged messages keep their highlight copies.
module.exports = {
    name: 'messageDeleteBulk',
    async execute(messages, channel) {
        try {
            // Prefer the channel's guild: the messages may all be partials from
            // a purge of older posts, and a partial can resolve guild as null.
            const guild = channel?.guild ?? messages.first()?.guild;
            if (!guild) return;

            await removeForDeletedOrigins(guild, [...messages.keys()]);
        } catch (err) {
            logger.error('messageDeleteBulk cleanup failed:', err);
        }
    },
};
