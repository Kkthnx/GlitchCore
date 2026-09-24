/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Lightweight in-memory AFK tracking (cleared on restart, acceptable for AFK).
//
// An entry is normally removed when the member next speaks, which is fine until
// they don't: someone who sets AFK and then leaves the server, or simply never
// posts again, used to sit in this map for the life of the process. It also
// meant an AFK set three weeks ago was still announced as current.
//
// So entries carry an expiry. Long enough to cover an actual holiday, short
// enough that the map stays bounded by people who are plausibly still away.

const afk = new Map(); // `${guildId}-${userId}` -> { reason, since, expiresAt }

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // a week

const key = (g, u) => `${g}-${u}`;

function setAfk(guildId, userId, reason, now = Date.now(), ttlMs = DEFAULT_TTL_MS) {
    afk.set(key(guildId, userId), {
        reason: reason || 'AFK',
        since: now,
        expiresAt: now + ttlMs,
    });
}

/**
 * Clears a member's AFK and returns what it was, so the caller can welcome them
 * back. Returns undefined if they weren't AFK (or their AFK had expired, which
 * should not produce a "welcome back" for something they set weeks ago).
 */
function clearAfk(guildId, userId, now = Date.now()) {
    const k = key(guildId, userId);
    const value = afk.get(k);
    afk.delete(k);
    if (!value) return undefined;
    return now < value.expiresAt ? value : undefined;
}

function getAfk(guildId, userId, now = Date.now()) {
    const k = key(guildId, userId);
    const value = afk.get(k);
    if (!value) return undefined;
    if (now >= value.expiresAt) {
        afk.delete(k); // lazily drop it on read as well as on the sweep
        return undefined;
    }
    return value;
}

/** Drops expired entries. Called from the hourly cleanup in index.js. */
function sweepExpired(now = Date.now()) {
    for (const [k, value] of afk) {
        if (now >= value.expiresAt) afk.delete(k);
    }
}

/** Test seam. */
function _clearAll() {
    afk.clear();
}

module.exports = { setAfk, clearAfk, getAfk, sweepExpired, _clearAll, DEFAULT_TTL_MS };
