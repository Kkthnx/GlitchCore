/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const logger = require('./logger');

/**
 * Wraps an async task so it can never run twice at once. Plain setInterval
 * fires on the clock whether or not the last tick finished, and every poller
 * here reads "work that is due" and then deletes it. If a slow tick overlaps
 * the next one, both see the same due rows and act on them twice, which means
 * a reminder sent twice or a giveaway drawn twice.
 *
 * The skipped tick is not lost work: the next one picks the same rows up.
 *
 * @param {string} name label used in the skip log
 * @param {(...args: any[]) => Promise<any>} task
 * @returns {(...args: any[]) => Promise<boolean>} true if it ran, false if skipped
 */
function nonOverlapping(name, task) {
    let running = false;

    return async (...args) => {
        if (running) {
            logger.warn(`[${name}] Previous tick is still running, skipping this one.`);
            return false;
        }
        running = true;
        try {
            await task(...args);
            return true;
        } finally {
            running = false;
        }
    };
}

/**
 * Runs `task` every `intervalMs`, without overlapping ticks and without ever
 * letting a rejection escape to the process-level handler.
 *
 * @param {object} opts
 * @param {string} opts.name log label, e.g. 'REMIND'
 * @param {() => Promise<any>} opts.task
 * @param {number} opts.intervalMs
 * @param {boolean} [opts.immediate] also run once right away
 * @param {number} [opts.delayMs] wait this long before the first run
 * @returns {NodeJS.Timeout} the interval handle, so callers can clear it
 */
function startPolling({ name, task, intervalMs, immediate = false, delayMs = 0 }) {
    const tick = nonOverlapping(name, task);
    const run = () => tick().catch(err => logger.error(`[${name}] Tick failed:`, err));

    if (immediate) {
        if (delayMs > 0) setTimeout(run, delayMs);
        else run();
    }

    const handle = setInterval(run, intervalMs);
    return handle;
}

module.exports = { nonOverlapping, startPolling };
