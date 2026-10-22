/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { AttachmentBuilder } = require('discord.js');
const buildWelcomeImage = require('../utils/generateWelcomeImage');
const { headlines, quips, pick } = require('../utils/welcomeSayings');
const { brandedEmbed, COLORS } = require('../utils/brand');
const { recordJoin } = require('../utils/joinFlood');
const { isRaidMode, setRaidMode, recordHeldJoin, AUTO_DURATION_MS } = require('../utils/raidMode');
const { getGuildConfig } = require('../utils/guildConfigCache');
const { logModAction } = require('../utils/moderationManager');
const { humanizeDuration } = require('../utils/duration');
const channels = require('../utils/channels');
const logger = require('../utils/logger');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        const guildConfig = await getGuildConfig(member.guild.id) || {};

        // Check the join rate first. Under a flood the welcome degrades to plain
        // text: the banner render is synchronous CPU that blocks the shard, and a
        // burst of DMs looks like spam to Discord. Everyone still gets welcomed.
        const { flooded, recent } = recordJoin(member.guild.id);

        // A flood trips raid mode automatically: joins get held (no role, no
        // DM, no welcome post) until it passes. Mods can also flip it by hand
        // with /raidmode before the automatic threshold trips.
        if (flooded && !isRaidMode(member.guild.id)) {
            setRaidMode(member.guild.id, true, AUTO_DURATION_MS, true);
            await logModAction({
                guild: member.guild,
                moderator: member.client.user,
                title: 'Raid mode auto-enabled',
                fields: [
                    { name: 'Joins', value: `${recent} in the last 20s`, inline: true },
                    { name: 'Duration', value: humanizeDuration(AUTO_DURATION_MS), inline: true },
                ],
            });
        }

        if (isRaidMode(member.guild.id)) {
            const held = recordHeldJoin(member.guild.id);
            logger.warn(`[WELCOME] Join held (raid mode, #${held}): ${member.user.tag} in ${member.guild.id}.`);
            return;
        }

        if (flooded) {
            logger.warn(`[WELCOME] ${recent} joins in the last 20s in ${member.guild.id}, sending plain welcomes until it settles.`);
        }

        // Account-age gating. Fresh alts are how bans get dodged, so accounts
        // younger than the threshold get flagged in the mod-log, and optionally
        // held with a timeout until a moderator reviews them.
        const minAgeDays = guildConfig.minAccountAgeDays ?? 7;
        if (minAgeDays > 0) {
            const ageMs = Date.now() - member.user.createdTimestamp;
            if (ageMs < minAgeDays * 24 * 60 * 60 * 1000) {
                const ageLabel = ageMs < 3600000
                    ? `${Math.max(1, Math.round(ageMs / 60000))}m`
                    : ageMs < 86400000
                        ? `${Math.round(ageMs / 3600000)}h`
                        : `${(ageMs / 86400000).toFixed(1)}d`;
                await logModAction({
                    guild: member.guild,
                    moderator: member.client.user,
                    title: 'Young account joined',
                    fields: [
                        { name: 'User', value: `<@${member.id}> \`${member.user.tag}\``, inline: true },
                        { name: 'Account age', value: `${ageLabel} (threshold ${minAgeDays}d)`, inline: true },
                    ],
                });
                const holdMinutes = guildConfig.newAccountHoldMinutes ?? 0;
                if (holdMinutes > 0 && member.moderatable) {
                    await member.timeout(holdMinutes * 60 * 1000, `Auto-mod: account under ${minAgeDays}d old`).catch(() => {});
                }
            }
        }

        // 1. Auto-Role Assignment
        try {
            const memberRole = channels.roles.member
                && member.guild.roles.cache.get(channels.roles.member);
            if (memberRole) {
                await member.roles.add(memberRole);
            } else if (channels.roles.member) {
                logger.warn(`[WELCOME] Auto-role ${channels.roles.member} not found in ${member.guild.id}.`);
            }
            // No auto-role configured at all is a valid setup, so it is quiet.
        } catch (err) {
            logger.error(`Failed to assign role to ${member.user.tag}:`, err);
        }

        // 2. Private Message the User. Skipped during a flood: a burst of DMs to
        // brand-new accounts is exactly the pattern Discord rate-limits.
        if (!flooded) {
            try {
                const dmEmbed = brandedEmbed({ color: COLORS.success, footer: 'GLITCH_HAVEN // WELCOME' })
                    .setAuthor({ name: '⚡ SYSTEM.NEW_CONNECTION' })
                    .setTitle('> WELCOME TO GLITCH HAVEN')
                    .setDescription(
                        `Hey ${member.user.username}, glad you made it.\n\n` +
                        `_"${pick(quips)}"_\n\n` +
                        `Grab your roles with \`/roles\`, chat to level up, and use \`/lfg\` to squad up. Type \`/help\` any time.`
                    );

                await member.send({ embeds: [dmEmbed] });
            } catch (err) {
                // This triggers if the user has their DMs locked/disabled
                logger.info(`Could not send DM to ${member.user.tag}.`);
            }
        }

        // 3. Generate and Send Welcome Banner
        try {
            const welcomeChannel = member.guild.channels.cache.get(channels.welcome);
            if (!welcomeChannel) return logger.warn('Welcome channel ID is invalid or missing.');

            const headline = pick(headlines);
            const quip = pick(quips);
            const count = member.guild.memberCount;

            const welcomeEmbed = brandedEmbed({ color: COLORS.success, footer: 'GLITCH_HAVEN // USER_CONNECTED' })
                .setAuthor({ name: '⚡ SYSTEM.NEW_CONNECTION' })
                .setTitle(`> ${headline}`)
                .setDescription(`${member} just spawned in as member **#${count}**.\n\n_${quip}_\n\nGrab your roles with \`/roles\` and jump into the chat.`);

            // The banner costs an avatar download plus a synchronous canvas
            // render, so it's the first thing to go when joins spike.
            const files = [];
            if (!flooded) {
                try {
                    const imageBuffer = await buildWelcomeImage(member.user, { memberCount: count, quip });
                    files.push(new AttachmentBuilder(imageBuffer, { name: 'welcome-image.png' }));
                    welcomeEmbed.setImage('attachment://welcome-image.png');
                } catch (err) {
                    // A render failure shouldn't cost the member their welcome.
                    logger.warn(`[WELCOME] Banner render failed for ${member.id}: ${err.message}`);
                }
            }

            await welcomeChannel.send({ content: `${member}`, embeds: [welcomeEmbed], files, allowedMentions: { users: [member.id] } });
        } catch (err) {
            logger.error('Failed to send welcome message:', err);
        }
    }
};