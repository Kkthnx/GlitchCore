// Generates a set of branded custom-emoji PNGs (128x128, transparent) for
// Glitch Haven — upload them under Server Settings → Emoji (no boost needed).
// Usage: node scripts/generate-emojis.js [outputDir]
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

GlobalFonts.registerFromPath(path.join(__dirname, '../src/assets/Rajdhani-Bold.ttf'), 'Rajdhani');

const S = 128;
const OUT = process.argv[2] || path.join(__dirname, '../generated-emojis');
fs.mkdirSync(OUT, { recursive: true });

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const clamp = v => Math.max(0, Math.min(255, v));
    const r = clamp((n >> 16) + amt), g = clamp(((n >> 8) & 255) + amt), b = clamp((n & 255) + amt);
    return `rgb(${r},${g},${b})`;
}

function base(ctx, color) {
    ctx.clearRect(0, 0, S, S);
    const pad = 8, r = 30;
    const grad = ctx.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, shade(color, 35));
    grad.addColorStop(1, shade(color, -45));
    roundRect(ctx, pad, pad, S - pad * 2, S - pad * 2, r);
    ctx.fillStyle = grad; ctx.fill();
    roundRect(ctx, pad + 1.5, pad + 1.5, S - pad * 2 - 3, S - pad * 2 - 3, r - 2);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
}

function drawText(ctx, text) {
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let size = 62;
    ctx.font = `${size}px Rajdhani`;
    const maxW = S * 0.66;
    while (ctx.measureText(text).width > maxW && size > 20) { size -= 2; ctx.font = `${size}px Rajdhani`; }
    ctx.fillText(text, S / 2, S / 2 + 4);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
}

function poly(ctx, pts) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
}

const GLYPHS = {
    star(ctx) {
        const cx = S / 2, cy = S / 2 + 2, R = 34, r = 14, pts = [];
        for (let i = 0; i < 10; i++) {
            const ang = -Math.PI / 2 + i * Math.PI / 5;
            const rad = i % 2 ? r : R;
            pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
        }
        poly(ctx, pts);
    },
    bolt(ctx) {
        poly(ctx, [[70, 24], [40, 70], [58, 70], [50, 104], [86, 56], [66, 56]]);
    },
    play(ctx) {
        poly(ctx, [[48, 38], [92, 64], [48, 90]]);
    },
    crown(ctx) {
        poly(ctx, [[34, 84], [34, 50], [50, 66], [64, 42], [78, 66], [94, 50], [94, 84]]);
    },
    heart(ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
        ctx.beginPath();
        ctx.moveTo(64, 96);
        ctx.bezierCurveTo(20, 66, 36, 34, 64, 54);
        ctx.bezierCurveTo(92, 34, 108, 66, 64, 96);
        ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    },
};

const ITEMS = [
    { name: 'doublexp', text: '2X', color: '#f0b429' },
    { name: 'boost', glyph: 'bolt', color: '#f0b429' },
    { name: 'mvp', glyph: 'star', color: '#f0b429' },
    { name: 'vip', glyph: 'crown', color: '#b483ff' },
    { name: 'live', text: 'LIVE', color: '#ff6b6b' },
    { name: 'stream', glyph: 'play', color: '#b483ff' },
    { name: 'news', text: 'NEWS', color: '#5cc8ff' },
    { name: 'events', text: 'EVT', color: '#34d3b4' },
    { name: 'love', glyph: 'heart', color: '#ff5fd0' },
    { name: 'gg', text: 'GG', color: '#2fe07a' },
    { name: 'region_na', text: 'NA', color: '#5cc8ff' },
    { name: 'region_eu', text: 'EU', color: '#34d3b4' },
    { name: 'region_oce', text: 'OCE', color: '#b483ff' },
    { name: 'region_asia', text: 'ASIA', color: '#f0b429' },
    { name: 'plat_pc', text: 'PC', color: '#5cc8ff' },
    { name: 'plat_xb', text: 'XB', color: '#2fe07a' },
    { name: 'plat_ps', text: 'PS', color: '#5cc8ff' },
    { name: 'plat_ns', text: 'NS', color: '#ff6b6b' },
];

for (const item of ITEMS) {
    const canvas = createCanvas(S, S);
    const ctx = canvas.getContext('2d');
    base(ctx, item.color);
    if (item.glyph) GLYPHS[item.glyph](ctx);
    else drawText(ctx, item.text);
    fs.writeFileSync(path.join(OUT, `${item.name}.png`), canvas.toBuffer('image/png'));
}

// Contact sheet for a quick preview of the whole set.
const cols = 6, rows = Math.ceil(ITEMS.length / cols), cell = 128, gap = 16;
const sheet = createCanvas(cols * cell + (cols + 1) * gap, rows * cell + (rows + 1) * gap);
const sctx = sheet.getContext('2d');
sctx.fillStyle = '#0b1220'; sctx.fillRect(0, 0, sheet.width, sheet.height);
ITEMS.forEach((item, i) => {
    const c = createCanvas(S, S); const cc = c.getContext('2d');
    base(cc, item.color);
    if (item.glyph) GLYPHS[item.glyph](cc); else drawText(cc, item.text);
    const x = gap + (i % cols) * (cell + gap), y = gap + Math.floor(i / cols) * (cell + gap);
    sctx.drawImage(c, x, y);
});
fs.writeFileSync(path.join(OUT, '_contact-sheet.png'), sheet.toBuffer('image/png'));

console.log(`Generated ${ITEMS.length} emojis + contact sheet in ${OUT}`);
