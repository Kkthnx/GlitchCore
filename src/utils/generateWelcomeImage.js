const { createCanvas, loadImage } = require('@napi-rs/canvas');

async function buildWelcomeImage(user) {
    // 1. Setup Canvas
    const canvas = createCanvas(1024, 450);
    const ctx = canvas.getContext('2d');

    // 2. Draw Background (Dark Silver/Grey)
    ctx.fillStyle = '#1A1A1D';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 3. Draw Outer Border (Silver)
    ctx.strokeStyle = '#C0C0C0';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // 4. Draw Inner Accent Line (GlitchHaven Blue)
    ctx.strokeStyle = '#0052CC';
    ctx.lineWidth = 4;
    ctx.strokeRect(15, 15, canvas.width - 30, canvas.height - 30);

    // 5. Load & Draw Avatar (Circular) in the center
    const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
    const avatarSize = 200;
    const avatarX = (canvas.width / 2) - (avatarSize / 2);
    const avatarY = 80;

    ctx.save();
    ctx.beginPath();
    ctx.arc(canvas.width / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    // 6. Draw Avatar Border (Silver)
    ctx.beginPath();
    ctx.arc(canvas.width / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
    ctx.strokeStyle = '#C0C0C0';
    ctx.lineWidth = 6;
    ctx.stroke();

    // 7. Draw Welcome Text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Welcome to GlitchHaven,', canvas.width / 2, 350);

    // 8. Draw Username (GlitchHaven Blue)
    ctx.fillStyle = '#0052CC';
    ctx.font = 'bold 60px sans-serif';
    ctx.fillText(user.username.toUpperCase(), canvas.width / 2, 415);

    return canvas.toBuffer('image/png');
}

module.exports = buildWelcomeImage;