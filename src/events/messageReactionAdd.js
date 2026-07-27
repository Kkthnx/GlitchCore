/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { syncStarboard } = require('../utils/starboardManager');
const { handleReactionRole } = require('../utils/reactionRoleManager');

module.exports = {
    name: 'messageReactionAdd',
    async execute(reaction, user) {
        if (user.bot) return;
        await Promise.all([
            syncStarboard(reaction),
            handleReactionRole(reaction, user, true),
        ]);
    },
};
