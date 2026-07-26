/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const User = require('../../database/UserSchema');
const buildRankCard = require('../../utils/generateRankCard');
const { xpRequiredForLevel } = require('../../utils/calculateXp');
const { getUserRank } = require('../../utils/ranking');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Displays your current level and XP')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to check the rank of')
                .setRequired(false)),

    async execute(interaction) {
        // Defer the reply because generating the image and fetching DB takes a second
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('target') || interaction.user;

        // Prevent checking bots
        if (targetUser.bot) {
            return interaction.editReply("Bots don't have ranks!");
        }

        // Fetch user data from MongoDB
        const userData = await User.findOne({ userId: targetUser.id, guildId: interaction.guild.id });

        if (!userData) {
            return interaction.editReply(`${targetUser.username} hasn't earned any XP yet. Tell them to start chatting!`);
        }

        const rank = await getUserRank(interaction.guild.id, userData.level, userData.xp);

        // Calculate per-level XP progress (so the bar shows relative progress, not giant cumulative numbers)
        const currentLevelThreshold = xpRequiredForLevel(userData.level);
        const nextLevelThreshold = xpRequiredForLevel(userData.level + 1);
        const currentLevelXp = userData.xp - currentLevelThreshold;      // XP earned since this level started
        const xpToNextLevel = nextLevelThreshold - currentLevelThreshold; // XP span of this level

        // Generate the custom image
        const imageBuffer = await buildRankCard(targetUser, currentLevelXp, xpToNextLevel, userData.level, rank, userData.cardStyle);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'rank-card.png' });

        await interaction.editReply({ files: [attachment] });
    }
};