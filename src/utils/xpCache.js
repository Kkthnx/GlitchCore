const User = require('../database/UserSchema');
const { xpRequiredForLevel } = require('./calculateXp');
const { isDoubleXpActive } = require('./isDoubleXp');
const config = require('../../config.json');
const { EmbedBuilder } = require('discord.js');
const levelUpSayings = require('./levelUpSayings');
const { sendLevelUpEmbed } = require('./levelUpEmbed');
// In-Memory Buffer
// Key: "userId-guildId"
// Value: { xp: Number, messages: Number, lastChannelId: String }
const xpBuffer = new Map();

/**
 * Queues XP to be written to the database later.
 */
function queueXp(userId, guildId, xpAmount, channelId) {
    const key = `${userId}-${guildId}`;
    if (!xpBuffer.has(key)) {
        xpBuffer.set(key, { xp: 0, messages: 0, lastChannelId: channelId });
    }
    const data = xpBuffer.get(key);
    data.xp += xpAmount;
    data.messages += 1;
    data.lastChannelId = channelId;
}

/**
 * Starts the background loop that flushes the cache to MongoDB every 60 seconds.
 */
function startXpSync(client) {
    setInterval(async () => {
        if (xpBuffer.size === 0) return;

        // Create a snapshot of the buffer and immediately clear the original 
        // so new messages can continue to queue up without blocking.
        const batch = new Map(xpBuffer);
        xpBuffer.clear();

        // 1. Prepare bulk operations for MongoDB
        const bulkOps = [];
        const queryConditions = [];

        for (const [key, data] of batch.entries()) {
            const [userId, guildId] = key.split('-');
            
            bulkOps.push({
                updateOne: {
                    filter: { userId, guildId },
                    update: { $inc: { xp: data.xp, totalMessages: data.messages } },
                    upsert: true
                }
            });

            queryConditions.push({ userId, guildId });
        }

        try {
            // 2. Execute the bulk write (One single network request for thousands of updates!)
            await User.bulkWrite(bulkOps);

            // 3. Fetch the updated users to check if anyone crossed a level threshold
            const updatedUsers = await User.find({ $or: queryConditions });

            for (const user of updatedUsers) {
                let leveledUp = false;

                // Use while loop in case they gained enough XP to skip multiple levels
                while (user.xp >= xpRequiredForLevel(user.level + 1)) {
                    user.level += 1;
                    leveledUp = true;
                }

                if (leveledUp) {
                    // Save the new level to the database
                    await user.save();

                    // Send the level up notification using the new shared utility
                    await sendLevelUpEmbed(user.userId, user.guildId, user.level, client);
                }
            }
        } catch (err) {
            console.error('[XP_SYNC_ERROR] Failed to bulk write XP to database:', err);
            // Re-queue the failed batch here for data safety
            for (const [key, data] of batch.entries()) {
                if (!xpBuffer.has(key)) {
                    xpBuffer.set(key, data);
                } else {
                    const current = xpBuffer.get(key);
                    current.xp += data.xp;
                    current.messages += data.messages;
                }
            }
        }
    }, 60 * 1000); // 60 seconds
}

module.exports = {
    queueXp,
    startXpSync
};
