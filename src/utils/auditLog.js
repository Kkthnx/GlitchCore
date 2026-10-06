/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Shared plumbing for every audit log entry. Nothing here touches the database
// beyond the cached guild config, Discord's own mod-log channel is the store.
const { getGuildConfig } = require('./guildConfigCache');
const { brandedEmbed, COLORS } = require('./brand');
const { clamp, LIMITS } = require('./embedText');
const channels = require('./channels');
const logger = require('./logger');

/**
 * The channel audit entries should be posted to, or null when audit logging is
 * switched off, no mod-log channel is configured, or the configured one is
 * gone or can't hold messages. A per-guild setting wins over the env default.
 *
 * @param {import('discord.js').Guild} guild
 */
async function getAuditChannel(guild) {
    const cfg = await getGuildConfig(guild.id) || {};
    if (cfg.auditLogEnabled === false) return null;

    const id = cfg.modLogChannelId || channels.modLog;
    if (!id) return null;

    const channel = guild.channels.cache.get(id);
    return channel?.isTextBased?.() ? channel : null;
}

/**
 * Posts one audit entry as a glitch-styled embed.
 *
 * @param {import('discord.js').Guild} guild
 * @param {{ title: string, color?: string, description?: string,
 *           fields?: {name: string, value: string, inline?: boolean}[] }} entry
 * @param {import('discord.js').TextBasedChannel|null} [channel] pass it in when
 *        the caller already resolved it, to skip a second lookup
 */
async function postAudit(guild, entry, channel = null) {
    const target = channel || await getAuditChannel(guild);
    if (!target) return false;

    const embed = brandedEmbed({ color: COLORS[entry.color] ?? COLORS.neutral, footer: 'GLITCH_HAVEN // AUDIT' })
        .setAuthor({ name: `⚡ SYSTEM.${entry.title}` })
        .setTimestamp();

    if (entry.description) embed.setDescription(clamp(entry.description, LIMITS.description));

    const fields = (entry.fields || []).map(f => ({
        name: clamp(`> ${String(f.name).toUpperCase()}`, LIMITS.fieldName),
        value: clamp(f.value || '-', LIMITS.fieldValue),
        inline: Boolean(f.inline),
    }));
    if (fields.length) embed.addFields(fields);

    try {
        await target.send({ embeds: [embed], allowedMentions: { parse: [] } });
        return true;
    } catch (err) {
        logger.warn(`[AUDIT] Could not post ${entry.title} in ${guild.id}: ${err.message}`);
        return false;
    }
}

module.exports = { getAuditChannel, postAudit };
