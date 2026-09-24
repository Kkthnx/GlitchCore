/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Shared canvas primitives for the image generators (rank card, welcome banner,
// patch banner). Requiring this module also registers the brand fonts once, so
// the faces are not re-registered per generator.
const { GlobalFonts, loadImage } = require('@napi-rs/canvas');
const path = require('path');

// How long to wait for a remote image (an avatar, in practice) before giving up.
const REMOTE_IMAGE_TIMEOUT_MS = 5000;

GlobalFonts.registerFromPath(path.join(__dirname, '../assets/Rajdhani-Bold.ttf'), 'Rajdhani');
GlobalFonts.registerFromPath(path.join(__dirname, '../assets/Rajdhani-Regular.ttf'), 'Rajdhani-Regular');

/**
 * Loads a remote image with a timeout.
 *
 * loadImage() will happily take a URL and fetch it itself, but with no timeout:
 * a CDN that accepts the connection and then stalls leaves the caller awaiting
 * forever. For /rank that's an interaction that never gets its reply, and the
 * canvas generators' own try/catch never fires because nothing ever throws.
 * Fetching it ourselves means a stall becomes an error, which the callers
 * already handle by drawing their placeholder.
 *
 * @param {string} url
 * @param {number} [timeoutMs]
 */
async function loadRemoteImage(url, timeoutMs = REMOTE_IMAGE_TIMEOUT_MS) {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`image fetch failed (${res.status})`);
    return loadImage(Buffer.from(await res.arrayBuffer()));
}

// A #rrggbb hex plus an alpha, as an rgba() string.
function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// Traces a rounded-rect path. The radius is clamped to half the shortest side
// so it can never overshoot and distort the corners.
function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

// Draws text with a red/cyan chromatic-aberration split, base color on top.
function chromatic(ctx, text, x, y, base, off) {
    ctx.fillStyle = '#00e6ff';
    ctx.fillText(text, x - off, y - off / 2);
    ctx.fillStyle = '#ff2d6b';
    ctx.fillText(text, x + off, y + off / 2);
    ctx.fillStyle = base;
    ctx.fillText(text, x, y);
}

module.exports = { rgba, roundRect, chromatic, loadRemoteImage, REMOTE_IMAGE_TIMEOUT_MS };
