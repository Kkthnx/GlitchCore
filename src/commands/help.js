const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show help information for GlitchCore commands'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('GlitchCore Help')
            .setDescription('A quick reference for the bot commands and features.')
            .setColor(config.theme.blue)
            .addFields(
                { name: '/lfg', value: 'Create a Looking For Group post in the LFG channel.', inline: false },
                { name: '/rank', value: 'View your level profile and XP progress.', inline: false },
                { name: '/leaderboard', value: 'Show the top ranked users in the server.', inline: false },
                { name: '/rankstyle', value: 'Select your rank card theme and preview it.', inline: false },
                { name: '/profile', value: 'See your XP, level, role rewards, and activity summary.', inline: false },
                { name: '/settings', value: 'Server admin command to manage bot configuration.', inline: false },
            )
            .setFooter({ text: 'Use /help <command> to get more details.' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
