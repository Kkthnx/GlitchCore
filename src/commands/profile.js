const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../database/UserSchema');
const GuildConfig = require('../database/GuildConfigSchema');
const { xpRequiredForLevel } = require('../utils/calculateXp');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View your XP and level profile')
        .addUserOption(option => option.setName('target').setDescription('View another user\'s profile').setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

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

        const embed = new EmbedBuilder()
            .setTitle(`${targetUser.username}'s Profile`)
            .setDescription(targetUser.id === interaction.user.id ? 'Your current level summary.' : `Profile for ${targetUser.username}`)
            .addFields(
                { name: 'Level', value: `${currentLevel}`, inline: true },
                { name: 'XP', value: `${userData.xp}`, inline: true },
                { name: 'Progress', value: `${progress}/${nextLevelThreshold - currentLevelThreshold} (${percent}%)`, inline: true },
                { name: 'Rank Card Style', value: userData.cardStyle || 'default', inline: true },
                { name: 'Earned Rewards', value: earnedRewards, inline: false },
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
