/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const User = require('../../database/UserSchema');
const themes = require('../../utils/cardThemes');
const { xpRequiredForLevel } = require('../../utils/calculateXp');
const buildRankCard = require('../../utils/generateRankCard');
const { getUserRank } = require('../../utils/ranking');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rankstyle')
        .setDescription('Change the aesthetic theme of your rank card')
        .addStringOption(option => {
            option.setName('theme')
                .setDescription('The theme you want to apply')
                .setRequired(true);
            
            // Add all available themes as choices
            for (const [id, config] of Object.entries(themes)) {
                option.addChoices({ name: config.name, value: id });
            }
            return option;
        }),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const themeId = interaction.options.getString('theme');
        const themeConfig = themes[themeId];

        if (!themeConfig) {
            return interaction.editReply('Invalid theme selected.');
        }

        // Fetch or create user
        let userData = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!userData) {
            userData = new User({ userId: interaction.user.id, guildId: interaction.guild.id });
        }

        // Update theme
        userData.cardStyle = themeId;
        await userData.save();

        const currentLevelThreshold = xpRequiredForLevel(userData.level);
        const nextLevelThreshold = xpRequiredForLevel(userData.level + 1);
        const currentLevelXp = userData.xp - currentLevelThreshold;
        const xpToNextLevel = nextLevelThreshold - currentLevelThreshold;

        // Fetch rank for the preview
        const rank = await getUserRank(interaction.guild.id, userData.level, userData.xp);

        const imageBuffer = await buildRankCard(interaction.user, currentLevelXp, xpToNextLevel, userData.level, rank, themeId);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'preview-card.png' });

        return interaction.editReply({ 
            content: `Successfully updated your rank card style to **${themeConfig.name}**! Here is a preview:`,
            files: [attachment]
        });
    }
};
