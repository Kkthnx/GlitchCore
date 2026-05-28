const { SlashCommandBuilder } = require('discord.js');
const User = require('../../database/UserSchema');
const themes = require('../../utils/cardThemes');

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
        await interaction.deferReply({ ephemeral: true });

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

        return interaction.editReply(`Successfully updated your rank card style to **${themeConfig.name}**! Use \`/rank\` to check it out.`);
    }
};
