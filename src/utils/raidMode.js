/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Raid mode. Join floods were detected but the only response was degrading the
// welcome art, so raiders kept joining one by one with full access. When raid
// mode is on, new joins are held: no auto-role, no welcome DM, no welcome
// post. It trips automatically off join-flood detection and a moderator can
// also flip it by hand with /raidmode before the automatic threshold trips.

const AUTO_DURATION_MS = 10 * 60 * 1000;

const states = new Map(); // guildId -> { until, auto, heldJoins }

/** True while raid mode is active for the guild. Expired states clean up here. */
function isRaidMode(guildId, now = Date.now()) {
    const state = states.get(guildId);
    if (!state) return false;
    if (now >= state.until) {
        states.delete(guildId);
        return false;
    }
    return true;
}

/**
 * Turns raid mode on or off. Manual off always wins; manual on replaces any
 * automatic window.
 * @returns the active state, or null when turned off.
 */
function setRaidMode(guildId, on, durationMs = AUTO_DURATION_MS, auto = false, now = Date.now()) {
    if (!on) {
        states.delete(guildId);
        return null;
    }
    const state = { until: now + durationMs, auto, heldJoins: 0 };
    states.set(guildId, state);
    return state;
}

/** Counts a join held while raid mode is active. Returns the running total. */
function recordHeldJoin(guildId) {
    const state = states.get(guildId);
    if (!state) return 0;
    state.heldJoins += 1;
    return state.heldJoins;
}

/** Test seam. */
function _clearAll() {
    states.clear();
}

module.exports = { isRaidMode, setRaidMode, recordHeldJoin, AUTO_DURATION_MS, _clearAll };
