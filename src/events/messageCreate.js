const config = require('../../config.json');
const { getXpMultiplier } = require('../utils/isDoubleXp');
const { checkMessage, getRandomClapback } = require('../utils/filterManager');
const { queueXp } = require('../utils/xpCache');
const { getGuildConfig } = require('../utils/guildConfigCache');
const logger = require('../utils/logger');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // 1. Ignore bot messages and DMs
        if (message.author.bot || !message.guild) return;

        // 2. Auto-Moderator Check
        const searchValues = [message.content];

        for (const attachment of message.attachments.values()) {
            if (attachment.name) searchValues.push(attachment.name);
            if (attachment.url) searchValues.push(attachment.url);
        }

        for (const sticker of message.stickers.values()) {
            if (sticker.name) searchValues.push(sticker.name);
        }

        for (const embed of message.embeds) {
            if (embed.title) searchValues.push(embed.title);
            if (embed.description) searchValues.push(embed.description);
            if (embed.fields) {
                for (const field of embed.fields) {
                    searchValues.push(field.name, field.value);
                }
            }
        }

        const filterViolation = checkMessage(searchValues.join(' '));
        if (filterViolation) {
            try {
                await message.delete();
                logger.info(`[MOD] Deleted message from ${message.author.tag}: "${message.content.slice(0, 50)}${message.content.length > 50 ? '…' : ''}" (Trigger: ${filterViolation})`);

                const clapbackMsg = await message.channel.send(getRandomClapback(`<@${message.author.id}>`));

                // Auto-delete the clapback after 5 seconds to keep chat clean
                setTimeout(() => clapbackMsg.delete().catch(() => { }), 5000);
            } catch (err) {
                logger.error('Failed to moderate message:', err);
            }
            return; // Stop processing XP and commands for this message
        }

        const guildConfig = await getGuildConfig(message.guild.id) || {};
        if (guildConfig.xpEnabled === false) return;

        const minBaseXp = guildConfig.minBaseXp ?? config.xpSettings.minBaseXp;
        const maxBaseXp = guildConfig.maxBaseXp ?? config.xpSettings.maxBaseXp;
        const lengthMultiplier = guildConfig.lengthMultiplier ?? config.xpSettings.lengthMultiplier;
        const maxTextXpPerMessage = guildConfig.maxTextXpPerMessage ?? config.xpSettings.maxTextXpPerMessage;
        const textCooldownSeconds = guildConfig.textCooldownSeconds ?? config.xpSettings.textCooldownSeconds;

        // 3. Cooldown Check (Timestamp-based instead of setTimeout for performance)
        const cooldownKey = `${message.author.id}-${message.guild.id}`;
        const now = Date.now();
        const lastMessageTime = client.cooldowns.get(cooldownKey) || 0;

        if (now - lastMessageTime < (textCooldownSeconds * 1000)) return;

        // Update cooldown timestamp
        client.cooldowns.set(cooldownKey, now);

        // 4. Calculate Dynamic XP
        const baseXP = Math.floor(Math.random() * (maxBaseXp - minBaseXp + 1)) + minBaseXp;
        const lengthBonus = Math.floor(message.content.length * lengthMultiplier);
        let totalXpGained = Math.min(baseXP + lengthBonus, maxTextXpPerMessage);

        // Apply double XP multiplier if today is a bonus day
        totalXpGained = Math.floor(totalXpGained * getXpMultiplier());

        try {
            // 5. Queue XP in memory (Bulk written every 60s to prevent DB bottleneck)
            queueXp(message.author.id, message.guild.id, totalXpGained, message.channel.id);
        } catch (error) {
            logger.error('Error queueing text XP:', error);
        }
    }
};