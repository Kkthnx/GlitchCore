/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { EmbedBuilder } = require('discord.js');
const Starboard = require('../database/StarboardSchema');
const { getGuildConfig } = require('../utils/guildConfigCache');
const { PALETTE } = require('../utils/brand');
const logger = require('../utils/logger');

// Resolve a possibly-partial structure, swallowing fetch errors.
async function resolvePartial(obj) {
    if (obj?.partial) {
        try { await obj.fetch(); } catch { return null; }
    }
    return obj;
}

module.exports = {
    name: 'messageReactionAdd',
    async execute(reaction, user) {
        if (user.bot) return;

        reaction = await resolvePartial(reaction);
        if (!reaction) return;
        const message = await resolvePartial(reaction.message);
        if (!message || !message.guild) return;

        const cfg = await getGuildConfig(message.guild.id) || {};
        const channelId = cfg.starboardChannelId;
        if (!channelId) return;

        const emoji = cfg.starboardEmoji || '⭐';
        if ((reaction.emoji.name || reaction.emoji.toString()) !== emoji) return;

        // Don't star messages that are already in the starboard channel.
        if (message.channel.id === channelId) return;

        const threshold = cfg.starboardThreshold || 3;
        const count = reaction.count || 0;
        if (count < threshold) return;

        const starChannel = message.guild.channels.cache.get(channelId);
        if (!starChannel) return;

        const header = `${emoji} **${count}**, <#${message.channel.id}>`;
        const existing = await Starboard.findOne({ originMessageId: message.id });

        try {
            if (existing) {
                // Update the count on the existing starboard post.
                const starMsg = await starChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
                if (starMsg) await starMsg.edit({ content: header });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(PALETTE.gold)
                .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                .setDescription(message.content?.slice(0, 2048) || '*[no text]*')
                .addFields({ name: '​', value: `[Jump to message](${message.url})` })
                .setFooter({ text: 'Glitch Haven, Starboard' })
                .setTimestamp(message.createdTimestamp);

            const image = message.attachments.find(a => a.contentType?.startsWith('image/'));
            if (image) embed.setImage(image.url);

            const posted = await starChannel.send({ content: header, embeds: [embed] });
            await Starboard.create({
                guildId: message.guild.id,
                originMessageId: message.id,
                originChannelId: message.channel.id,
                starboardMessageId: posted.id,
            });
        } catch (err) {
            logger.error('[STARBOARD] Failed to post/update entry:', err);
        }
    },
};
