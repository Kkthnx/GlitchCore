/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Helpers for building text that fits inside Discord's limits.
//
// discord.js validates these when the builder is populated, so going over
// doesn't produce a truncated message, it throws. That is worse than it sounds
// for anything rendered repeatedly: an event card that grows past the limit
// throws on every subsequent RSVP, so the roster keeps changing in the database
// while the card is stuck and every member gets a generic error.
//
// Anything built from a list whose length the bot doesn't control belongs here.

// Discord's documented maximums.
const LIMITS = {
    description: 4096,
    fieldValue: 1024,
    fieldName: 256,
    content: 2000,
    title: 256,
};

/** Truncates to `max` characters, with an ellipsis when it had to cut. */
function clamp(text, max) {
    const s = String(text ?? '');
    return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Packs lines into newline-joined chunks that never exceed `limit`, so each can
 * become its own embed field. A single line longer than the limit is truncated
 * rather than dropped.
 */
function chunkLines(lines, limit = LIMITS.fieldValue) {
    const chunks = [];
    let buf = '';
    for (let line of lines) {
        if (line.length > limit) line = clamp(line, limit);
        if (buf && buf.length + 1 + line.length > limit) {
            chunks.push(buf);
            buf = '';
        }
        buf = buf ? `${buf}\n${line}` : line;
    }
    if (buf) chunks.push(buf);
    return chunks;
}

/**
 * Takes as many whole entries as fit in `budget`, then says how many were left
 * out. Showing most of a roster plus "and 12 more" is far better than throwing.
 *
 * The separator is part of the budget, so callers that join with something other
 * than a newline must say so, or the result comes out longer than they asked
 * for by one character per entry.
 *
 * @param {string[]} lines
 * @param {number} budget characters available for the joined result
 * @param {((n: number) => string) | { more?: (n: number) => string, separator?: string }} [options]
 * @returns {string}
 */
function fitLines(lines, budget, options = {}) {
    // Callers used to pass the summary renderer directly; keep that working.
    const { more = n => `_…and ${n} more_`, separator = '\n' } =
        typeof options === 'function' ? { more: options } : options;

    if (!lines.length) return '';

    const sep = separator.length;
    let used = 0;
    const kept = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const cost = kept.length ? line.length + sep : line.length;
        // Leave room for the summary, unless this is the last entry anyway.
        const remaining = lines.length - i - 1;
        const reserve = remaining > 0 ? more(remaining).length + sep : 0;

        if (used + cost + reserve > budget) {
            const dropped = lines.length - kept.length;
            if (dropped > 0) kept.push(more(dropped));
            return kept.join(separator);
        }

        kept.push(line);
        used += cost;
    }

    return kept.join(separator);
}

/**
 * Splits a list of mentions into message-sized batches, so pinging a big roster
 * sends two messages instead of failing to send one.
 *
 * @param {string[]} mentions already-formatted, e.g. '<@123>'
 * @param {string} [lead] text that only goes on the first batch
 * @param {number} [limit]
 * @returns {string[]} message contents, never empty when there is a lead
 */
function mentionBatches(mentions, lead = '', limit = LIMITS.content) {
    if (!mentions.length) return lead ? [lead] : [];

    const batches = [];
    let buf = lead;

    for (const mention of mentions) {
        const cost = buf ? mention.length + 1 : mention.length;
        if (buf && buf.length + cost > limit) {
            batches.push(buf);
            buf = '';
        }
        buf = buf ? `${buf} ${mention}` : mention;
    }
    if (buf) batches.push(buf);
    return batches;
}

module.exports = { LIMITS, clamp, chunkLines, fitLines, mentionBatches };
