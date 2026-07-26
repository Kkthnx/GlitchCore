/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Renders 800x320 glitch banners for Glitch Haven.
// Usage: node scripts/generate-banners.js [outputDir]
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

GlobalFonts.registerFromPath(path.join(__dirname, '../src/assets/Rajdhani-Bold.ttf'), 'Rajdhani');

const W = 800;
const H = 320;
const OUT = process.argv[2] || path.join(__dirname, '../generated-banners');
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
        size -= 2;
        ctx.font = `${size}px Rajdhani`;
    }
    return size;
}

function draw(cfg) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const a1 = cfg.accent;
    const a2 = cfg.accent2 || cfg.accent;

    // Base gradient, dark with a hint of the accent.
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, shade(a1, -120));
    bg.addColorStop(0.5, '#080a12');
    bg.addColorStop(1, '#05070c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Accent glow blobs.
    ctx.globalCompositeOperation = 'lighter';
    for (const [bx, by, col] of [[W * 0.18, H * 0.25, a1], [W * 0.85, H * 0.8, a2]]) {
        const g = ctx.createRadialGradient(bx, by, 10, bx, by, 360);
        g.addColorStop(0, rgba(col, 0.30));
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

    // Neon accent bars behind the title.
    ctx.fillStyle = rgba(a1, 0.16);
    ctx.fillRect(0, 116, W, 12);
    ctx.fillStyle = rgba(a2, 0.12);
    ctx.fillRect(0, 210, W, 6);

    // Terminal tag, top left.
    if (cfg.tag) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '24px Rajdhani';
        ctx.fillStyle = rgba(a1, 0.9);
        ctx.fillText(cfg.tag, 40, 58);
    }

    // Title lines with chromatic split.
    const lines = cfg.lines;
    const lineH = lines.length > 1 ? 92 : 120;
    const blockH = lines.length * lineH;
    let y = H / 2 - blockH / 2 + lineH - 24;
    ctx.textAlign = 'left';
    for (const line of lines) {
        const size = fitFont(ctx, line, W - 80, lines.length > 1 ? 96 : 128);
        ctx.font = `${size}px Rajdhani`;
        const x = 40;
        ctx.fillStyle = '#00e6ff';
        ctx.fillText(line, x - 5, y - 2);
        ctx.fillStyle = '#ff2d6b';
        ctx.fillText(line, x + 5, y + 2);
        ctx.fillStyle = rgba(a1, 0.5);
        ctx.fillText(line, x, y);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(line, x, y);
        y += lineH;
    }

    // Subtitle.
    if (cfg.sub) {
        ctx.font = '28px Rajdhani';
        ctx.fillStyle = 'rgba(203,213,230,0.85)';
        ctx.fillText(cfg.sub, 42, H - 40);
    }

    // Scanlines.
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let sy = 0; sy < H; sy += 4) ctx.fillRect(0, sy, W, 2);

    // Glitch slice accents.
    ctx.fillStyle = rgba(a1, 0.85);
    ctx.fillRect(40, 92, 60, 4);
    ctx.fillStyle = '#00e6ff';
    ctx.fillRect(W - 120, 250, 44, 3);

    // Wordmark, bottom right.
    ctx.textAlign = 'right';
    ctx.font = '22px Rajdhani';
    ctx.fillStyle = rgba(a2, 0.9);
    ctx.fillText('GLITCH HAVEN', W - 40, H - 42);

    // Neon border.
    roundRect(ctx, 3, 3, W - 6, H - 6, 18);
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(a1, 0.55);
    ctx.stroke();

    return canvas.toBuffer('image/png');
}

const BANNERS = [
    { name: 'friday-night-gaming', lines: ['FRIDAY NIGHT', 'GAMING'], tag: '> WEEKEND.INIT', sub: 'Squad up. The lobby is open.', accent: '#b483ff', accent2: '#ff5fd0' },
    { name: 'saturday-night-gaming', lines: ['SATURDAY NIGHT', 'GAMING'], tag: '> WEEKEND.RUN', sub: 'Round two. Bring the chaos.', accent: '#5cc8ff', accent2: '#34d3b4' },
    { name: 'glitch-haven-event', lines: ['GLITCH HAVEN', 'EVENT'], tag: '> SYSTEM.EVENT', sub: 'Game night incoming. RSVP now.', accent: '#39ff14', accent2: '#34d3b4' },
    { name: 'double-xp-weekend', lines: ['DOUBLE XP', 'WEEKEND'], tag: '> BONUS.ACTIVE', sub: 'Earn 2x XP all weekend long.', accent: '#f0b429', accent2: '#ff7a3c' },
    { name: 'giveaway', lines: ['GIVEAWAY'], tag: '> DROP.LIVE', sub: 'Click to enter. Good luck.', accent: '#f0b429', accent2: '#ff5fd0' },
    { name: 'now-live', lines: ['NOW LIVE'], tag: '> STREAM.ONLINE', sub: 'A member just went live on Twitch.', accent: '#9146ff', accent2: '#b483ff' },
    { name: 'welcome', lines: ['WELCOME TO', 'GLITCH HAVEN'], tag: '> USER.CONNECTED', sub: 'You made it. Grab your roles.', accent: '#5cc8ff', accent2: '#34d3b4' },
    { name: 'game-night', lines: ['GAME NIGHT'], tag: '> EVENT.SCHEDULED', sub: 'RSVP and roll out.', accent: '#34d3b4', accent2: '#5cc8ff' },
    { name: 'announcement', lines: ['ANNOUNCEMENT'], tag: '> BROADCAST', sub: 'Heads up, Glitch Haven.', accent: '#ff6b6b', accent2: '#ff5fd0' },
    { name: 'lfg', lines: ['LOOKING FOR', 'GROUP'], tag: '> LFG.OPEN', sub: 'Who is queuing up?', accent: '#2fe07a', accent2: '#34d3b4' },
];

for (const b of BANNERS) {
    fs.writeFileSync(path.join(OUT, `${b.name}.png`), draw(b));
}
console.log(`Generated ${BANNERS.length} banners in ${OUT}`);
