/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Per-user, per-command rate limiting.
//
// Some commands are far more expensive than a slash command looks: /rank
// renders a card with @napi-rs/canvas (synchronous CPU that blocks the whole
// shard's event loop) after downloading the member's avatar, and /leaderboard
// and /stats each run an aggregate plus a bulk member fetch. Discord happily
// lets one member fire those back to back, so commands opt into a cooldown by
// exporting `cooldown` (in seconds).
//
// Commands with no `cooldown` are unlimited, deliberately: moderation commands
// need to stay fast during a raid.

const buckets = new Map(); // `${commandName}:${userId}` -> last-used epoch ms

function key(commandName, userId) {
    return `${commandName}:${userId}`;
}

/**
 * Records a use and reports whether it was allowed.
 *
 * Pure apart from the module-level map, and the map is injectable for tests.
 *
 * @param {string} commandName
 * @param {string} userId
 * @param {number} cooldownSeconds 0 or missing means no limit
 * @param {number} [now]
 * @param {Map} [store]
 * @returns {{ allowed: boolean, retryAfterMs: number }}
 */
function consume(commandName, userId, cooldownSeconds, now = Date.now(), store = buckets) {
    const cooldownMs = Number(cooldownSeconds) > 0 ? Number(cooldownSeconds) * 1000 : 0;
    if (!cooldownMs) return { allowed: true, retryAfterMs: 0 };

    const k = key(commandName, userId);
    const last = store.get(k);
    if (last !== undefined) {
        const elapsed = now - last;
        if (elapsed < cooldownMs) {
            return { allowed: false, retryAfterMs: cooldownMs - elapsed };
        }
    }

    store.set(k, now);
    return { allowed: true, retryAfterMs: 0 };
}

/**
 * Drops entries older than `idleMs` so the map can't grow with every member who
 * ever ran a command. Called from the same hourly sweep as the other caches.
 */
function sweepIdle(now = Date.now(), idleMs = 60 * 60 * 1000, store = buckets) {
    for (const [k, last] of store) {
        if (now - last > idleMs) store.delete(k);
    }
}

/** Test seam. */
function _clearAll() {
    buckets.clear();
}

module.exports = { consume, sweepIdle, _clearAll, buckets };
