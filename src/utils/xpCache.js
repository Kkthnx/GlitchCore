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
const MAX_BUFFER_ENTRIES = 2000;
const xpBuffer = new Map();
let isFlushing = false;

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

    if (!xpBuffer.has(key)) {
        xpBuffer.set(key, { xp: 0, textMessageCount: 0, lastChannelId: channelId });
    }

    const data = xpBuffer.get(key);
    data.xp += xpAmount;
    if (isMessage) data.textMessageCount += 1;
    data.lastChannelId = channelId || data.lastChannelId;

    if (xpBuffer.size >= MAX_BUFFER_ENTRIES) {
        logger.warn('[XP_SYNC] XP buffer reached maximum size, flushing immediately.');
        flushXpBuffer().catch(err => logger.error('[XP_SYNC] Failed to flush oversized XP buffer:', err));
    }
}

async function flushXpBuffer(client = null) {
    if (isFlushing || xpBuffer.size === 0) return;
    isFlushing = true;

    const batch = new Map(xpBuffer);
    xpBuffer.clear();

    const bulkOps = [];
    const queryConditions = [];

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

        queryConditions.push({ userId, guildId });
    }

    // Step 1: persist the XP increments. This is the only step whose failure
    // means the XP was NOT saved, so it's the only one we re-queue for.
    // Re-queuing after it succeeds would double-count the XP on the next flush.
    try {
        await User.bulkWrite(bulkOps, { ordered: false });
    } catch (err) {
        logger.error('[XP_SYNC_ERROR] XP increment failed, re-queuing batch:', err);
        for (const [key, data] of batch.entries()) {
            const current = xpBuffer.get(key);
            if (!current) xpBuffer.set(key, { ...data });
            else {
                current.xp += data.xp;
                current.textMessageCount += data.textMessageCount;
            }
        }
        isFlushing = false;
        return;
    }

    // Step 2: recompute levels from the now-persisted absolute XP. A failure
    // here is safe to swallow, the next flush recomputes from the same XP, so
    // we must NOT re-queue (the XP is already saved).
    try {
        const updatedUsers = await User.find(
            { $or: queryConditions },
            { userId: 1, guildId: 1, xp: 1, level: 1 }
        );

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
    setInterval(async () => {
        await flushXpBuffer(client).catch(err => logger.error('[XP_SYNC] Periodic flush failed:', err));
    }, 60 * 1000);
}

module.exports = {
    queueXp,
    startXpSync,
    flushXpBuffer
};