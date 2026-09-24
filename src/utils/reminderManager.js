/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const Reminder = require('../database/ReminderSchema');
const { startPolling } = require('./scheduler');
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
        // Claim by deleting, before sending. Delivering and then deleting means
        // a delete that fails leaves the row due, so the next tick reminds the
        // member a second time. Only one caller gets the document back from a
        // delete, so this is at-most-once even if two ticks race.
        //
        // The row is dropped either way (that was already true when the send
        // failed), so this trades a possible duplicate for none.
        const claimed = await Reminder.findOneAndDelete({ _id: r._id }).lean().catch(() => null);
        if (!claimed) continue; // already delivered elsewhere

        const content = `⏰ <@${claimed.userId}>, you asked me to remind you: **${claimed.message}**`;
        const channel = client.channels.cache.get(claimed.channelId);
        try {
            if (channel) {
                await channel.send({ content, allowedMentions: { users: [claimed.userId] } });
            } else {
                const user = await client.users.fetch(claimed.userId).catch(() => null);
                if (user) await user.send(content).catch(() => {});
            }
        } catch (err) {
            logger.warn(`[REMIND] Failed to deliver reminder ${claimed._id}: ${err.message}`);
        }
    }
}

function startReminderScheduler(client) {
    startPolling({
        name: 'REMIND',
        task: () => processDueReminders(client),
        intervalMs: 30 * 1000,
    });
}

module.exports = { processDueReminders, startReminderScheduler };
