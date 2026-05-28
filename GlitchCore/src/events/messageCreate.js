const User = require('../database/UserSchema');
const { xpRequiredForLevel } = require('../utils/calculateXp');
const { getXpMultiplier, isDoubleXpActive } = require('../utils/isDoubleXp');
const config = require('../../config.json');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // 1. Ignore bot messages and DMs
        if (message.author.bot || !message.guild) return;

        // 2. Cooldown Check (Prevents spamming for XP)
        const cooldownKey = `${message.author.id}-${message.guild.id}`;
        if (client.cooldowns.has(cooldownKey)) return;

        // 3. Calculate Dynamic XP
        const { minBaseXp, maxBaseXp, lengthMultiplier, maxTextXpPerMessage, textCooldownSeconds } = config.xpSettings;

        const baseXP = Math.floor(Math.random() * (maxBaseXp - minBaseXp + 1)) + minBaseXp;
        const lengthBonus = Math.floor(message.content.length * lengthMultiplier);
        let totalXpGained = Math.min(baseXP + lengthBonus, maxTextXpPerMessage);

        // Apply double XP multiplier if today is a bonus day
        totalXpGained = Math.floor(totalXpGained * getXpMultiplier());

        try {
            // 4. Fetch or create user document
            let userData = await User.findOneAndUpdate(
                { userId: message.author.id, guildId: message.guild.id },
                { $inc: { xp: totalXpGained, totalMessages: 1 } },
                { upsert: true, new: true }
            );

            // 5. Check for Level Up — use a while loop so rapid XP gain can't skip levels
            while (userData.xp >= xpRequiredForLevel(userData.level + 1)) {
                userData.level += 1;

                const levelUpEmbed = new EmbedBuilder()
                    .setTitle('⬆️ Level Up!')
                    .setDescription(
                        `Congratulations ${message.author}! You just hit **Level ${userData.level}**!` +
                        (isDoubleXpActive() ? '\n\n🔥 **Double XP Weekend** — you\'re earning 2× XP today!' : '')
                    )
                    .setColor(config.theme.silver)
                    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }));

                // Fire and forget — don't await so it doesn't block the save
                message.channel.send({ embeds: [levelUpEmbed] }).catch(console.error);
            }

            // 6. Save updated level to DB & apply cooldown
            await userData.save();

            client.cooldowns.set(cooldownKey, true);
            setTimeout(() => client.cooldowns.delete(cooldownKey), textCooldownSeconds * 1000);

        } catch (error) {
            console.error('Error processing text XP:', error);
        }
    }
};