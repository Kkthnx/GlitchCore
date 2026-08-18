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
            headers: {
                'TRN-Api-Key': process.env.TRACKER_API_KEY,
                Accept: 'application/json',
                // Tracker's public API is behind Cloudflare and rejects requests
                // without a browser-like User-Agent (a bare node/undici UA 403s).
                'User-Agent': 'Mozilla/5.0 (compatible; GlitchCore/1.0; +https://github.com/Kkthnx/GlitchCore)',
            },
        });
    } catch (err) {
        logger.warn(`[TRACKER] Request failed: ${err.message}`);
        return { error: 'network' };
    }

    if (res.status === 404) return { error: 'not_found' };
    if (res.status === 429) return { error: 'rate_limited' };
    if (res.status === 451) return { error: 'private' };
    if (res.status === 401 || res.status === 403) {
        // Log the body so we can tell an invalid key (401) from a Cloudflare /
        // unapproved-app block (403) when diagnosing.
        const body = await res.text().catch(() => '');
        logger.warn(`[TRACKER] ${res.status} for ${game}/${platform}: ${body.slice(0, 200)}`);
        return { error: res.status === 401 ? 'auth' : 'forbidden' };
    }
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

/**
 * Try a profile across several candidate platform slugs and return the first
 * that resolves. Used for titles like Battlefield 6 whose public-API platform
 * slug is not documented, so we self-discover it instead of guessing wrong.
 * Stops early on errors that would not change across platforms (no key, auth,
 * rate limit, network).
 * @returns {{ data, platform } | { error }}
 */
async function resolveProfile(game, platforms, identifier) {
    let lastError = 'not_found';
    for (const platform of platforms) {
        const r = await getProfile(game, platform, identifier);
        if (!r.error) return { data: r.data, platform };
        if (['no_key', 'auth', 'forbidden', 'rate_limited', 'network'].includes(r.error)) return { error: r.error };
        lastError = r.error;
    }
    return { error: lastError };
}

// The overview segment's stats map (or the first segment as a fallback), which
// holds the lifetime numbers we display.
function overviewStats(data) {
    const segments = data?.segments || [];
    const seg = segments.find(s => s.type === 'overview') || segments[0];
    return seg?.stats || {};
}

module.exports = { isConfigured, getProfile, resolveProfile, overviewStats };
