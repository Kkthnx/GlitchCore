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
            return null; // Game not found
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
                return gridData.data[0].url;
            }
        }

        return null; // No images found at all
    } catch (error) {
        // Catch AbortError from timeout or network drops
        logger.warn(`[SteamGridClient] Failed to fetch banner for "${gameName}": ${error.message}`);
        return null;
    }
}

module.exports = {
    fetchGameBanner
};
