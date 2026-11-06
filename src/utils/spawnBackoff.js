/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const MIN_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
// A Retry-After this long is an IP ban, and every request made during it can
// extend it. Waiting the whole time is the only move that helps.
const MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_CUSHION_MS = 10 * 1000;

/** Seconds from a Retry-After header on a thrown response, or 0 when absent. */
function retryAfterSeconds(err) {
    const value = Number(err?.headers?.get?.('retry-after'));
    return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * How long to wait before the next spawn attempt.
 *
 * With no Retry-After it backs off exponentially up to 15 minutes. With one, it
 * waits out the full time (capped at a day) plus a small cushion, because a
 * Retry-After longer than the normal ceiling means the host IP is blocked and
 * retrying early only prolongs the block.
 *
 * @param {unknown} err the error thrown by the failed spawn
 * @param {number} attempt 1 for the first failure
 * @returns {number} milliseconds
 */
function backoffFor(err, attempt) {
    const retryAfter = retryAfterSeconds(err);
    if (retryAfter > 0) {
        return Math.min(retryAfter * 1000 + RETRY_AFTER_CUSHION_MS, MAX_RETRY_AFTER_MS);
    }
    const exp = MIN_BACKOFF_MS * Math.pow(2, Math.min(attempt, 5));
    return Math.min(exp, MAX_BACKOFF_MS);
}

/** One readable line for a failed spawn, without dumping the whole response. */
function describeSpawnError(err) {
    const status = err?.status ? `HTTP ${err.status}` : 'error';
    const retryAfter = retryAfterSeconds(err);
    const wait = retryAfter ? `, Discord says wait ${Math.round(retryAfter / 60)} min` : '';
    const detail = err?.message && err.message !== '[object Object]' ? `, ${err.message}` : '';
    return `${status}${wait}${detail}`;
}

module.exports = { backoffFor, describeSpawnError, MAX_BACKOFF_MS, MAX_RETRY_AFTER_MS };
