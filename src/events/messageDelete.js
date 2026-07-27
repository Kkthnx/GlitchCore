/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { getGuildConfig } = require('../utils/guildConfigCache');
const { brandedEmbed, COLORS } = require('../utils/brand');
const channels = require('../utils/channels');
const logger = require('../utils/logger');

function clip(text, max = 1000) {
    if (!text) return '_(no text, likely an embed or attachment)_';
    return text.length > max ? `${text.slice(0, max)}...` : text;
}

// Logs deleted messages to the guild's mod-log channel for audit trails.
module.exports = {
    name: 'messageDelete',
    async execute(message) {
        try {
            if (!message.guild) return;
            if (message.author?.bot) return;

            const cfg = await getGuildConfig(message.guild.id);
            const modLogId = cfg?.modLogChannelId || channels.modLog;
            if (!modLogId) return;
            const channel = message.guild.channels.cache.get(modLogId);
            if (!channel) return;

            const who = message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown (uncached)';
            const embed = brandedEmbed({ color: COLORS.danger, footer: 'GLITCH_HAVEN // AUDIT' })
                .setAuthor({ name: '⚡ SYSTEM.MESSAGE_DELETED' })
                .setDescription(`In ${message.channel}`)
                .addFields(
                    { name: '> AUTHOR', value: who, inline: false },
                    { name: '> CONTENT', value: clip(message.content), inline: false },
                )
                .setTimestamp();

            await channel.send({ embeds: [embed] });
        } catch (err) {
            logger.error('messageDelete audit log failed:', err);
        }
    },
};
