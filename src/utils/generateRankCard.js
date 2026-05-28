const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// Optional: Load a custom font if you have one in your assets folder
// GlobalFonts.registerFromPath('./assets/Rajdhani-Bold.ttf', 'Rajdhani');

async function buildRankCard(user, currentXp, requiredXp, level, rank) {
    // 1. Setup Canvas (800x250 is a great size for Discord embeds)
    const canvas = createCanvas(800, 250);
    const ctx = canvas.getContext('2d');

    // 2. Draw Background (Dark Silver/Grey)
    ctx.fillStyle = '#1A1A1D'; // Very dark grey, almost black
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Optional: Load a background image from your assets folder if you want a texture
    // const bg = await loadImage('./assets/default-bg.png');
    // ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

    // 3. Draw Inner Border (Silver Accents)
    ctx.strokeStyle = '#C0C0C0'; // Silver
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

    // 5. Draw Avatar Border (Blue)
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
    ctx.strokeStyle = '#0052CC'; // GlitchHaven Blue
    ctx.lineWidth = 6;
    ctx.stroke();

    // 6. Draw Text (Username, Rank, Level)
    ctx.fillStyle = '#FFFFFF'; // White for high contrast
    ctx.font = 'bold 36px sans-serif'; // Change to 'Rajdhani' if loaded
    ctx.fillText(user.username, 220, 80);

    ctx.fillStyle = '#C0C0C0'; // Silver
    ctx.font = '28px sans-serif';
    ctx.fillText(`Rank #${rank}  |  Level ${level}`, 220, 125);

    // 7. Draw XP Progress Bar Background (Darker Grey)
    const barX = 220;
    const barY = 160;
    const barWidth = 520;
    const barHeight = 30;
    const cornerRadius = 15;

    ctx.fillStyle = '#0F0F11';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, cornerRadius);
    ctx.fill();

    // 8. Draw XP Progress Bar Fill (Blue)
    // Calculate percentage, maxing at 100% to prevent bar overflowing
    const progressPercent = Math.min(currentXp / requiredXp, 1);
    const currentBarWidth = barWidth * progressPercent;

    if (currentBarWidth > 0) {
        ctx.fillStyle = '#0052CC'; // GlitchHaven Blue
        ctx.beginPath();
        ctx.roundRect(barX, barY, currentBarWidth, barHeight, cornerRadius);
        ctx.fill();
    }

    // 9. Draw XP Text centered over the bar
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${currentXp} / ${requiredXp} XP`, barX + barWidth / 2, barY + barHeight / 1.7);
    ctx.textAlign = 'left'; // reset for any future drawing

    // Return the image buffer to be sent in Discord
    return canvas.toBuffer('image/png');
}

module.exports = buildRankCard;