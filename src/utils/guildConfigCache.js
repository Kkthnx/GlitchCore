/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const GuildConfig = require('../database/GuildConfigSchema');

const configCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-flight fetches, keyed by guild. A cold cache plus a burst of messages
// would otherwise fire one identical query per message; sharing the promise
// collapses them into a single round trip.
const inflight = new Map();

function cacheKey(guildId) {
    return guildId;
}

/**
 * Read-only, cached guild config. Returns a plain object (or null when the
 * guild has no config document yet), never a hydrated Mongoose document, so
 * callers can't accidentally mutate and save a shared cache entry. Use
 * getOrCreateGuildConfig() when you intend to change and save settings.
 */
async function getGuildConfig(guildId) {
    const key = cacheKey(guildId);
    const existing = configCache.get(key);
    if (existing && Date.now() - existing.fetchedAt < CACHE_TTL_MS) {
        return existing.config;
    }

    const pending = inflight.get(key);
    if (pending) return pending;

    // lean() skips document hydration. This runs on every message, so the
    // saved work per call adds up on a busy server.
    const fetch = GuildConfig.findOne({ guildId }).lean()
        .then((config) => {
            configCache.set(key, { config, fetchedAt: Date.now() });
            return config;
        })
        .finally(() => inflight.delete(key));

    inflight.set(key, fetch);
    return fetch;
}

function invalidateGuildConfig(guildId) {
    configCache.delete(cacheKey(guildId));
}

/**
 * Drops cache entries for guilds the bot is no longer in, so leaving a server
 * can't pin its settings in memory for the rest of the process's life.
 */
function pruneGuildConfigCache(liveGuildIds) {
    const live = new Set(liveGuildIds);
    for (const key of configCache.keys()) {
        if (!live.has(key)) configCache.delete(key);
    }
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
    pruneGuildConfigCache,
};
