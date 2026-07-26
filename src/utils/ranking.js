/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const User = require('../database/UserSchema');

/**
 * A member's 1-based server rank: how many members sit strictly ahead (higher
 * level, or same level with more XP), plus one. Counts server-side so we never
 * load every user document into memory.
 */
async function getUserRank(guildId, level, xp) {
    const ahead = await User.countDocuments({
        guildId,
        $or: [
            { level: { $gt: level } },
            { level, xp: { $gt: xp } },
        ],
    });
    return ahead + 1;
}

module.exports = { getUserRank };
