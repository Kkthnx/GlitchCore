const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const themes = require('./cardThemes');
const logger = require('./logger');

// Fonts
GlobalFonts.registerFromPath(path.join(__dirname, '../assets/Rajdhani-Bold.ttf'), 'Rajdhani');
GlobalFonts.registerFromPath(path.join(__dirname, '../assets/Rajdhani-Regular.ttf'), 'Rajdhani-Regular');

const W = 900;
const H = 280;

// ── low-level helpers ────────────────────────────────────────────────────────
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

function rgbGradient(ctx, x1, y1, x2, y2) {
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0.00, '#ff004c');
    g.addColorStop(0.20, '#ff7f00');
    g.addColorStop(0.40, '#ffe600');
    g.addColorStop(0.60, '#22e07a');
    g.addColorStop(0.80, '#3aa2ff');
    g.addColorStop(1.00, '#a24bff');
    return g;
}

function linearOf(ctx, colors, x1, y1, x2, y2) {
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    colors.forEach((c, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
    return g;
}

// Resolve a `bar`/fill spec into a canvas fill style.
function resolveFill(ctx, spec, x, y, w, fallback) {
    if (spec === 'rgb') return rgbGradient(ctx, x, y, x + w, y);
    if (Array.isArray(spec)) return linearOf(ctx, spec, x, y, x + w, y);
    return spec || fallback;
}

function truncate(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
    return t + '…';
}

// ── backgrounds (all drawn in-code — no external image) ──────────────────────
function drawBackground(ctx, bg) {
    const colors = bg.colors || ['#111', '#222'];
    const base = () => { ctx.fillStyle = linearOf(ctx, colors, 0, 0, W, H); ctx.fillRect(0, 0, W, H); };

    switch (bg.type) {
        case 'solid':
            ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, W, H); break;
        case 'radial': {
            ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, W, H);
            const g = ctx.createRadialGradient(W * 0.32, H * 0.35, 40, W * 0.32, H * 0.35, W * 0.75);
            g.addColorStop(0, colors[1] || colors[0]);
            g.addColorStop(1, colors[0]);
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            break;
        }
        case 'aurora': {
            ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'lighter';
            const blobs = [[W * 0.25, H * 0.2, colors[1]], [W * 0.75, H * 0.75, colors[2]], [W * 0.55, H * 0.4, colors[1]]];
            for (const [bx, by, col] of blobs) {
                const g = ctx.createRadialGradient(bx, by, 10, bx, by, 320);
                g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = 0.35; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            }
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
            break;
        }
        case 'carbon': {
            base();
            ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 2;
            for (let i = -H; i < W; i += 10) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); }
            break;
        }
        case 'dots': {
            base();
            ctx.fillStyle = bg.dot || 'rgba(255,255,255,0.06)';
            for (let y = 16; y < H; y += 26) for (let x = 16; x < W; x += 26) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); }
            break;
        }
        case 'grid': {
            base();
            ctx.strokeStyle = bg.grid || 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
            for (let x = 0; x <= W; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
            for (let y = 0; y <= H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
            break;
        }
        case 'stripes': {
            base();
            ctx.strokeStyle = bg.stripe || 'rgba(255,255,255,0.06)'; ctx.lineWidth = 14;
            for (let i = -H; i < W; i += 46) { ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + H, 0); ctx.stroke(); }
            break;
        }
        case 'linear':
        default:
            base();
    }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function buildRankCard(user, currentXp, requiredXp, level, rank, themeId = 'default') {
    const theme = themes[themeId] || themes.default;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Rounded card clip so all corners are soft.
    roundRect(ctx, 0, 0, W, H, 28);
    ctx.clip();

    drawBackground(ctx, theme.bg);

    // Subtle vignette for depth.
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    // Ghost level numeral (big, faint, behind content on the right).
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = theme.accent;
    ctx.font = '190px "Rajdhani"';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(level), W - 24, H / 2 + 6);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';

    // ── Avatar (left) with glowing ring ──────────────────────────────────────
    const cx = 112, cy = 118, r = 66;
    ctx.save();
    ctx.shadowColor = theme.ring === 'rgb' ? '#a24bff' : theme.accent;
    ctx.shadowBlur = 22;
    ctx.lineWidth = 6;
    ctx.strokeStyle = theme.ring === 'rgb'
        ? rgbGradient(ctx, cx - r, cy - r, cx + r, cy + r)
        : linearOf(ctx, [theme.accent, theme.accent2 || theme.accent], cx - r, cy - r, cx + r, cy + r);
    ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Avatar image (or a lettered placeholder).
    const url = user.displayAvatarURL ? user.displayAvatarURL({ extension: 'png', size: 256 }) : user.avatarURL;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    let drew = false;
    if (url) {
        try { ctx.drawImage(await loadImage(url), cx - r, cy - r, r * 2, r * 2); drew = true; }
        catch (err) { logger.error('Rank card: failed to load avatar', err.message); }
    }
    if (!drew) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.fillStyle = theme.text; ctx.font = '64px "Rajdhani"'; ctx.textAlign = 'center';
        ctx.fillText((user.username || 'U')[0].toUpperCase(), cx, cy + 22);
    }
    ctx.restore();

    // ── Text block ────────────────────────────────────────────────────────────
    const tx = 205;

    ctx.textAlign = 'left';
    ctx.fillStyle = theme.text;
    ctx.font = '46px "Rajdhani"';
    const name = (user.globalName || user.username || 'USER');
    ctx.fillText(truncate(ctx, name, 400), tx, 96);

    ctx.fillStyle = theme.sub;
    ctx.font = '26px "Rajdhani-Regular"';
    ctx.fillText(`RANK #${rank.toLocaleString()}`, tx, 132);

    // Hero level (top-right).
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.sub;
    ctx.font = '22px "Rajdhani-Regular"';
    ctx.fillText('LEVEL', W - 40, 66);
    ctx.fillStyle = theme.accent;
    ctx.font = '72px "Rajdhani"';
    ctx.fillText(String(level), W - 40, 128);

    // ── Progress bar ──────────────────────────────────────────────────────────
    const bx = tx, by = 212, bw = W - tx - 40, bh = 26, br = 13;
    const pct = requiredXp > 0 ? Math.max(0, Math.min(currentXp / requiredXp, 1)) : 1;

    // XP labels above the bar.
    ctx.font = '22px "Rajdhani-Regular"';
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.sub;
    ctx.fillText(`${Math.max(0, currentXp).toLocaleString()} / ${requiredXp.toLocaleString()} XP`, bx, by - 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.accent;
    ctx.fillText(`${Math.round(pct * 100)}%`, bx + bw, by - 12);

    // Track.
    roundRect(ctx, bx, by, bw, bh, br);
    ctx.fillStyle = theme.track; ctx.fill();

    // Fill.
    if (pct > 0) {
        const fw = Math.max(bh, bw * pct);
        ctx.save();
        roundRect(ctx, bx, by, fw, bh, br); ctx.clip();
        ctx.fillStyle = resolveFill(ctx, theme.bar, bx, by, bw, theme.accent);
        ctx.fillRect(bx, by, fw, bh);
        // Glossy highlight along the top of the fill.
        const gloss = ctx.createLinearGradient(0, by, 0, by + bh);
        gloss.addColorStop(0, 'rgba(255,255,255,0.35)');
        gloss.addColorStop(0.5, 'rgba(255,255,255,0)');
        ctx.fillStyle = gloss; ctx.fillRect(bx, by, fw, bh);
        ctx.restore();
    }

    // Brand wordmark under the avatar.
    ctx.textAlign = 'center';
    ctx.fillStyle = theme.sub;
    ctx.font = '18px "Rajdhani"';
    ctx.fillText('GLITCH HAVEN', cx, 210);

    // Crisp inner border to frame the rounded card.
    roundRect(ctx, 1, 1, W - 2, H - 2, 27);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.stroke();

    return canvas.toBuffer('image/png');
}

module.exports = buildRankCard;
