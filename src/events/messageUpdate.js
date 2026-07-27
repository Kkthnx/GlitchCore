/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { getGuildConfig } = require('../utils/guildConfigCache');
const { brandedEmbed, COLORS } = require('../utils/brand');
const config = require('../../config.json');
const logger = require('../utils/logger');

function clip(text, max = 950) {
    if (!text) return '_(empty)_';
    return text.length > max ? `${text.slice(0, max)}...` : text;
}

// Logs message edits to the guild's mod-log channel for audit trails.
module.exports = {
    name: 'messageUpdate',
    async execute(oldMessage, newMessage) {
        try {
            if (!newMessage.guild) return;
            if (newMessage.author?.bot) return;
            // Skip uncached (partial) originals so we don't log false edits when
            // Discord adds embed unfurls to old messages we never had content for.
            if (oldMessage.partial) return;
            // Only content edits matter here. Embed unfurls fire this too.
            if (oldMessage.content === newMessage.content) return;

            const cfg = await getGuildConfig(newMessage.guild.id);
            const modLogId = cfg?.modLogChannelId || config.channels.modLog;
            if (!modLogId) return;
            const channel = newMessage.guild.channels.cache.get(modLogId);
            if (!channel) return;

            const who = newMessage.author ? `${newMessage.author.tag} (${newMessage.author.id})` : 'Unknown';
            const embed = brandedEmbed({ color: COLORS.hype, footer: 'GLITCH_HAVEN // AUDIT' })
                .setAuthor({ name: '⚡ SYSTEM.MESSAGE_EDITED' })
                .setDescription(`In ${newMessage.channel} — [jump](${newMessage.url})`)
                .addFields(
                    { name: '> AUTHOR', value: who, inline: false },
                    { name: '> BEFORE', value: clip(oldMessage.content), inline: false },
                    { name: '> AFTER', value: clip(newMessage.content), inline: false },
                )
                .setTimestamp();

            await channel.send({ embeds: [embed] });
        } catch (err) {
            logger.error('messageUpdate audit log failed:', err);
        }
    },
};
