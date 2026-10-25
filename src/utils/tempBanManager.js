/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const TempBan = require('../database/TempBanSchema');
const { startPolling } = require('./scheduler');
const logger = require('./logger');
const config = require('../../config.json');

// Records (or extends) a timed ban so the scheduler can lift it later.
async function scheduleTempBan(guildId, userId, unbanAt, reason) {
    await TempBan.findOneAndUpdate(
        { guildId, userId },
        { unbanAt, reason },
        { upsert: true, returnDocument: 'after' },
    );
}

// Clears any pending timed ban for a user (e.g. after a manual unban).
async function clearTempBan(guildId, userId) {
    await TempBan.deleteOne({ guildId, userId }).catch(err => {
        // A leftover row would lift a ban that was meant to stand, so a failure
        // here is worth a line in the log even though callers carry on.
        logger.error(`[TEMPBAN] Could not clear the timer for ${userId} in ${guildId}:`, err);
    });
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
        if (!guild) continue;

        try {
            await guild.members.unban(b.userId, 'Temp-ban expired');
            logger.info(`[TEMPBAN] Lifted ban on ${b.userId} in ${b.guildId}.`);
            await TempBan.deleteOne({ _id: b._id }).catch(() => {});
        } catch (err) {
            // 10026 (Unknown Ban) means someone already unbanned them by hand,
            // so the record served its purpose. Anything else (missing
            // permission, network blip) keeps the row so the next tick retries:
            // dropping it would quietly turn the temp-ban permanent.
            if (err.code === 10026) {
                logger.info(`[TEMPBAN] ${b.userId} already unbanned in ${b.guildId}, clearing record.`);
                await TempBan.deleteOne({ _id: b._id }).catch(() => {});
            } else {
                logger.warn(`[TEMPBAN] Could not unban ${b.userId} (code ${err.code}), will retry: ${err.message}`);
            }
        }
    }
}

function startTempBanScheduler(client) {
    startPolling({
        name: 'TEMPBAN',
        task: () => processDueUnbans(client),
        intervalMs: (config.tuning && config.tuning.tempBanCheckMs) || 60 * 1000,
    });
}

module.exports = { scheduleTempBan, clearTempBan, processDueUnbans, startTempBanScheduler };
