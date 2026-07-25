/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const Reminder = require('../database/ReminderSchema');
const logger = require('./logger');

async function processDueReminders(client) {
    // Only this shard's guilds, so multiple shards never fire the same reminder.
    const guildIds = [...client.guilds.cache.keys()];
    if (!guildIds.length) return;

    let due;
    try {
        due = await Reminder.find({ guildId: { $in: guildIds }, remindAt: { $lte: new Date() } }).limit(50);
    } catch (err) {
        return logger.error('[REMIND] Query failed:', err);
    }

    for (const r of due) {
        const content = `⏰ <@${r.userId}>, you asked me to remind you: **${r.message}**`;
        const channel = client.channels.cache.get(r.channelId);
        try {
            if (channel) {
                await channel.send({ content, allowedMentions: { users: [r.userId] } });
            } else {
                const user = await client.users.fetch(r.userId).catch(() => null);
                if (user) await user.send(content).catch(() => {});
            }
        } catch (err) {
            logger.warn(`[REMIND] Failed to deliver reminder ${r._id}: ${err.message}`);
        }
        await Reminder.deleteOne({ _id: r._id }).catch(() => {});
    }
}

function startReminderScheduler(client) {
    setInterval(() => processDueReminders(client).catch(err => logger.error('[REMIND] Tick failed:', err)), 30 * 1000);
}

module.exports = { processDueReminders, startReminderScheduler };
