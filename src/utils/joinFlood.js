/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Join-rate detection for the welcome handler.
//
// A normal join costs a DM, an avatar download and a canvas render. The render
// is synchronous CPU, so it blocks the shard's event loop for its duration, and
// the DM burst looks like spam to Discord. That's fine a few times an hour and
// actively harmful during a raid: a few hundred joins would have the bot
// fighting its own welcome art at the exact moment moderation needs it
// responsive.
//
// So above a join rate no real community reaches, welcomes degrade to plain
// text. Nobody is skipped and nothing is dropped, it just stops doing the
// expensive parts until the flood passes.

const DEFAULT_MAX_JOINS = 10;
const DEFAULT_WINDOW_MS = 20 * 1000;

const joins = new Map(); // guildId -> timestamps (ms) inside the window

/**
 * Records a join and reports whether the guild is currently being flooded.
 *
 * @param {string} guildId
 * @param {number} [now]
 * @param {{ maxJoins?: number, windowMs?: number }} [opts]
 * @returns {{ flooded: boolean, recent: number }}
 */
function recordJoin(guildId, now = Date.now(), opts = {}) {
    const maxJoins = opts.maxJoins ?? DEFAULT_MAX_JOINS;
    const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;

    const recent = (joins.get(guildId) || []).filter(t => now - t < windowMs);
    recent.push(now);
    joins.set(guildId, recent);

    return { flooded: recent.length > maxJoins, recent: recent.length };
}

/**
 * Drops guilds with no joins inside `idleMs`, so a server that saw one join
 * months ago isn't still holding a timestamp array.
 */
function sweepIdle(now = Date.now(), idleMs = 10 * 60 * 1000) {
    for (const [guildId, timestamps] of joins) {
        if (!timestamps.length || now - timestamps[timestamps.length - 1] > idleMs) {
            joins.delete(guildId);
        }
    }
}

/** Test seam. */
function _clearAll() {
    joins.clear();
}

module.exports = { recordJoin, sweepIdle, _clearAll, DEFAULT_MAX_JOINS, DEFAULT_WINDOW_MS };
