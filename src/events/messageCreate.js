/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const config = require('../../config.json');
const { getXpMultiplier } = require('../utils/isDoubleXp');
const { evaluateContentFilter, enforceContentFilter, runAntiSpam } = require('../utils/autoMod');
const { clearAfk, getAfk } = require('../utils/afkManager');
const { queueXp } = require('../utils/xpCache');
const { getGuildConfig } = require('../utils/guildConfigCache');
const logger = require('../utils/logger');

const AS = config.moderation?.antiSpam || {};

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // 1. Ignore bot messages and DMs
        if (message.author.bot || !message.guild) return;

        // The guild's settings drive everything below, and the read is cached, so
        // it happens once up front rather than midway through.
        const guildConfig = await getGuildConfig(message.guild.id) || {};

        // 2. Auto-Moderator Check (word filter, then anti-spam). Anything caught
        // stops here, so flagged messages never earn XP.
        const violation = evaluateContentFilter(message, guildConfig);
        if (violation) {
            await enforceContentFilter(message, violation, guildConfig);
            return;
        }

        if (guildConfig.antiSpamEnabled !== false && AS.enabled !== false) {
            try {
                if (await runAntiSpam(message, guildConfig)) return;
            } catch (err) {
                logger.error('Anti-spam check failed:', err);
            }
        }

        // 2c. AFK, clear the author's AFK; note any AFK users they pinged.
        try {
            const back = clearAfk(message.guild.id, message.author.id);
            if (back) {
                message.reply({ content: '👋 Welcome back, I cleared your AFK.', allowedMentions: { repliedUser: false } })
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
            }
            const pinged = message.mentions.users.filter(u => getAfk(message.guild.id, u.id));
            if (pinged.size) {
                const lines = pinged.map(u => {
                    const a = getAfk(message.guild.id, u.id);
                    return `💤 **${u.username}** is AFK: ${a.reason} (<t:${Math.floor(a.since / 1000)}:R>)`;
                });
                message.reply({ content: lines.join('\n'), allowedMentions: { repliedUser: false } }).catch(() => {});
            }
        } catch (err) {
            logger.error('AFK handling failed:', err);
        }

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
