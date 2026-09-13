/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Shared canvas primitives for the image generators (rank card, welcome banner,
// patch banner). Requiring this module also registers the brand fonts once, so
// the faces are not re-registered per generator.
const { GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

GlobalFonts.registerFromPath(path.join(__dirname, '../assets/Rajdhani-Bold.ttf'), 'Rajdhani');
GlobalFonts.registerFromPath(path.join(__dirname, '../assets/Rajdhani-Regular.ttf'), 'Rajdhani-Regular');

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

module.exports = { rgba, roundRect, chromatic };
