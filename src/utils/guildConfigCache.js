/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

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

/**
 * Returns a live (uncached) GuildConfig document for mutation, creating it if
 * it doesn't exist. Use this when you're going to change + save the config;
 * use getGuildConfig() for read-only, cached access.
 */
async function getOrCreateGuildConfig(guildId) {
    let config = await GuildConfig.findOne({ guildId });
    if (!config) config = await GuildConfig.create({ guildId });
    return config;
}

module.exports = {
    getGuildConfig,
    getOrCreateGuildConfig,
    invalidateGuildConfig,
};
