const { SlashCommandBuilder, PollLayoutType, MessageFlags } = require('discord.js');

module.exports = {
    data: (() => {
        const b = new SlashCommandBuilder()
            .setName('poll')
            .setDescription('Create a poll the server votes on')
            .setDMPermission(false)
            .addStringOption(o => o.setName('question').setDescription('The poll question').setRequired(true).setMaxLength(300))
            .addStringOption(o => o.setName('option1').setDescription('Answer 1').setRequired(true).setMaxLength(55))
            .addStringOption(o => o.setName('option2').setDescription('Answer 2').setRequired(true).setMaxLength(55));
        for (let i = 3; i <= 6; i++) {
            b.addStringOption(o => o.setName(`option${i}`).setDescription(`Answer ${i}`).setRequired(false).setMaxLength(55));
        }
        b.addIntegerOption(o => o.setName('hours').setDescription('How long the poll runs (1–168, default 24)').setMinValue(1).setMaxValue(168).setRequired(false));
        b.addBooleanOption(o => o.setName('multi').setDescription('Allow selecting multiple answers').setRequired(false));
        return b;
    })(),

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const answers = [];
        for (let i = 1; i <= 6; i++) {
            const val = interaction.options.getString(`option${i}`);
            if (val) answers.push({ text: val });
        }
        const hours = interaction.options.getInteger('hours') ?? 24;
        const multi = interaction.options.getBoolean('multi') ?? false;

        return interaction.reply({
            poll: {
                question: { text: question },
                answers,
                duration: hours,
                allowMultiselect: multi,
                layoutType: PollLayoutType.Default,
            },
        }).catch(() => interaction.reply({ content: 'Failed to create the poll — I may be missing permissions here.', flags: MessageFlags.Ephemeral }));
    },
};
