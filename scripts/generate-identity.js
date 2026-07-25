/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Renders Glitch Haven identity art (server + bot icons and banners).
// Usage: node scripts/generate-identity.js [outputDir]
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

GlobalFonts.registerFromPath(path.join(__dirname, '../src/assets/Rajdhani-Bold.ttf'), 'Rajdhani');

const OUT = process.argv[2] || path.join(__dirname, '../generated-identity');
fs.mkdirSync(OUT, { recursive: true });

function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const clamp = v => Math.max(0, Math.min(255, v));
    return `rgb(${clamp((n >> 16) + amt)},${clamp(((n >> 8) & 255) + amt)},${clamp((n & 255) + amt)})`;
}
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
function fitFont(ctx, text, maxW, start) {
    let size = start;
    ctx.font = `${size}px Rajdhani`;
    while (ctx.measureText(text).width > maxW && size > 20) {
        size -= 4;
        ctx.font = `${size}px Rajdhani`;
    }
    return size;
}

function glitchBg(ctx, W, H, a1, a2) {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, shade(a1, -140));
    bg.addColorStop(0.55, '#070911');
    bg.addColorStop(1, '#04050a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';
    for (const [bx, by, col] of [[W * 0.3, H * 0.3, a1], [W * 0.75, H * 0.75, a2]]) {
        const g = ctx.createRadialGradient(bx, by, 10, bx, by, Math.max(W, H) * 0.6);
        g.addColorStop(0, rgba(col, 0.3));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const step = Math.round(W / 20);
    for (let x = 0; x <= W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

function scanlines(ctx, W, H) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
}

function chromatic(ctx, text, x, y, a1, off) {
    ctx.fillStyle = '#00e6ff';
    ctx.fillText(text, x - off, y - off / 2);
    ctx.fillStyle = '#ff2d6b';
    ctx.fillText(text, x + off, y + off / 2);
    ctx.fillStyle = rgba(a1, 0.5);
    ctx.fillText(text, x, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y);
}

// Square icon, framed for the circular crop Discord applies.
function drawIcon(text, a1, a2, S = 512) {
    const canvas = createCanvas(S, S);
    const ctx = canvas.getContext('2d');
    glitchBg(ctx, S, S, a1, a2);

    ctx.fillStyle = rgba(a1, 0.14);
    ctx.fillRect(0, S * 0.42, S, S * 0.05);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = fitFont(ctx, text, S * 0.78, Math.round(S * 0.62));
    ctx.font = `${size}px Rajdhani`;
    chromatic(ctx, text, S / 2, S / 2 + size * 0.03, a1, Math.round(S * 0.016));

    scanlines(ctx, S, S);

    // Circular neon ring so it frames well when cropped to a circle.
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 10, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = rgba(a1, 0.6);
    ctx.stroke();

    return canvas.toBuffer('image/png');
}

// Wide banner with a title, optional second line, subtitle, and wordmark.
function drawBanner(cfg, W, H) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const a1 = cfg.accent;
    const a2 = cfg.accent2 || cfg.accent;
    glitchBg(ctx, W, H, a1, a2);

    ctx.fillStyle = rgba(a1, 0.15);
    ctx.fillRect(0, H * 0.36, W, 12);

    if (cfg.tag) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `${Math.round(H * 0.05)}px Rajdhani`;
        ctx.fillStyle = rgba(a1, 0.9);
        ctx.fillText(cfg.tag, 48, H * 0.16);
    }

    const lines = cfg.lines;
    const lineH = lines.length > 1 ? H * 0.26 : H * 0.34;
    let y = H / 2 - (lines.length * lineH) / 2 + lineH * 0.72;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (const line of lines) {
        const size = fitFont(ctx, line, W - 96, Math.round(lines.length > 1 ? H * 0.24 : H * 0.3));
        ctx.font = `${size}px Rajdhani`;
        chromatic(ctx, line, 48, y, a1, Math.round(W * 0.008));
        y += lineH;
    }

    if (cfg.sub) {
        ctx.font = `${Math.round(H * 0.06)}px Rajdhani`;
        ctx.fillStyle = 'rgba(203,213,230,0.85)';
        ctx.fillText(cfg.sub, 50, H - H * 0.12);
    }

    scanlines(ctx, W, H);

    ctx.textAlign = 'right';
    ctx.font = `${Math.round(H * 0.045)}px Rajdhani`;
    ctx.fillStyle = rgba(a2, 0.9);
    ctx.fillText('GLITCH HAVEN', W - 48, H - H * 0.12);

    roundRect(ctx, 4, 4, W - 8, H - 8, 20);
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(a1, 0.5);
    ctx.stroke();

    return canvas.toBuffer('image/png');
}

const GREEN = '#39ff14';
const GREEN2 = '#2fe07a';

// Icons (512x512). GH matches the existing brand, GC and >_ are bot options.
fs.writeFileSync(path.join(OUT, 'icon-gh.png'), drawIcon('GH', GREEN, GREEN2));
fs.writeFileSync(path.join(OUT, 'icon-gc.png'), drawIcon('GC', GREEN, '#5cc8ff'));
fs.writeFileSync(path.join(OUT, 'icon-terminal.png'), drawIcon('>_', '#5cc8ff', '#b483ff'));

// Server banner (960x540) and bot profile banner (960x384).
fs.writeFileSync(path.join(OUT, 'server-banner.png'), drawBanner(
    { lines: ['GLITCH', 'HAVEN'], tag: '> SYSTEM.ONLINE', sub: 'All around gaming community.', accent: GREEN, accent2: GREEN2 }, 960, 540));
fs.writeFileSync(path.join(OUT, 'bot-banner.png'), drawBanner(
    { lines: ['GLITCHCORE'], tag: '> GLITCH_HAVEN', sub: 'The bot that runs Glitch Haven.', accent: '#5cc8ff', accent2: GREEN2 }, 960, 384));

console.log(`Generated identity art in ${OUT}`);
