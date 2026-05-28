const { SlashCommandBuilder } = require('discord.js');
const { showLfgModal } = require('../../utils/lfgManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lfg')
        .setDescription('Create a Looking For Group post in the LFG channel'),

    async execute(interaction) {
        // Just opens the modal — all logic is in lfgManager.handleModalSubmit
        await showLfgModal(interaction);
    },
};
