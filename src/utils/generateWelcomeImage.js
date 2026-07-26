/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

GlobalFonts.registerFromPath(path.join(__dirname, '../assets/Rajdhani-Bold.ttf'), 'Rajdhani');
GlobalFonts.registerFromPath(path.join(__dirname, '../assets/Rajdhani-Regular.ttf'), 'Rajdhani-Regular');

const W = 1024;
const H = 450;
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
function fitFont(ctx, text, maxW, start, font) {
    let size = start;
    ctx.font = `${size}px ${font}`;
    while (ctx.measureText(text).width > maxW && size > 18) {
        size -= 2;
        ctx.font = `${size}px ${font}`;
    }
    return size;
}
function fitText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 4 && ctx.measureText(t + '...').width > maxW) t = t.slice(0, -1);
    return t.replace(/[ ,]+$/, '') + '...';
}
function chromatic(ctx, text, x, y, base, off) {
    ctx.fillStyle = '#00e6ff';
    ctx.fillText(text, x - off, y - off / 2);
    ctx.fillStyle = '#ff2d6b';
    ctx.fillText(text, x + off, y + off / 2);
    ctx.fillStyle = base;
    ctx.fillText(text, x, y);
}

async function buildWelcomeImage(user, opts = {}) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Glitch background.
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0a1320');
    bg.addColorStop(0.55, '#070a12');
    bg.addColorStop(1, '#04060c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';
    for (const [bx, by, col] of [[W * 0.2, H * 0.25, GREEN], [W * 0.82, H * 0.8, '#5cc8ff']]) {
        const g = ctx.createRadialGradient(bx, by, 10, bx, by, 460);
        g.addColorStop(0, rgba(col, 0.22));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Terminal tag.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '26px Rajdhani';
    ctx.fillStyle = rgba(GREEN, 0.9);
    ctx.fillText('> USER.CONNECTED', 44, 56);

    // Avatar with a glowing green ring.
    const cx = W / 2;
    const cy = 150;
    const r = 92;
    ctx.save();
    ctx.shadowColor = GREEN;
    ctx.shadowBlur = 28;
    ctx.lineWidth = 6;
    ctx.strokeStyle = GREEN;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    try {
        const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
        ctx.restore();
    } catch {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Welcome line + glitch username.
    ctx.textAlign = 'center';
    ctx.font = '30px Rajdhani-Regular';
    ctx.fillStyle = 'rgba(203,213,230,0.85)';
    ctx.fillText('WELCOME TO GLITCH HAVEN', cx, 300);

    const name = (user.globalName || user.username || 'PLAYER').toUpperCase();
    const size = fitFont(ctx, name, W - 140, 74, 'Rajdhani');
    ctx.font = `${size}px Rajdhani`;
    chromatic(ctx, name, cx, 362, GREEN, 4);

    // Member number.
    if (opts.memberCount) {
        ctx.font = '26px Rajdhani';
        ctx.fillStyle = rgba('#5cc8ff', 0.95);
        ctx.fillText(`MEMBER #${opts.memberCount}`, cx, 398);
    }

    // Sly quip.
    if (opts.quip) {
        ctx.font = '24px Rajdhani-Regular';
        ctx.fillStyle = 'rgba(203,213,230,0.7)';
        ctx.fillText(fitText(ctx, opts.quip, W - 120), cx, 428);
    }

    // Scanlines.
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);

    // Neon border.
    roundRect(ctx, 4, 4, W - 8, H - 8, 18);
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(GREEN, 0.5);
    ctx.stroke();

    return canvas.toBuffer('image/png');
}

module.exports = buildWelcomeImage;
