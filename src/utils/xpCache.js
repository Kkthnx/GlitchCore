/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const User = require('../database/UserSchema');
const { xpRequiredForLevel } = require('./calculateXp');
const config = require('../../config.json');
const { sendLevelUpEmbed } = require('./levelUpEmbed');
const { applyLevelRewards } = require('./levelRewardManager');
const logger = require('./logger');

const MAX_LEVEL = config.xpSettings.maxLevel || 1000;
const tuning = config.tuning || {};
const MAX_BUFFER_ENTRIES = tuning.xpBufferMaxEntries || 2000;
const FLUSH_INTERVAL_MS = tuning.xpFlushIntervalMs || 60 * 1000;
const FLUSH_BACKOFF_BASE_MS = tuning.xpFlushBackoffBaseMs || 60 * 1000;
const FLUSH_BACKOFF_MAX_MS = tuning.xpFlushMaxBackoffMs || 30 * 60 * 1000;
const xpBuffer = new Map();
let isFlushing = false;
// Set by startXpSync so an overflow flush triggered from queueXp (which has no
// client of its own) can still send level-up embeds and grant reward roles.
let syncClient = null;
// Circuit breaker state. While the database is down, the buffer would otherwise
// grow past its cap and every message would trigger another doomed flush, so a
// failed flush opens the breaker for a backoff window that grows exponentially.
let consecutiveFlushFailures = 0;
let flushBlockedUntil = 0;
let droppedXpEvents = 0;

/**
 * Merges one batch entry back into the live buffer (used when a flush fails).
 */
function requeueEntry(key, data) {
    if (key === undefined || !data) return;
    const current = xpBuffer.get(key);
    if (!current) xpBuffer.set(key, { ...data });
    else {
        current.xp += data.xp;
        current.textMessageCount += data.textMessageCount;
        // Keep a channel to announce in: the newer entry may have none
        // (e.g. voice XP), and losing it would drop the level-up embed.
        current.lastChannelId = current.lastChannelId || data.lastChannelId;
    }
}

/**
 * Indexes of the ops that failed inside a bulkWrite error. The driver reports
 * one entry per failed op in err.writeErrors, each carrying .index into the
 * ops array that was sent (mongodb 7.x, bundled with mongoose 9). Returns null
 * when the error is not a partial batch failure, meaning nothing is known to
 * be saved and the whole batch must be retried.
 */
function failedBulkWriteIndexes(err) {
    const writeErrors = err && err.writeErrors;
    if (!Array.isArray(writeErrors) || writeErrors.length === 0) return null;
    const indexes = new Set();
    for (const writeError of writeErrors) {
        const index = Number.isInteger(writeError.index)
            ? writeError.index
            : writeError.err && writeError.err.index;
        if (Number.isInteger(index)) indexes.add(index);
    }
    return indexes.size > 0 ? indexes : null;
}

/**
 * Queues XP to be written to the database later.
 * @param {string} userId
 * @param {string} guildId
 * @param {number} xpAmount
 * @param {string|null} channelId
 * @param {{ isMessage?: boolean }} [options]
 */
function queueXp(userId, guildId, xpAmount, channelId, options = {}) {
    const { isMessage = true } = options;
    const key = `${userId}::${guildId}`;

    // Bound the buffer while the database is known down. Merging into an
    // existing entry doesn't grow the map, so only brand-new keys are dropped,
    // and the drop is counted so the outage log says what was lost.
    if (!xpBuffer.has(key) && xpBuffer.size >= MAX_BUFFER_ENTRIES && Date.now() < flushBlockedUntil) {
        droppedXpEvents += 1;
        if (droppedXpEvents === 1 || droppedXpEvents % 500 === 0) {
            logger.warn(`[XP_SYNC] Database unreachable, dropped ${droppedXpEvents} XP event(s) to bound memory. They are not retried.`);
        }
        return;
    }

    if (!xpBuffer.has(key)) {
        xpBuffer.set(key, { xp: 0, textMessageCount: 0, lastChannelId: channelId });
    }

    const data = xpBuffer.get(key);
    data.xp += xpAmount;
    if (isMessage) data.textMessageCount += 1;
    data.lastChannelId = channelId || data.lastChannelId;

    if (xpBuffer.size >= MAX_BUFFER_ENTRIES && Date.now() >= flushBlockedUntil) {
        logger.warn('[XP_SYNC] XP buffer reached maximum size, flushing immediately.');
        // Pass the client captured by startXpSync, otherwise an overflow flush
        // would silently level people up with no announcement and no reward role.
        flushXpBuffer(syncClient).catch(err => logger.error('[XP_SYNC] Failed to flush oversized XP buffer:', err));
    }
}

