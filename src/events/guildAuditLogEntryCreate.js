/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { AuditLogEvent } = require('discord.js');
const { getAuditChannel, postAudit } = require('../utils/auditLog');
const { clearTempBan } = require('../utils/tempBanManager');
const { describeEntry } = require('../utils/auditEntries');

// Discord hands us every audit log entry the moment it is written, with the
// moderator, target, reason and exact changes already attached. That means no
// polling, no extra API calls and no race against the log. It only fires when
// the bot has the View Audit Log permission, without it this is simply quiet.
module.exports = {
    name: 'guildAuditLogEntryCreate',
    async execute(entry, guild, client) {
        // The bot's own actions already log themselves (infractions, purges) or
        // are routine housekeeping (level roles, self roles), so repeating them
        // here would only add noise.
        if (entry.executorId && entry.executorId === client.user.id) return;

        // A person changed someone's ban state straight from Discord. Any timed
        // ban the bot was still holding for that user is now out of date, and
        // left alone it would lift a ban a moderator just made permanent.
        if ((entry.action === AuditLogEvent.MemberBanAdd || entry.action === AuditLogEvent.MemberBanRemove) && entry.targetId) {
            await clearTempBan(guild.id, entry.targetId);
        }

        const channel = await getAuditChannel(guild);
        if (!channel) return;

        for (const item of describeEntry(entry)) {
            await postAudit(guild, item, channel);
        }
    },
};
