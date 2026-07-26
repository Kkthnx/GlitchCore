/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const User = require('../database/UserSchema');
const GuildConfig = require('../database/GuildConfigSchema');
const { xpRequiredForLevel } = require('../utils/calculateXp');
const { brandedEmbed, COLORS, progressBar } = require('../utils/brand');
const { getUserRank } = require('../utils/ranking');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View your XP and level profile')
        .addUserOption(option => option.setName('target').setDescription('View another user\'s profile').setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetUser = interaction.options.getUser('target') || interaction.user;
        if (targetUser.bot) return interaction.editReply('Bots do not have profiles.');

        const [userData, guildConfig] = await Promise.all([
            User.findOne({ userId: targetUser.id, guildId: interaction.guild.id }),
            GuildConfig.findOne({ guildId: interaction.guild.id }),
        ]);

        if (!userData) {
            return interaction.editReply(`${targetUser.username} has not earned any XP yet.`);
        }

        const currentLevel = userData.level || 0;
        const currentLevelThreshold = xpRequiredForLevel(currentLevel);
        const nextLevelThreshold = xpRequiredForLevel(currentLevel + 1);
        const progress = userData.xp - currentLevelThreshold;
        const percent = nextLevelThreshold - currentLevelThreshold > 0
            ? Math.floor((progress / (nextLevelThreshold - currentLevelThreshold)) * 100)
            : 100;

        const roleRewards = guildConfig?.levelRewardRoles || [];
        const earnedRewards = roleRewards
            .filter(reward => reward.level <= currentLevel)
            .map(reward => `<@&${reward.roleId}> (level ${reward.level})`)
            .join('\n') || 'None';

        const rank = await getUserRank(interaction.guild.id, currentLevel, userData.xp);

        const span = nextLevelThreshold - currentLevelThreshold;
        const bar = `${progressBar(span > 0 ? progress / span : 1)} **${percent}%**`;

        const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven, Profile' })
            .setAuthor({
                name: `${targetUser.username}'s Profile`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true }),
            })
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: 'Rank', value: `#${rank}`, inline: true },
                { name: 'Level', value: `${currentLevel}`, inline: true },
                { name: 'Total XP', value: userData.xp.toLocaleString(), inline: true },
                { name: 'Progress to Next Level', value: `${bar}\n${progress.toLocaleString()} / ${span.toLocaleString()} XP`, inline: false },
                { name: 'Rank Card Style', value: userData.cardStyle || 'default', inline: true },
                { name: 'Earned Rewards', value: earnedRewards, inline: false },
            );

        await interaction.editReply({ embeds: [embed] });
    },
};
