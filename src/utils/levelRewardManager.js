const GuildConfig = require('../database/GuildConfigSchema');
const logger = require('./logger');

async function applyLevelRewards(userId, guildId, level, client, member = null) {
    const config = await GuildConfig.findOne({ guildId });
    if (!config?.levelRewardRoles?.length) return;

    if (!member) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;
        member = await guild.members.fetch(userId).catch(() => null);
    }

    if (!member) return;

    const rewards = config.levelRewardRoles.filter(reward => reward.level === level);
    if (!rewards.length) return;

    for (const reward of rewards) {
        try {
            if (!member.roles.cache.has(reward.roleId)) {
                await member.roles.add(reward.roleId, 'Level reward');
                logger.info(`[LEVEL_REWARD] Granted role ${reward.roleId} to ${userId} for level ${level}`);
            }
        } catch (err) {
            logger.error(`[LEVEL_REWARD] Failed to grant role ${reward.roleId} to ${userId}:`, err);
        }
    }
}

module.exports = { applyLevelRewards };