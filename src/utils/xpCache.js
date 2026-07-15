const User = require('../database/UserSchema');
const { xpRequiredForLevel } = require('./calculateXp');
const config = require('../../config.json');
const { sendLevelUpEmbed } = require('./levelUpEmbed');
const { applyLevelRewards } = require('./levelRewardManager');
const logger = require('./logger');

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

    try {
        await User.bulkWrite(bulkOps, { ordered: false });

        const updatedUsers = await User.find(
            { $or: queryConditions },
            { userId: 1, guildId: 1, xp: 1, level: 1 }
        );

        const levelUpdateOps = [];
        const usersToNotify = [];

        for (const user of updatedUsers) {
            let currentLevel = user.level || 0;
            let newLevel = currentLevel;

            while (user.xp >= xpRequiredForLevel(newLevel + 1)) {
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
        logger.error('[XP_SYNC_ERROR] Failed to batch sync XP adjustments to database:', err);

        for (const [key, data] of batch.entries()) {
            if (!xpBuffer.has(key)) {
                xpBuffer.set(key, { ...data });
            } else {
                const current = xpBuffer.get(key);
                current.xp += data.xp;
                current.textMessageCount += data.textMessageCount;
            }
        }
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
    startXpSync
};