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
//
// Held members are remembered, so once a moderator has dealt with the raiders
// the genuine joiners caught in the window can be let in with /raidmode release
// instead of being stranded without a role.

const AUTO_DURATION_MS = 10 * 60 * 1000;

// Enough for any real raid. A flood past this still gets held, it just isn't
// tracked for release, which keeps the list bounded.
const MAX_HELD_IDS = 500;

const states = new Map(); // guildId -> { until, auto, heldJoins }
const held = new Map(); // guildId -> Set of member IDs held, survives the raid window

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
 * automatic window. Turning it off keeps the held list so it can still be released.
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

/**
 * Counts a join held while raid mode is active and remembers who it was.
 * Returns the running total for the current window.
 */
function recordHeldJoin(guildId, memberId = null) {
    const state = states.get(guildId);
    if (!state) return 0;
    state.heldJoins += 1;

    if (memberId) {
        let ids = held.get(guildId);
        if (!ids) {
            ids = new Set();
            held.set(guildId, ids);
        }
        if (ids.size < MAX_HELD_IDS) ids.add(memberId);
    }
    return state.heldJoins;
}

/** How many held members are waiting to be released. */
function heldCount(guildId) {
    return held.get(guildId)?.size || 0;
}

/** Hands back the held member IDs and forgets them. */
function takeHeldMembers(guildId) {
    const ids = [...(held.get(guildId) || [])];
    held.delete(guildId);
    return ids;
}

/** Test seam. */
function _clearAll() {
    states.clear();
    held.clear();
}

module.exports = { isRaidMode, setRaidMode, recordHeldJoin, heldCount, takeHeldMembers, AUTO_DURATION_MS, MAX_HELD_IDS, _clearAll };
