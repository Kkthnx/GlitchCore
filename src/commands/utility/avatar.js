const { SlashCommandBuilder } = require('discord.js');
const { brandedEmbed, COLORS } = require('../../utils/brand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription("Show a user's avatar")
        .addUserOption(o => o.setName('target').setDescription('User (defaults to you)').setRequired(false)),

    async execute(interaction) {
        const user = interaction.options.getUser('target') || interaction.user;
        const url = user.displayAvatarURL({ dynamic: true, size: 1024 });
        const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven' })
            .setAuthor({ name: user.tag, iconURL: url })
            .setImage(url);
        return interaction.reply({ embeds: [embed] });
    },
};
