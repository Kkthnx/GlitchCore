const GuildConfig = require('../database/GuildConfigSchema');
const { invalidateGuildConfig } = require('../utils/guildConfigCache');
const logger = require('../utils/logger');

// When a role is deleted in Discord, scrub every reference to it from the guild
// config so the self-assign menu and feature pings never point at a dead role.
module.exports = {
    name: 'roleDelete',
    async execute(role) {
        try {
            const cfg = await GuildConfig.findOne({ guildId: role.guild.id });
            if (!cfg) return;
            let changed = false;

            const selfBefore = cfg.selfRoles.length;
            cfg.selfRoles = cfg.selfRoles.filter(r => r.roleId !== role.id);
            if (cfg.selfRoles.length !== selfBefore) changed = true;

            const rewardBefore = cfg.levelRewardRoles.length;
            cfg.levelRewardRoles = cfg.levelRewardRoles.filter(r => r.roleId !== role.id);
            if (cfg.levelRewardRoles.length !== rewardBefore) changed = true;

            for (const key of ['doubleXpRoleId', 'streamerPingRoleId']) {
                if (cfg[key] === role.id) { cfg[key] = null; changed = true; }
            }

            if (changed) {
                await cfg.save();
                invalidateGuildConfig(role.guild.id);
                logger.info(`[ROLES] Scrubbed deleted role ${role.id} from ${role.guild.id} config.`);
            }
        } catch (err) {
            logger.error('roleDelete cleanup failed:', err);
        }
    },
};
