/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Lightweight in-memory anti-raid / anti-spam detection. Pure detectors are
// exported so they can be unit-tested without a live Discord message.

// key (`userId-guildId`) -> array of recent message timestamps (ms)
const buckets = new Map();

// Matches discord.gg / discord.com/invite / discordapp.com/invite links, plus
// dsc.gg, a popular invite shortener and a favorite of scam servers.
const INVITE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg|dsc\.gg)\/\S+/i;

// Short curated blocklist of domains behind fake Nitro / Steam / "free skins"
// scams. These are the links that actually compromise accounts in gaming
// servers. Curated by hand and intentionally short: it needs a human to
// review additions, since an aggressive pattern here deletes legit chat. The
// steamcommunity branch excludes the real steamcommunity.com domain.
const SCAM_DOMAIN_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:disc0rd\w*|disord\w*|discord[-.]?nitro|nitro[-.]?discord|steamcommunity(?!\.com\b)\w*|steam[-.]?gift|free[-.]?nitro)\.[a-z]{2,}/i;

/**
 * Records a message and reports whether the user has exceeded `maxMessages`
 * within the rolling `windowMs` window. `weight` folds heavy payloads into the
 * same bucket: a message carrying ten images counts more than a text-only one.
 * Old timestamps are pruned on each call so the map can't grow unbounded.
 * @returns {boolean} true if this message trips the rate limit.
 */
function recordAndCheckRate(key, now, maxMessages, windowMs, weight = 1) {
    let recent = buckets.get(key);
    if (!recent) {
        recent = [];
        buckets.set(key, recent);
    }

    // Timestamps are appended in order, so everything expired sits at the front
    // and can be dropped in one splice. Filtering into a fresh array instead
    // allocated one per message plus a Map write, on the hottest path there is.
    let expired = 0;
    while (expired < recent.length && now - recent[expired] >= windowMs) expired += 1;
    if (expired) recent.splice(0, expired);

    for (let i = 0; i < weight; i += 1) recent.push(now);
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
    // The duplicate rings were never swept: one entry per member per server
    // stayed in memory for the life of the process.
    for (const [key, ring] of duplicateRings) {
        if (!ring.length || now - ring[ring.length - 1].at > idleMs) {
            duplicateRings.delete(key);
        }
    }
}

/** True if the text contains a Discord invite link. */
function containsInvite(text) {
    return INVITE_REGEX.test(String(text || ''));
}

/** True if the text links a known scam/phishing domain (fake Nitro, Steam). */
function containsScamDomain(text) {
    return SCAM_DOMAIN_REGEX.test(String(text || ''));
}

// key (`userId-guildId`) -> array of { hash, at, ref } for recent message bodies.
// Catches the classic spam shape: the same link or scam text posted a few
// times just slowly enough to stay under the rate limiter.
const duplicateRings = new Map();
const DUPLICATE_RING_SIZE = 10;
const MIN_DUPLICATE_LENGTH = 8;

function normalizeBody(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// FNV-1a. The ring only needs to tell "same body" from "different body", so it
// keeps a short fingerprint instead of the text. Holding the full body cost a
// message-length string per entry for every member who ever spoke.
function fingerprint(normalized) {
    let h = 0x811c9dc5;
    for (let i = 0; i < normalized.length; i += 1) {
        h ^= normalized.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return `${normalized.length}:${(h >>> 0).toString(36)}`;
}

/**
 * Records a message body and reports whether the same content appeared
 * `maxDuplicates` times within `windowMs`. Short messages (under 8 chars after
 * normalization) are ignored so "lol" x3 doesn't time anyone out.
 *
 * `ref` ({channelId, id}) is kept alongside the fingerprint so a trip can
 * delete the repeats, see takeDuplicateRefs.
 * @returns {boolean} true if this message trips duplicate detection.
 */
function recordAndCheckDuplicate(key, content, now, maxDuplicates, windowMs, ref = null) {
    const normalized = normalizeBody(content);
    if (normalized.length < MIN_DUPLICATE_LENGTH) return false;
    const hash = fingerprint(normalized);

    let ring = duplicateRings.get(key);
    if (!ring) {
        ring = [];
        duplicateRings.set(key, ring);
    }

    while (ring.length && now - ring[0].at >= windowMs) ring.shift();
    ring.push({ hash, at: now, ref });
    if (ring.length > DUPLICATE_RING_SIZE) ring.splice(0, ring.length - DUPLICATE_RING_SIZE);

    let matches = 0;
    for (const entry of ring) {
        if (entry.hash === hash) matches += 1;
    }
    return matches >= maxDuplicates;
}

/**
 * The message refs behind a duplicate trip, so the repeats can be deleted and
 * not just punished. Removes them from the ring.
 * @returns {{channelId: string, id: string}[]}
 */
function takeDuplicateRefs(key, content) {
    const ring = duplicateRings.get(key);
    if (!ring) return [];

    const hash = fingerprint(normalizeBody(content));
    const refs = [];
    const keep = [];
    for (const entry of ring) {
        if (entry.hash === hash) {
            if (entry.ref) refs.push(entry.ref);
        } else {
            keep.push(entry);
        }
    }
    duplicateRings.set(key, keep);
    return refs;
}

/** Test seam, drop all tracked state. */
function _clearAll() {
    buckets.clear();
    duplicateRings.clear();
}

module.exports = {
    recordAndCheckRate,
    recordAndCheckDuplicate,
    takeDuplicateRefs,
    resetRate,
    sweepIdle,
    containsInvite,
    containsScamDomain,
    mentionCount,
    INVITE_REGEX,
    _clearAll,
};

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
