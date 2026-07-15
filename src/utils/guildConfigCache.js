const GuildConfig = require('../database/GuildConfigSchema');

const configCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cacheKey(guildId) {
    return guildId;
}

async function getGuildConfig(guildId) {
    const key = cacheKey(guildId);
    const existing = configCache.get(key);
    if (existing && Date.now() - existing.fetchedAt < CACHE_TTL_MS) {
        return existing.config;
    }

    const config = await GuildConfig.findOne({ guildId });
    configCache.set(key, { config, fetchedAt: Date.now() });
    return config;
}

function invalidateGuildConfig(guildId) {
    configCache.delete(cacheKey(guildId));
}

module.exports = {
    getGuildConfig,
    invalidateGuildConfig,
};
