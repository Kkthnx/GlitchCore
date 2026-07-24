// Lightweight in-memory anti-raid / anti-spam detection. Pure detectors are
// exported so they can be unit-tested without a live Discord message.

// key (`userId-guildId`) -> array of recent message timestamps (ms)
const buckets = new Map();

// Matches discord.gg / discord.com/invite / discordapp.com/invite links.
const INVITE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg)\/\S+/i;

/**
 * Records a message timestamp and reports whether the user has exceeded
 * `maxMessages` within the rolling `windowMs` window. Old timestamps are
 * pruned on each call so the map can't grow unbounded.
 * @returns {boolean} true if this message trips the rate limit.
 */
function recordAndCheckRate(key, now, maxMessages, windowMs) {
    const recent = (buckets.get(key) || []).filter(t => now - t < windowMs);
    recent.push(now);
    buckets.set(key, recent);
    return recent.length > maxMessages;
}

/** Clears a user's rate history (e.g. after an auto-timeout is applied). */
function resetRate(key) {
    buckets.delete(key);
}

/**
 * Drops buckets whose most recent message is older than `idleMs`, so users who
 * chatted once and went quiet don't linger in memory forever.
 */
function sweepIdle(now = Date.now(), idleMs = 5 * 60 * 1000) {
    for (const [key, timestamps] of buckets) {
        if (!timestamps.length || now - timestamps[timestamps.length - 1] > idleMs) {
            buckets.delete(key);
        }
    }
}

/** True if the text contains a Discord invite link. */
function containsInvite(text) {
    return INVITE_REGEX.test(String(text || ''));
}

/**
 * Total distinct user + role mentions in a message. `@everyone`/`@here`
 * count as one so a single mass-ping is caught.
 */
function mentionCount(message) {
    const users = message.mentions?.users?.size || 0;
    const roles = message.mentions?.roles?.size || 0;
    const everyone = message.mentions?.everyone ? 1 : 0;
    return users + roles + everyone;
}

/** Test seam — drop all tracked state. */
function _clearAll() {
    buckets.clear();
}

module.exports = {
    recordAndCheckRate,
    resetRate,
    sweepIdle,
    containsInvite,
    mentionCount,
    INVITE_REGEX,
    _clearAll,
};
