/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const TempBan = require('../database/TempBanSchema');
const logger = require('./logger');

// Records (or extends) a timed ban so the scheduler can lift it later.
async function scheduleTempBan(guildId, userId, unbanAt, reason) {
    await TempBan.findOneAndUpdate(
        { guildId, userId },
        { unbanAt, reason },
        { upsert: true, new: true },
    );
}

// Clears any pending timed ban for a user (e.g. after a manual unban).
async function clearTempBan(guildId, userId) {
    await TempBan.deleteOne({ guildId, userId }).catch(() => {});
}

async function processDueUnbans(client) {
    // Only this shard's guilds, so shards never race to lift the same ban.
    const guildIds = [...client.guilds.cache.keys()];
    if (!guildIds.length) return;

    let due;
    try {
        due = await TempBan.find({ guildId: { $in: guildIds }, unbanAt: { $lte: new Date() } }).limit(50);
    } catch (err) {
        return logger.error('[TEMPBAN] Query failed:', err);
    }

    for (const b of due) {
        const guild = client.guilds.cache.get(b.guildId);
        if (guild) {
            try {
                await guild.members.unban(b.userId, 'Temp-ban expired');
                logger.info(`[TEMPBAN] Lifted ban on ${b.userId} in ${b.guildId}.`);
            } catch (err) {
                // Already unbanned or missing perms, drop the record either way.
                logger.warn(`[TEMPBAN] Could not unban ${b.userId}: ${err.message}`);
            }
        }
        await TempBan.deleteOne({ _id: b._id }).catch(() => {});
    }
}

function startTempBanScheduler(client) {
    setInterval(() => processDueUnbans(client).catch(err => logger.error('[TEMPBAN] Tick failed:', err)), 60 * 1000);
}

module.exports = { scheduleTempBan, clearTempBan, processDueUnbans, startTempBanScheduler };
