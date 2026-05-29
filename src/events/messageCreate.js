const config = require('../../config.json');
const { getXpMultiplier } = require('../utils/isDoubleXp');
const { checkMessage, getRandomClapback } = require('../utils/filterManager');
const { queueXp } = require('../utils/xpCache');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // 1. Ignore bot messages and DMs
        if (message.author.bot || !message.guild) return;

        // 2. Auto-Moderator Check
        const filterViolation = checkMessage(message.content);
        if (filterViolation) {
            try {
                await message.delete();
                console.log(`[MOD] Deleted message from ${message.author.tag}: "${message.content}" (Trigger: ${filterViolation})`);

                const clapbackMsg = await message.channel.send(getRandomClapback(`<@${message.author.id}>`));
                
                // Auto-delete the clapback after 5 seconds to keep chat clean
                setTimeout(() => clapbackMsg.delete().catch(() => {}), 5000);
            } catch (err) {
                console.error('Failed to moderate message:', err);
            }
            return; // Stop processing XP and commands for this message
        }

        const { minBaseXp, maxBaseXp, lengthMultiplier, maxTextXpPerMessage, textCooldownSeconds } = config.xpSettings;

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
            console.error('Error queueing text XP:', error);
        }
    }
};