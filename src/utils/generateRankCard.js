const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const themes = require('./cardThemes');

// Load custom fonts for text rendering on Windows/Linux environments
GlobalFonts.registerFromPath(path.join(__dirname, '../assets/Rajdhani-Bold.ttf'), 'Rajdhani');
GlobalFonts.registerFromPath(path.join(__dirname, '../assets/Rajdhani-Regular.ttf'), 'Rajdhani-Regular');

async function buildRankCard(user, currentXp, requiredXp, level, rank, themeId = 'default') {
    const theme = themes[themeId] || themes['default'];

    // 1. Setup Canvas (800x250 is a great size for Discord embeds)
    const canvas = createCanvas(800, 250);
    const ctx = canvas.getContext('2d');

    // 2. Draw Background
    ctx.fillStyle = theme.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Optional: Load a background image from your assets folder if you want a texture
    // const bg = await loadImage('./assets/default-bg.png');
    // ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

    // 3. Draw Inner Border
    ctx.strokeStyle = theme.borderColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    // 4. Load & Draw Avatar (Circular)
    const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
    const avatarX = 40;
    const avatarY = 40;
    const avatarSize = 150;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    // 5. Draw Avatar Border
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
    ctx.strokeStyle = theme.avatarBorderColor;
    ctx.lineWidth = 6;
    ctx.stroke();

    // 6. Draw Text (Username, Rank, Level)
    ctx.fillStyle = theme.textColor;
    ctx.font = '36px "Rajdhani"'; // Change to 'Rajdhani' if loaded
    // Fallback if user doesn't have a username for some reason
    ctx.fillText(user.username || user.globalName || 'User', 220, 80);

    ctx.fillStyle = theme.subTextColor;
    ctx.font = '28px "Rajdhani-Regular"';
    ctx.fillText(`Rank #${rank}  |  Level ${level}`, 220, 125);

    // 7. Draw XP Progress Bar Background
    const barX = 220;
    const barY = 160;
    const barWidth = 520;
    const barHeight = 30;
    const cornerRadius = 15;

    ctx.fillStyle = theme.progressBarBg;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, cornerRadius);
    ctx.fill();

    // 8. Draw XP Progress Bar Fill
    // Calculate percentage, maxing at 100% to prevent bar overflowing
    const progressPercent = Math.min(currentXp / requiredXp, 1);
    const currentBarWidth = barWidth * progressPercent;

    if (currentBarWidth > 0) {
        ctx.fillStyle = theme.progressBarFill;
        ctx.beginPath();
        ctx.roundRect(barX, barY, currentBarWidth, barHeight, cornerRadius);
        ctx.fill();
    }

    // 9. Draw XP Text centered over the bar
    ctx.fillStyle = theme.textColor;
    ctx.font = '18px "Rajdhani"';
    ctx.textAlign = 'center';
    ctx.fillText(`${currentXp} / ${requiredXp} XP`, barX + barWidth / 2, barY + barHeight / 1.7 + 2);
    ctx.textAlign = 'left'; // reset for any future drawing

    // Return the image buffer to be sent in Discord
    return canvas.toBuffer('image/png');
}

module.exports = buildRankCard;