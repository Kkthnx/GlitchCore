/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const Suggestion = require('../database/SuggestionSchema');
const { getGuildConfig } = require('../utils/guildConfigCache');
const { buildSuggestionEmbed, buildSuggestionButtons } = require('../utils/suggestionManager');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Submit a suggestion for the server')
        .setDMPermission(false)
        .addStringOption(o => o.setName('text').setDescription('Your suggestion').setRequired(true).setMaxLength(1000)),

    async execute(interaction) {
        const text = interaction.options.getString('text').trim();

        const cfg = await getGuildConfig(interaction.guild.id) || {};
        const channel = cfg.suggestionChannelId
            ? interaction.guild.channels.cache.get(cfg.suggestionChannelId)
            : interaction.channel;
        if (!channel) {
            return interaction.reply({ content: 'The configured suggestion channel no longer exists — ask an admin to set `suggestion_channel_id`.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const data = {
            guildId: interaction.guild.id,
            channelId: channel.id,
            authorId: interaction.user.id,
            text,
            upvotes: [], downvotes: [], status: 'pending',
        };

        try {
            const embed = buildSuggestionEmbed(data, interaction.user.tag, interaction.user.displayAvatarURL());
            const msg = await channel.send({ embeds: [embed], components: [buildSuggestionButtons()] });
            await Suggestion.create({ messageId: msg.id, ...data });
            return interaction.editReply({ content: `✅ Suggestion posted in ${channel}. [→ jump](${msg.url})` });
        } catch (err) {
            logger.error('Failed to post suggestion:', err);
            return interaction.editReply({ content: 'Failed to post your suggestion. Do I have permission to send messages there?' });
        }
    },
};
