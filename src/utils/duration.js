/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Human-friendly duration parsing/formatting for moderation timeouts.
// Discord caps member timeouts at 28 days.
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
// Temp-bans longer than a year are a permanent ban with extra steps.
const MAX_TEMPBAN_MS = 365 * 24 * 60 * 60 * 1000;
// Anything parsed above this is a typo or an attempt to overflow Date, which
// tops out near 8.64e15 ms. Rejected outright rather than clamped.
const MAX_PARSE_MS = 100 * 365 * 24 * 60 * 60 * 1000;

const UNIT_MS = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Parse a compact duration like "10m", "1h30m", "2d", "45s".
 * @returns {number|null} milliseconds, or null if unparseable/zero.
 */
function parseDuration(input) {
    if (typeof input !== 'string') return null;
    const matches = input.toLowerCase().match(/(\d+)\s*([smhdw])/g);
    if (!matches) return null;

    let total = 0;
    for (const part of matches) {
        const [, amount, unit] = part.match(/(\d+)\s*([smhdw])/);
        total += parseInt(amount, 10) * UNIT_MS[unit];
    }
    return total > 0 && total <= MAX_PARSE_MS ? total : null;
}

/**
 * Clamp a duration to Discord's max timeout window.
 */
function clampTimeout(ms) {
    return Math.min(ms, MAX_TIMEOUT_MS);
}

/**
 * Format milliseconds as a short readable string, e.g. "1d 2h 30m".
 */
function humanizeDuration(ms) {
    if (!ms || ms <= 0) return '0s';
    const units = [['d', UNIT_MS.d], ['h', UNIT_MS.h], ['m', UNIT_MS.m], ['s', UNIT_MS.s]];
    let remaining = ms;
    const parts = [];
    for (const [label, size] of units) {
        const value = Math.floor(remaining / size);
        if (value > 0) {
            parts.push(`${value}${label}`);
            remaining -= value * size;
        }
    }
    return parts.join(' ') || '0s';
}

module.exports = { parseDuration, clampTimeout, humanizeDuration, MAX_TIMEOUT_MS, MAX_TEMPBAN_MS };
