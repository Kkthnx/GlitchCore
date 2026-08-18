/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

GlobalFonts.registerFromPath(path.join(__dirname, '../assets/Rajdhani-Bold.ttf'), 'Rajdhani');

const W = 800;
const H = 220;
const GREEN = '#39e022';

function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
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

// Renders a widescreen "PATCH DEPLOYED" glitch header for update announcements.
function generatePatchBanner(commit = '') {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Base gradient.
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0a1320');
    bg.addColorStop(0.55, '#070a12');
    bg.addColorStop(1, '#04060c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Accent glow blobs.
    ctx.globalCompositeOperation = 'lighter';
    for (const [bx, by, col] of [[W * 0.18, H * 0.3, GREEN], [W * 0.85, H * 0.8, '#5cc8ff']]) {
        const g = ctx.createRadialGradient(bx, by, 8, bx, by, 320);
        g.addColorStop(0, rgba(col, 0.22));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Faint grid.
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Terminal tag.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '24px Rajdhani';
    ctx.fillStyle = rgba(GREEN, 0.9);
    ctx.fillText('> SYSTEM.UPDATE', 40, 52);

    // Chromatic title.
    ctx.textAlign = 'center';
    ctx.font = '82px Rajdhani';
    chromatic(ctx, 'PATCH DEPLOYED', W / 2, 138, GREEN, 4);

    // Datamosh slice accents around the title.
    ctx.fillStyle = rgba(GREEN, 0.85);
    ctx.fillRect(40, 88, 60, 4);
    ctx.fillStyle = '#00e6ff';
    ctx.fillRect(W - 120, 150, 44, 3);

    // Wordmark + commit.
    ctx.textAlign = 'left';
    ctx.font = '22px Rajdhani';
    ctx.fillStyle = rgba('#5cc8ff', 0.9);
    ctx.fillText('GLITCHCORE', 40, H - 30);
    if (commit) {
        ctx.textAlign = 'right';
        ctx.fillStyle = rgba(GREEN, 0.9);
        ctx.fillText(`BUILD ${commit}`, W - 40, H - 30);
    }

    // Scanlines.
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);

    // Neon border.
    roundRect(ctx, 3, 3, W - 6, H - 6, 16);
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(GREEN, 0.5);
    ctx.stroke();

    return canvas.toBuffer('image/png');
}

module.exports = { generatePatchBanner };
