const { PermissionFlagsBits } = require('discord.js');
const config = require('../../config.json');
const { getXpMultiplier } = require('../utils/isDoubleXp');
const { checkMessage, getRandomClapback } = require('../utils/filterManager');
const { recordAndCheckRate, resetRate, containsInvite, mentionCount } = require('../utils/antiSpam');
const { recordInfraction } = require('../utils/moderationManager');
const { queueXp } = require('../utils/xpCache');
const { getGuildConfig } = require('../utils/guildConfigCache');
const logger = require('../utils/logger');

const AS = config.moderation?.antiSpam || {};

// Returns true if the message was actioned (and XP/further processing skipped).
async function runAntiSpam(message) {
    // Members who can manage messages are trusted and exempt.
    if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

    const key = `${message.author.id}-${message.guild.id}`;
    const timeoutMs = (AS.timeoutMinutes ?? 5) * 60 * 1000;

    // 1. Invite links
    if (AS.blockInvites && containsInvite(message.content)) {
        await message.delete().catch(() => {});
        const warn = await message.channel.send(`<@${message.author.id}>, posting invite links isn't allowed here.`).catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => {}), 6000);
        await recordInfraction({ guild: message.guild, targetUser: message.author, moderator: message.client.user, type: 'warn', reason: 'Auto-mod: posted an invite link' });
        return true;
    }

    // 2. Mass mentions
    if (mentionCount(message) > (AS.maxMentions ?? 5)) {
        await message.delete().catch(() => {});
        if (message.member?.moderatable) {
            await message.member.timeout(timeoutMs, 'Auto-mod: mass mentions').catch(() => {});
            await recordInfraction({ guild: message.guild, targetUser: message.author, moderator: message.client.user, type: 'timeout', reason: 'Auto-mod: mass mentions', durationMs: timeoutMs });
        }
        return true;
    }

    // 3. Rapid-fire message flooding
    const tripped = recordAndCheckRate(key, Date.now(), AS.maxMessages ?? 5, (AS.windowSeconds ?? 5) * 1000);
    if (tripped && message.member?.moderatable) {
        resetRate(key);
        await message.member.timeout(timeoutMs, 'Auto-mod: message flooding').catch(() => {});
        await recordInfraction({ guild: message.guild, targetUser: message.author, moderator: message.client.user, type: 'timeout', reason: 'Auto-mod: message flooding', durationMs: timeoutMs });
        await message.channel.send(`<@${message.author.id}> was timed out for spamming.`).then(m => setTimeout(() => m.delete().catch(() => {}), 6000)).catch(() => {});
        return true;
    }

    return false;
}

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

        // 2b. Anti-spam / anti-raid (invites, mass mentions, flooding)
        if (guildConfig.antiSpamEnabled !== false && AS.enabled !== false) {
            try {
                if (await runAntiSpam(message)) return;
            } catch (err) {
                logger.error('Anti-spam check failed:', err);
            }
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