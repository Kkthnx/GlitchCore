// Generates branded custom-emoji PNGs (128x128) for Glitch Haven — upload them
// under Server Settings → Emoji (base servers have 50 slots, no boost needed).
// Two styles: clean "badge" (roles/regions/platforms) and "glitch" (chromatic
// aberration + scanlines) reaction emojis.
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
    return `rgb(${clamp((n >> 16) + amt)},${clamp(((n >> 8) & 255) + amt)},${clamp((n & 255) + amt)})`;
}
function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function fitFont(ctx, text, maxW, start = 62) {
    let size = start;
    ctx.font = `${size}px Rajdhani`;
    while (ctx.measureText(text).width > maxW && size > 16) { size -= 2; ctx.font = `${size}px Rajdhani`; }
    return size;
}

// ── Clean glossy badge ───────────────────────────────────────────────────────
function badge(ctx, color) {
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
function badgeText(ctx, text) {
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitFont(ctx, text, S * 0.66);
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
    star(ctx) { const cx = S / 2, cy = S / 2 + 2, R = 34, r = 14, p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R; p.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); } poly(ctx, p); },
    bolt(ctx) { poly(ctx, [[70, 24], [40, 70], [58, 70], [50, 104], [86, 56], [66, 56]]); },
    play(ctx) { poly(ctx, [[48, 38], [92, 64], [48, 90]]); },
    crown(ctx) { poly(ctx, [[34, 84], [34, 50], [50, 66], [64, 42], [78, 66], [94, 50], [94, 84]]); },
    heart(ctx) { ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2; ctx.beginPath(); ctx.moveTo(64, 96); ctx.bezierCurveTo(20, 66, 36, 34, 64, 54); ctx.bezierCurveTo(92, 34, 108, 66, 64, 96); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; },
};

// ── Glitch style (chromatic aberration + scanlines + neon bars) ──────────────
function glitch(ctx, text, accent) {
    ctx.clearRect(0, 0, S, S);
    // dark panel
    roundRect(ctx, 6, 6, S - 12, S - 12, 24);
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#0c1018'); g.addColorStop(1, '#05070c');
    ctx.fillStyle = g; ctx.fill();
    ctx.save();
    roundRect(ctx, 6, 6, S - 12, S - 12, 24); ctx.clip();

    // neon accent bars behind the text
    ctx.fillStyle = rgba(accent, 0.20);
    ctx.fillRect(0, 40, S, 8);
    ctx.fillRect(0, 84, S, 5);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitFont(ctx, text, S * 0.74, 60);
    const cx = S / 2, cy = S / 2 + 2;
    // chromatic split
    ctx.fillStyle = '#00e6ff'; ctx.fillText(text, cx - 4, cy - 1);
    ctx.fillStyle = '#ff2d6b'; ctx.fillText(text, cx + 4, cy + 1);
    ctx.fillStyle = accent; ctx.globalAlpha = 0.5; ctx.fillText(text, cx, cy);
    ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.fillText(text, cx, cy);

    // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 8; y < S - 8; y += 4) ctx.fillRect(8, y, S - 16, 2);
    // a bright glitch slice
    ctx.fillStyle = rgba(accent, 0.9);
    ctx.fillRect(8, 58, 26, 3);
    ctx.fillStyle = '#00e6ff'; ctx.fillRect(S - 40, 72, 22, 2);
    ctx.restore();

    roundRect(ctx, 7.5, 7.5, S - 15, S - 15, 22);
    ctx.lineWidth = 2; ctx.strokeStyle = rgba(accent, 0.6); ctx.stroke();
}

// ── Item catalog ─────────────────────────────────────────────────────────────
const BADGES = [
    { name: 'doublexp', text: '2X', color: '#f0b429' }, { name: 'boost', glyph: 'bolt', color: '#f0b429' },
    { name: 'mvp', glyph: 'star', color: '#f0b429' }, { name: 'vip', glyph: 'crown', color: '#b483ff' },
    { name: 'live', text: 'LIVE', color: '#ff6b6b' }, { name: 'stream', glyph: 'play', color: '#b483ff' },
    { name: 'news', text: 'NEWS', color: '#5cc8ff' }, { name: 'events', text: 'EVT', color: '#34d3b4' },
    { name: 'love', glyph: 'heart', color: '#ff5fd0' },
    { name: 'region_na', text: 'NA', color: '#5cc8ff' }, { name: 'region_eu', text: 'EU', color: '#34d3b4' },
    { name: 'region_oce', text: 'OCE', color: '#b483ff' }, { name: 'region_asia', text: 'ASIA', color: '#f0b429' },
    { name: 'plat_pc', text: 'PC', color: '#5cc8ff' }, { name: 'plat_xb', text: 'XB', color: '#2fe07a' },
    { name: 'plat_ps', text: 'PS', color: '#5cc8ff' }, { name: 'plat_ns', text: 'NS', color: '#ff6b6b' },
];

const GLITCH = [
    ['gg', '#2fe07a'], ['ez', '#f0b429'], ['ggez', '#b483ff'], ['pog', '#ff5fd0'], ['poggers', '#ff5fd0'],
    ['lol', '#5cc8ff'], ['lmao', '#5cc8ff'], ['f', '#ff6b6b'], ['w', '#2fe07a'], ['l', '#ff6b6b'],
    ['rip', '#b483ff'], ['omg', '#f0b429'], ['wow', '#5cc8ff'], ['sus', '#34d3b4'], ['based', '#2fe07a'],
    ['hype', '#ff5fd0'], ['rage', '#ff6b6b'], ['cope', '#b483ff'], ['mald', '#ff6b6b'], ['salt', '#34d3b4'],
    ['ko', '#f0b429'], ['glhf', '#5cc8ff'], ['wp', '#2fe07a'], ['oof', '#f0b429'], ['clutch', '#5cc8ff'],
    ['noob', '#ff6b6b'], ['pro', '#2fe07a'], ['afk', '#34d3b4'], ['gigachad', '#f0b429'], ['bonk', '#b483ff'],
].map(([name, color]) => ({ name, text: name.toUpperCase(), color, style: 'glitch' }));

const ITEMS = [...BADGES, ...GLITCH];

function render(item) {
    const canvas = createCanvas(S, S);
    const ctx = canvas.getContext('2d');
    if (item.style === 'glitch') { glitch(ctx, item.text, item.color); return canvas; }
    badge(ctx, item.color);
    if (item.glyph) GLYPHS[item.glyph](ctx); else badgeText(ctx, item.text);
    return canvas;
}

for (const item of ITEMS) {
    fs.writeFileSync(path.join(OUT, `${item.name}.png`), render(item).toBuffer('image/png'));
}

function contactSheet(items, file) {
    const cols = 6, rows = Math.ceil(items.length / cols), cell = 128, gap = 16;
    const sheet = createCanvas(cols * cell + (cols + 1) * gap, rows * cell + (rows + 1) * gap);
    const sc = sheet.getContext('2d');
    sc.fillStyle = '#0b1220'; sc.fillRect(0, 0, sheet.width, sheet.height);
    items.forEach((item, i) => {
        const x = gap + (i % cols) * (cell + gap), y = gap + Math.floor(i / cols) * (cell + gap);
        sc.drawImage(render(item), x, y);
    });
    fs.writeFileSync(path.join(OUT, file), sheet.toBuffer('image/png'));
}
contactSheet(BADGES, '_contact-badges.png');
contactSheet(GLITCH, '_contact-glitch.png');

console.log(`Generated ${ITEMS.length} emojis (${BADGES.length} badge + ${GLITCH.length} glitch) in ${OUT}`);
