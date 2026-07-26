/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
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

// The default Glitch Haven green lettering gradient (top to bottom stops).
const GREEN_STOPS = ['#a6ff33', '#39e022', '#12801a'];

// A single text layer on a transparent canvas, filled solid or with a vertical
// gradient built from an array of color stops.
function textLayer(text, S, fill, stops) {
    const c = createCanvas(S, S);
    const x = c.getContext('2d');
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const size = fitFont(x, text, S * 0.82, Math.round(S * 0.66));
    x.font = `${size}px Rajdhani`;
    if (stops && stops.length) {
        const g = x.createLinearGradient(0, S * 0.22, 0, S * 0.82);
        stops.forEach((c2, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c2));
        x.fillStyle = g;
    } else {
        x.fillStyle = fill;
    }
    x.fillText(text, S / 2, S / 2 + size * 0.02);
    return c;
}

// Datamosh-style glitch icon: gradient lettering, RGB channel split, heavy
// horizontal slice tearing, and signal noise, close to the original GH.
function drawGlitchIcon(text, S = 512, stops = GREEN_STOPS) {
    const canvas = createCanvas(S, S);
    const ctx = canvas.getContext('2d');

    // Dark navy background with faint horizontal signal lines and static.
    const bg = ctx.createLinearGradient(0, 0, 0, S);
    bg.addColorStop(0, '#0a1020');
    bg.addColorStop(1, '#04060c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 3) {
        if (Math.random() < 0.16) {
            ctx.fillStyle = `rgba(120,170,210,${Math.random() * 0.06})`;
            ctx.fillRect(0, y, S, 1);
        }
    }
    for (let i = 0; i < S * 2; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
        ctx.fillRect(Math.random() * S, Math.random() * S, 1, 1);
    }

    // Composite the lettering with an RGB channel split on an offscreen canvas.
    const green = textLayer(text, S, null, stops);
    const cyan = textLayer(text, S, '#00ffff', null);
    const magenta = textLayer(text, S, '#ff2b6b', null);
    const gt = createCanvas(S, S);
    const g = gt.getContext('2d');
    const off = Math.round(S * 0.015);
    // Green is the opaque, dominant base. Cyan/magenta are only edge fringe.
    g.drawImage(green, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.38;
    g.drawImage(cyan, -off, Math.round(off * 0.3));
    g.drawImage(magenta, off, -Math.round(off * 0.3));
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // Re-assert the green core so the letters stay saturated, not pastel.
    g.globalAlpha = 0.5;
    g.drawImage(green, 0, 0);
    g.globalAlpha = 1;

    // Base pass.
    ctx.drawImage(gt, 0, 0);

    // Horizontal slice displacement (the datamosh tearing).
    for (let k = 0; k < 60; k++) {
        const y = Math.floor(Math.random() * S);
        const h = 1 + Math.floor(Math.random() * 12);
        const dx = Math.round((Math.random() - 0.5) * S * 0.14);
        ctx.drawImage(gt, 0, y, S, h, dx, y, S, h);
    }

    // A few brighter signal-tear bands.
    for (let k = 0; k < 7; k++) {
        const y = Math.floor(Math.random() * S);
        const h = 1 + Math.floor(Math.random() * 4);
        ctx.drawImage(gt, 0, y, S, h, Math.round((Math.random() - 0.5) * 60), y, S, h);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(200,255,170,${0.15 + Math.random() * 0.2})`;
        ctx.fillRect(0, y, S, h);
        ctx.globalCompositeOperation = 'source-over';
    }

    // Fine scanlines and a soft vignette.
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let y = 0; y < S; y += 3) ctx.fillRect(0, y, S, 1);
    const vig = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, S, S);

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
fs.writeFileSync(path.join(OUT, 'icon-gh.png'), drawGlitchIcon('GH'));
fs.writeFileSync(path.join(OUT, 'icon-gc.png'), drawGlitchIcon('GC'));
fs.writeFileSync(path.join(OUT, 'icon-terminal.png'), drawGlitchIcon('>_'));

// Seasonal GH variants. Same glitch, swapped lettering palette so the identity
// can change for Pride, holidays, and events.
const SEASONS = {
    pride: ['#ff2d2d', '#ff8c1a', '#ffe14d', '#39e022', '#3aa2ff', '#a24bff'],
    trans: ['#5bcffa', '#f5a9b8', '#ffffff', '#f5a9b8', '#5bcffa'],
    christmas: ['#ff4d4d', '#ffffff', '#2fbf2a'],
    halloween: ['#ff8c1a', '#ff6a00', '#a24bff'],
    newyear: ['#ffe07a', '#ffd23f', '#b98900'],
    valentine: ['#ff9ecb', '#ff2d6b', '#b3124a'],
    summer: ['#ffe14d', '#34d3b4', '#5cc8ff'],
    winter: ['#d8f3ff', '#5cc8ff', '#3a6ff0'],
};
for (const [name, stops] of Object.entries(SEASONS)) {
    fs.writeFileSync(path.join(OUT, `icon-gh-${name}.png`), drawGlitchIcon('GH', 512, stops));
}

// Server banner (960x540) and bot profile banner (960x384).
fs.writeFileSync(path.join(OUT, 'server-banner.png'), drawBanner(
    { lines: ['GLITCH', 'HAVEN'], tag: '> SYSTEM.ONLINE', sub: 'All around gaming community.', accent: GREEN, accent2: GREEN2 }, 960, 540));
fs.writeFileSync(path.join(OUT, 'bot-banner.png'), drawBanner(
    { lines: ['GLITCHCORE'], tag: '> GLITCH_HAVEN', sub: 'The bot that runs Glitch Haven.', accent: '#5cc8ff', accent2: GREEN2 }, 960, 384));

console.log(`Generated identity art in ${OUT}`);
