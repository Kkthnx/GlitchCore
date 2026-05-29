const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const themes = require('./cardThemes');
const fs = require('fs');

// Load custom fonts
GlobalFonts.registerFromPath(path.join(__dirname, '../assets/Rajdhani-Bold.ttf'), 'Rajdhani');
GlobalFonts.registerFromPath(path.join(__dirname, '../assets/Rajdhani-Regular.ttf'), 'Rajdhani-Regular');

// Helper to draw the sci-fi angled boxes
function drawAngledBox(ctx, x, y, w, h, cut) {
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
}

async function buildRankCard(user, currentXp, requiredXp, level, rank, themeId = 'default') {
    const theme = themes[themeId] || themes['default'];

    // 1. Setup Canvas (950x300 for the new wide sci-fi layout)
    const canvas = createCanvas(950, 300);
    const ctx = canvas.getContext('2d');

    // 2. Draw Background & Overlay Tint
    // Fallback to pure color if the user hasn't downloaded glitch-bg.png yet
    const bgPath = path.join(__dirname, '../assets/glitch-bg.png');
    if (fs.existsSync(bgPath)) {
        const bg = await loadImage(bgPath);
        ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
        
        // Dynamic tinting using the theme's avatar color
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = theme.avatarBorderColor;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
    } else {
        ctx.fillStyle = theme.bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 3. Cyberpunk Avatar HUD (Left side)
    const avatarX = 140;
    const avatarY = 135;
    const avatarRadius = 65;

    // Draw HUD Rings
    ctx.strokeStyle = theme.avatarBorderColor;
    
    // Outer dashed ring
    ctx.lineWidth = 6;
    ctx.setLineDash([20, 15, 40, 15]);
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 20, 0, Math.PI * 2);
    ctx.stroke();
    
    // Inner solid ring
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 10, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Load & Draw Circular Avatar
    const avatarUrl = user.displayAvatarURL ? user.displayAvatarURL({ extension: 'png', size: 256 }) : user.avatarURL;
    if (avatarUrl) {
        try {
            const avatar = await loadImage(avatarUrl);
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
            ctx.restore();
        } catch (err) {
            console.error('Failed to load avatar', err);
        }
    }

    // 5. Draw Angled Data Boxes
    const boxX = 280;
    let boxY = 40;
    const boxW = 380;
    const boxH = 45;
    const boxCut = 12;

    ctx.lineWidth = 2;
    ctx.strokeStyle = theme.borderColor;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // Semi-transparent black background for readability

    const drawDataBox = (label, value) => {
        // Draw the angled box
        drawAngledBox(ctx, boxX, boxY, boxW, boxH, boxCut);
        ctx.fill();
        ctx.stroke();

        // Draw the text
        ctx.font = '24px "Rajdhani-Regular"';
        ctx.fillStyle = theme.subTextColor;
        ctx.textAlign = 'left';
        ctx.fillText(label, boxX + 20, boxY + 30);

        ctx.font = '30px "Rajdhani"';
        ctx.fillStyle = theme.textColor;
        ctx.textAlign = 'right';
        ctx.fillText(value, boxX + boxW - 20, boxY + 32);

        boxY += boxH + 15; // Move down for the next box
    };

    const usernameStr = (user.username || user.globalName || 'USER').toUpperCase();
    drawDataBox('USERNAME:', `[${usernameStr}]`);
    drawDataBox('LEVEL:', `${level}  (RANK #${rank})`);
    drawDataBox('XP PROGRESS:', `${currentXp.toLocaleString()} / ${requiredXp.toLocaleString()}`);

    // 6. Cyberpunk Progress Bar (Bottom)
    const barX = 40;
    const barY = 240;
    const barW = 870;
    const barH = 25;
    const barCut = 8;

    // Bar background
    ctx.fillStyle = theme.progressBarBg;
    ctx.strokeStyle = theme.borderColor;
    ctx.lineWidth = 2;
    drawAngledBox(ctx, barX, barY, barW, barH, barCut);
    ctx.fill();
    ctx.stroke();

    // Bar Fill
    const progressPercent = Math.min(currentXp / requiredXp, 1);
    const fillW = Math.max(barCut * 2, barW * progressPercent);
    
    if (progressPercent > 0) {
        ctx.fillStyle = theme.progressBarFill;
        drawAngledBox(ctx, barX, barY, fillW, barH, barCut);
        ctx.fill();
        
        // Add a bright cap to the end of the progress bar for a glowing effect
        ctx.fillStyle = '#FFFFFF';
        drawAngledBox(ctx, barX + fillW - 10, barY, 10, barH, barCut);
        ctx.fill();
    }

    // 7. System Warning Text (Right side under GH logo)
    ctx.textAlign = 'center';
    ctx.font = '16px "Rajdhani"';
    ctx.fillStyle = theme.subTextColor;
    
    // Draw an angled bracket box around the system text
    ctx.beginPath();
    ctx.moveTo(700, 150);
    ctx.lineTo(690, 160);
    ctx.lineTo(690, 210);
    ctx.lineTo(700, 220);
    
    ctx.moveTo(900, 150);
    ctx.lineTo(910, 160);
    ctx.lineTo(910, 210);
    ctx.lineTo(900, 220);
    ctx.strokeStyle = theme.borderColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillText("YOUR COMMUNITY DATA", 800, 180);
    ctx.fillText("SECURED AND PROCESSED", 800, 200);
    ctx.fillStyle = theme.avatarBorderColor;
    ctx.fillText("BY [GLITCH_SYSTEM]", 800, 220);

    return canvas.toBuffer('image/png');
}

module.exports = buildRankCard;