async function flushXpBuffer(client = null) {
    if (isFlushing || xpBuffer.size === 0) return;
    isFlushing = true;

    const batch = new Map(xpBuffer);
    xpBuffer.clear();
    // Parallel to bulkOps below: batchKeys[i] is the buffer key for bulkOps[i],
    // so a partial-failure index from the driver maps back to the right entry.
    const batchKeys = [...batch.keys()];

    const bulkOps = [];
    // userIds grouped by guild. One { guildId, userId: { $in: [...] } } clause
    // per guild reads back the whole batch with a couple of indexed lookups,
    // where one $or clause per user made the planner walk thousands of branches.
    const userIdsByGuild = new Map();

    for (const [key, data] of batch.entries()) {
        const [userId, guildId] = key.split('::');
        const incOps = { xp: data.xp };
        if (data.textMessageCount) incOps.totalMessages = data.textMessageCount;

        bulkOps.push({
            updateOne: {
                filter: { userId, guildId },
                update: { $inc: incOps },
                upsert: true
            }
        });

        const ids = userIdsByGuild.get(guildId);
        if (ids) ids.push(userId);
        else userIdsByGuild.set(guildId, [userId]);
    }

    // Step 1: persist the XP increments. This is the only step whose failure
    // means the XP was NOT saved, so it's the only one we re-queue for.
    // Re-queuing after it succeeds would double-count the XP on the next flush.
    try {
        await User.bulkWrite(bulkOps, { ordered: false });
    } catch (err) {
        consecutiveFlushFailures += 1;
        const backoffMs = Math.min(
            FLUSH_BACKOFF_BASE_MS * Math.pow(2, Math.min(consecutiveFlushFailures - 1, 5)),
            FLUSH_BACKOFF_MAX_MS
        );
        flushBlockedUntil = Date.now() + backoffMs;

        const failedIndexes = failedBulkWriteIndexes(err);
        if (failedIndexes && !err.writeConcernError) {
            // Partial failure with ordered:false: the ops that succeeded are
            // already in the database, so only the failed ones go back in the
            // queue. Re-queueing everything here used to double-count XP for
            // the users whose writes had already landed.
            logger.error(`[XP_SYNC_ERROR] XP batch partially failed (${failedIndexes.size}/${batch.size} op(s)), re-queuing failed entries only:`, err.message || err);
            for (const index of failedIndexes) {
                requeueEntry(batchKeys[index], batch.get(batchKeys[index]));
            }
        } else {
            // Total failure (or an ambiguous write-concern error where nothing
            // is known to be saved): the whole batch goes back.
            logger.error('[XP_SYNC_ERROR] XP increment failed, re-queuing batch:', err);
            for (const [key, data] of batch.entries()) {
                requeueEntry(key, data);
            }
        }
        isFlushing = false;
        return;
    }

    // The increments landed: the database is healthy again.
    consecutiveFlushFailures = 0;
    flushBlockedUntil = 0;
    if (droppedXpEvents > 0) {
        logger.warn(`[XP_SYNC] Database recovered, ${droppedXpEvents} XP event(s) were dropped during the outage.`);
        droppedXpEvents = 0;
    }

    // Step 2: recompute levels from the now-persisted absolute XP. A failure
    // here is safe to swallow, the next flush recomputes from the same XP, so
    // we must NOT re-queue (the XP is already saved).
    try {
        const guildClauses = [...userIdsByGuild].map(([guildId, userIds]) => ({
            guildId,
            userId: { $in: userIds },
        }));
        // lean(): these are read once to compute levels, never saved, so there
        // is no reason to hydrate a document per user.
        const updatedUsers = await User.find(
            guildClauses.length === 1 ? guildClauses[0] : { $or: guildClauses },
            { userId: 1, guildId: 1, xp: 1, level: 1 }
        ).lean();

        const levelUpdateOps = [];
        const usersToNotify = [];

        for (const user of updatedUsers) {
            const currentLevel = user.level || 0;
            let newLevel = currentLevel;

            // Level up until the XP curve says otherwise, but never past the cap.
            while (newLevel < MAX_LEVEL && user.xp >= xpRequiredForLevel(newLevel + 1)) {
                newLevel += 1;
            }

            if (newLevel > currentLevel) {
                levelUpdateOps.push({
                    updateOne: {
                        filter: { userId: user.userId, guildId: user.guildId },
                        update: { $set: { level: newLevel } }
                    }
                });

                const batchKey = `${user.userId}::${user.guildId}`;
                const cachedData = batch.get(batchKey);
                const activeChannelId = cachedData ? cachedData.lastChannelId : null;

                usersToNotify.push({
                    userId: user.userId,
                    guildId: user.guildId,
                    level: newLevel,
                    channelId: activeChannelId
                });
            }
        }

        if (levelUpdateOps.length > 0) {
            await User.bulkWrite(levelUpdateOps, { ordered: false });
            logger.info(`[XP_SYNC] Level up processed for ${levelUpdateOps.length} user(s).`);

            if (client) {
                for (const entry of usersToNotify) {
                    sendLevelUpEmbed(entry.userId, entry.guildId, entry.level, client, entry.channelId)
                        .catch(err => logger.error(`[XP_SYNC] Level embed alert failed for ${entry.userId}:`, err));

                    applyLevelRewards(entry.userId, entry.guildId, entry.level, client)
                        .catch(err => logger.error(`[XP_SYNC] Level reward assignment failed for ${entry.userId}:`, err));
                }
            }
        }
    } catch (err) {
        logger.error('[XP_SYNC_ERROR] Level recompute failed (XP already saved, not re-queued):', err);
    } finally {
        isFlushing = false;
    }
}

function startXpSync(client) {
    syncClient = client;
    setInterval(() => {
        // Circuit breaker: while the database is known down, skip the tick
        // instead of failing a bulkWrite every minute.
        if (Date.now() < flushBlockedUntil) return;
        flushXpBuffer(client).catch(err => logger.error('[XP_SYNC] Periodic flush failed:', err));
    }, FLUSH_INTERVAL_MS);
}

module.exports = {
    queueXp,
    startXpSync,
    flushXpBuffer
};