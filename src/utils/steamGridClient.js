/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

/**
 * Client for interfacing with SteamGridDB API.
 * Requires STEAMGRIDDB_API_KEY in the .env file.
 */

const logger = require('./logger');

const BASE_URL = 'https://www.steamgriddb.com/api/v2';

// A community plays the same handful of games, so the same names come through
// over and over: every /lfg and /event for "Valorant" was three sequential API
// calls. Results are cached by name, including misses (a game SteamGridDB
// doesn't have won't suddenly appear, and a miss is the slowest path since it
// walks all three requests before giving up).
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // banners are stable; half a day is plenty
const MISS_TTL_MS = 30 * 60 * 1000;       // retry an unknown game sooner
const CACHE_MAX = 200;
const bannerCache = new Map(); // normalized name -> { url, expiresAt }

function cacheKey(gameName) {
    return String(gameName || '').trim().toLowerCase();
}

function cacheGet(key) {
    const hit = bannerCache.get(key);
    if (!hit) return undefined;
    if (Date.now() >= hit.expiresAt) {
        bannerCache.delete(key);
        return undefined;
    }
    // Refresh insertion order so the evictor drops genuinely cold entries.
    bannerCache.delete(key);
    bannerCache.set(key, hit);
    return hit;
}

function cacheSet(key, url) {
    if (bannerCache.size >= CACHE_MAX) {
        // Map preserves insertion order, so the first key is the coldest.
        const coldest = bannerCache.keys().next().value;
        if (coldest !== undefined) bannerCache.delete(coldest);
    }
    bannerCache.set(key, { url, expiresAt: Date.now() + (url ? CACHE_TTL_MS : MISS_TTL_MS) });
}

/** Test seam. */
function _clearCache() {
    bannerCache.clear();
}

/**
 * Searches SteamGridDB for the best matching banner/grid for a given game name.
 * It favors 'heroes' (widescreen banners) which look best in Discord embeds, 
 * but falls back to standard 'grids' if none are found.
 * 
 * @param {string} gameName The name of the game (e.g. "World of Warcraft")
 * @returns {Promise<string|null>} The image URL, or null if none found or API key missing.
 */
async function fetchGameBanner(gameName) {
    const apiKey = process.env.STEAMGRIDDB_API_KEY;
    
    // Fail silently so the bot continues functioning without the API key.
    if (!apiKey) return null;

    const key = cacheKey(gameName);
    if (!key) return null;

    const cached = cacheGet(key);
    if (cached) return cached.url;

    try {
        // Step 1: Search to get the internal Game ID
        const searchRes = await fetch(`${BASE_URL}/search/autocomplete/${encodeURIComponent(gameName)}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            // Add a strict timeout since this delays user interactions (like Modal submits)
            signal: AbortSignal.timeout(3000) 
        });
        
        if (!searchRes.ok) {
            logger.warn(`[SteamGridDB] Search failed with status: ${searchRes.status}`);
            return null;
        }
        
        const searchData = await searchRes.json();
        if (!searchData.success || !searchData.data || searchData.data.length === 0) {
            cacheSet(key, null); // Game not found
            return null;
        }
        
        const gameId = searchData.data[0].id; // First result is the most relevant

        // Step 2: Fetch 'heroes' (widescreen background banners)
        const heroRes = await fetch(`${BASE_URL}/heroes/game/${gameId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(3000)
        });

        if (heroRes.ok) {
            const heroData = await heroRes.json();
            if (heroData.success && heroData.data && heroData.data.length > 0) {
                // Return the first image url
                cacheSet(key, heroData.data[0].url);
                return heroData.data[0].url;
            }
        }

        // Step 3: Fallback to standard 'grids' (vertical or smaller banners)
        const gridRes = await fetch(`${BASE_URL}/grids/game/${gameId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(3000)
        });

        if (gridRes.ok) {
            const gridData = await gridRes.json();
            if (gridData.success && gridData.data && gridData.data.length > 0) {
                cacheSet(key, gridData.data[0].url);
                return gridData.data[0].url;
            }
        }

        cacheSet(key, null); // No images found at all
        return null;
    } catch (error) {
        // Catch AbortError from timeout or network drops
        logger.warn(`[SteamGridClient] Failed to fetch banner for "${gameName}": ${error.message}`);
        return null;
    }
}

module.exports = {
    fetchGameBanner,
    _clearCache,
};
