/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const BotState = require('../database/BotStateSchema');
const { getVersionInfo, getCommitsSince } = require('./version');
const { getGuildConfig } = require('./guildConfigCache');
const { brandedEmbed, COLORS } = require('./brand');
const channels = require('./channels');
const logger = require('./logger');

const MAX_LINES = 12;

// Discord embed descriptions cap at 4096 chars. Keep well under with a budget.
function buildChangelog(commits) {
    const lines = commits.slice(0, MAX_LINES).map(s => `- ${s.length > 140 ? `${s.slice(0, 139)}…` : s}`);
    const extra = commits.length - lines.length;
    if (extra > 0) lines.push(`- ...and ${extra} more change${extra === 1 ? '' : 's'}`);
    return lines.join('\n');
}

// Posts a changelog to each guild's announcements channel when the running
// build's commit differs from the one we last announced. Deduped per guild via
// BotState.lastAnnouncedCommit. Silent on the very first run so we never dump
// the whole history, and silent when there is no git commit to compare.
async function announceUpdate(client) {
    const { commit } = getVersionInfo();
    if (!commit) return; // not a git checkout, nothing to compare

    for (const guild of client.guilds.cache.values()) {
        try {
            const state = await BotState.findOne({ guildId: guild.id });
            const last = state?.lastAnnouncedCommit || null;

            // Already announced this exact build, do nothing.
            if (last === commit) continue;

            // Record first so a failed post (or a restart mid-loop) can't cause
            // a repeat announcement later.
            await BotState.findOneAndUpdate(
                { guildId: guild.id },
                { lastAnnouncedCommit: commit },
                { upsert: true },
            );

            // First time we've ever seen this guild, adopt the build silently.
            if (!last) continue;

            const cfg = await getGuildConfig(guild.id) || {};
            const channelId = cfg.announcementsChannelId || channels.announcements;
            const channel = channelId && guild.channels.cache.get(channelId);
            if (!channel) continue;

            const commits = getCommitsSince(last);
            if (!commits.length) continue;

            const embed = brandedEmbed({ color: COLORS.primary, footer: `GlitchCore, ${commit}` })
                .setAuthor({ name: '⚡ SYSTEM.UPDATE' })
                .setTitle('🚀 GlitchCore was updated')
                .setDescription(`Here is what changed.\n\n${buildChangelog(commits)}`);

            await channel.send({ embeds: [embed] }).catch(() => {});
            logger.info(`[UPDATE] Announced ${commits.length} change(s) to ${guild.id} for ${commit}.`);
        } catch (err) {
            logger.error(`[UPDATE] Announce failed for ${guild.id}:`, err);
        }
    }
}

module.exports = { announceUpdate, buildChangelog };
