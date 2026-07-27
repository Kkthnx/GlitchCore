/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Channel IDs come from the environment so they never live in the committed
// repo. The config.json values are kept only as a legacy fallback (normally
// blank) so an existing local setup doesn't break mid-migration.
const config = require('../../config.json');

const c = config.channels || {};

module.exports = {
    welcome: process.env.WELCOME_CHANNEL_ID || c.welcome || '',
    leave: process.env.LEAVE_CHANNEL_ID || c.leave || '',
    announcements: process.env.ANNOUNCEMENTS_CHANNEL_ID || c.announcements || '',
    lfg: process.env.LFG_CHANNEL_ID || c.lfg || '',
    levelUpLog: process.env.LEVEL_UP_LOG_CHANNEL_ID || c.levelUpLog || '',
    modLog: process.env.MOD_LOG_CHANNEL_ID || c.modLog || '',
    birthday: process.env.BIRTHDAY_CHANNEL_ID || c.birthday || '',
};
