/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Thin client for the Tracker Network public API (tracker.gg). Reads public
// profile stats using an approval-gated TRN-Api-Key. Uses the global fetch.
const logger = require('./logger');

const BASE = 'https://public-api.tracker.gg/v2';

function isConfigured() {
    return Boolean(process.env.TRACKER_API_KEY);
}

/**
 * Fetch a standardized profile. Returns { data } on success, or { error } with
 * a stable code so the command can show a friendly message.
 * @param {string} game slug, e.g. "bf6", "bfv"
 * @param {string} platform slug, e.g. "origin", "psn", "xbl"
 * @param {string} username
 */
async function getProfile(game, platform, username) {
    if (!isConfigured()) return { error: 'no_key' };

    const url = `${BASE}/${game}/standard/profile/${platform}/${encodeURIComponent(username)}`;
    let res;
    try {
        res = await fetch(url, {
            headers: { 'TRN-Api-Key': process.env.TRACKER_API_KEY, Accept: 'application/json' },
        });
    } catch (err) {
        logger.warn(`[TRACKER] Request failed: ${err.message}`);
        return { error: 'network' };
    }

    if (res.status === 404) return { error: 'not_found' };
    if (res.status === 401 || res.status === 403) return { error: 'auth' };
    if (res.status === 429) return { error: 'rate_limited' };
    if (res.status === 451) return { error: 'private' };
    if (!res.ok) {
        logger.warn(`[TRACKER] Unexpected status ${res.status} for ${game}/${platform}`);
        return { error: 'unavailable' };
    }

    try {
        const json = await res.json();
        if (!json?.data) return { error: 'not_found' };
        return { data: json.data };
    } catch {
        return { error: 'unavailable' };
    }
}

// The overview segment's stats map (or the first segment as a fallback), which
// holds the lifetime numbers we display.
function overviewStats(data) {
    const segments = data?.segments || [];
    const seg = segments.find(s => s.type === 'overview') || segments[0];
    return seg?.stats || {};
}

module.exports = { isConfigured, getProfile, overviewStats };
