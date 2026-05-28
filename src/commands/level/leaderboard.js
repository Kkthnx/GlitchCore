const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../database/UserSchema');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Displays the top 10 highest-level members in GlitchHaven'),

    async execute(interaction) {
        await interaction.deferReply();

        // Fetch top 10 users sorted by level (descending) and then XP (descending)
        const topUsers = await User.find({ guildId: interaction.guild.id })
            .sort({ level: -1, xp: -1 })
            .limit(10);

        if (!topUsers.length) {
            return interaction.editReply('No one has earned any XP yet!');
        }

        const embed = new EmbedBuilder()
            .setTitle('🏆 GlitchHaven Leaderboard')
            .setColor(config.theme.blue)
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }));

        let description = '';
        topUsers.forEach((user, index) => {
            // Using <@id> pings/formats the user visually without notifying them in embeds
            description += `**#${index + 1}** <@${user.userId}> — Level ${user.level} (${user.xp} XP)\n`;
        });

        embed.setDescription(description);

        await interaction.editReply({ embeds: [embed] });
    }
};