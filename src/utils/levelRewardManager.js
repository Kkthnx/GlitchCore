/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const GuildConfig = require('../database/GuildConfigSchema');
const { PALETTE } = require('./brand');
const { currentMilestone, roleNameFor, milestoneNameRegex } = require('./levelRoles');
const logger = require('./logger');

// Ensures a member holds the milestone role for their current level, creating
// the role on demand and (unless stacking is enabled) removing superseded
// milestone roles so they read as a single prestige rank.
async function applyMilestoneRole(member, level, config) {
    const interval = config.levelRoleInterval;
    if (!interval || interval < 1) return;

    const milestone = currentMilestone(level, interval, config.levelRoleMax || 1000);
    if (!milestone) return;

    const guild = member.guild;
    const name = roleNameFor(config.levelRoleTemplate, milestone);

    let role = guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (!role) {
        role = await guild.roles.create({
            name,
            colors: { primaryColor: PALETTE.accent },
            reason: `Milestone role for level ${milestone}`,
        }).catch(err => {
            logger.error(`[LEVEL_ROLE] Could not create milestone role "${name}": ${err.message}`);
            return null;
        });
        if (!role) return;
    }

    if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role.id, 'Level milestone reached').catch(err =>
            logger.error(`[LEVEL_ROLE] Failed to add ${name} to ${member.id}: ${err.message}`));
    }

    if (!config.levelRoleStack) {
        const re = milestoneNameRegex(config.levelRoleTemplate);
        const superseded = member.roles.cache.filter(r => r.id !== role.id && re.test(r.name));
        for (const old of superseded.values()) {
            await member.roles.remove(old.id, 'Superseded by higher milestone').catch(() => {});
        }
    }
}

async function applyLevelRewards(userId, guildId, level, client, member = null) {
    const config = await GuildConfig.findOne({ guildId });
    // Nothing to do if neither explicit rewards nor milestone roles are set up.
    if (!config || (!config.levelRewardRoles?.length && !config.levelRoleInterval)) return;

    if (!member) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;
        member = await guild.members.fetch(userId).catch(() => null);
    }

    if (!member) return;

    // 1. Explicit per-level reward roles (configured via /settings reward).
    const rewards = (config.levelRewardRoles || []).filter(reward => reward.level === level);
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

    // 2. Automated milestone level-role (e.g. every 10 levels).
    try {
        await applyMilestoneRole(member, level, config);
    } catch (err) {
        logger.error(`[LEVEL_ROLE] Milestone application failed for ${userId}:`, err);
    }
}

module.exports = { applyLevelRewards, applyMilestoneRole };