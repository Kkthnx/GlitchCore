/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const BotState = require('../database/BotStateSchema');
const { getVersionInfo, getCommitsSince } = require('./version');
const { getGuildConfig } = require('./guildConfigCache');
const { generatePatchBanner } = require('./generatePatchBanner');
const channels = require('./channels');
const logger = require('./logger');

const NEON_GREEN = 0x39ff14;
const MAX_LINES = 12;

// Terminal palette, matching the event and leaderboard systems.
const ESC = '\x1b';
const G = `${ESC}[1;32m`;  // green
const Y = `${ESC}[1;33m`;  // amber
const R = `${ESC}[1;31m`;  // red
const C = `${ESC}[1;36m`;  // cyan
const W = `${ESC}[1;37m`;  // white
const D = `${ESC}[1;30m`;  // dark grey
const RST = `${ESC}[0m`;

// Classify a change by its leading verb so the log reads in multiple colors:
// amber "~" for fixes, red "-" for removals, green "+" for everything else.
function classifyChange(subject) {
    const w = String(subject).trim().toLowerCase().split(/\s+/)[0] || '';
    if (/^(fix|hotfix|patch|correct|repair|resolve|harden|guard)/.test(w)) return { sym: '~', color: Y };
    if (/^(remove|delete|drop|revert|strip|purge|clean)/.test(w)) return { sym: '-', color: R };
    return { sym: '+', color: G };
}

// Truncate and cap the raw commit subjects, returning the change lines plus an
// optional summary of the remainder. Pure and unit-tested (presentation is
// applied separately in buildPatchBlock).
function capChanges(commits) {
    const lines = commits.slice(0, MAX_LINES).map(s => (s.length > 140 ? `${s.slice(0, 139)}…` : s));
    const extra = commits.length - lines.length;
    if (extra > 0) lines.push(`...and ${extra} more change${extra === 1 ? '' : 's'}`);
    return lines;
}

// Renders the glitch-terminal patch readout as an ANSI code block.
function buildPatchBlock(commits, info) {
    const changes = capChanges(commits);
    const rows = [
        '```ansi',
        `${G}> SYSTEM PATCH DEPLOYED${RST}`,
        `${C}BUILD  ${RST} ${W}${info.commit}${RST}`,
        `${C}BRANCH ${RST} ${info.branch || 'main'}`,
        `${C}AUTHOR ${RST} ${info.author || 'unknown'}`,
        `${C}CHANGES${RST} ${commits.length}`,
        '',
        `${D}░▒▓█ ${G}CHANGELOG ${D}█▓▒░${RST}`,
        '',
        ...changes.map(c => {
            if (c.startsWith('...')) return `${D}  ${c}${RST}`;
            const { sym, color } = classifyChange(c);
            return `${color}${sym} ${RST}${c}`;
        }),
        '```',
    ];
    return rows.join('\n');
}

// Small grey subtext line under the block with the deploy time.
function deployedLine(info) {
    if (!info.commitDate) return '';
    const unix = Math.floor(new Date(info.commitDate).getTime() / 1000);
    return `\n-# Deployed <t:${unix}:R>`;
}

// Posts a changelog to each guild's announcements channel when the running
// build's commit differs from the one we last announced. Deduped per guild via
// BotState.lastAnnouncedCommit. Silent on the very first run so we never dump
// the whole history, and silent when there is no git commit to compare.
async function announceUpdate(client) {
    const info = getVersionInfo();
    const commit = info.commit;
    if (!commit) return; // not a git checkout, nothing to compare

    for (const guild of client.guilds.cache.values()) {
        try {
            const state = await BotState.findOne({ guildId: guild.id });
            const last = state?.lastAnnouncedCommit || null;

            // Already announced this exact build, do nothing.
            if (last === commit) continue;

            const record = () => BotState.findOneAndUpdate(
                { guildId: guild.id },
                { lastAnnouncedCommit: commit },
                { upsert: true },
            );

            // First time we've ever seen this guild, adopt the build silently.
            if (!last) { await record(); continue; }

            // Resolve the destination before recording. If there's no channel
            // yet (unset/misconfigured at boot), leave the dedup untouched so a
            // later boot with a valid channel still announces this build.
            const cfg = await getGuildConfig(guild.id) || {};
            const channelId = cfg.announcementsChannelId || channels.announcements;
            const channel = channelId && guild.channels.cache.get(channelId);
            if (!channel) continue;

            const commits = getCommitsSince(last);
            if (!commits.length) continue;

            // Record now that we have a channel and a changelog, before sending,
            // so a send failure or mid-loop restart can't cause a repeat.
            await record();

            const embed = new EmbedBuilder()
                .setColor(NEON_GREEN)
                .setAuthor({ name: '⚡ SYSTEM.UPDATE' })
                .setTitle('> GLITCHCORE // PATCH NOTES')
                .setDescription(buildPatchBlock(commits, info) + deployedLine(info))
                .setFooter({ text: `GLITCH_HAVEN // BUILD ${commit}` })
                .setTimestamp();

            // Chromatic "PATCH DEPLOYED" header banner. If canvas fails for any
            // reason, still send the text announcement.
            const files = [];
            try {
                const banner = generatePatchBanner(commit);
                files.push(new AttachmentBuilder(banner, { name: 'patch.png' }));
                embed.setImage('attachment://patch.png');
            } catch (err) {
                logger.warn(`[UPDATE] Patch banner render failed: ${err.message}`);
            }

            await channel.send({ embeds: [embed], files }).catch(() => {});
            logger.info(`[UPDATE] Announced ${commits.length} change(s) to ${guild.id} for ${commit}.`);
        } catch (err) {
            logger.error(`[UPDATE] Announce failed for ${guild.id}:`, err);
        }
    }
}

module.exports = { announceUpdate, capChanges, buildPatchBlock };
