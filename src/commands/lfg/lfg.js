/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder } = require('discord.js');
const { showLfgModal } = require('../../utils/lfgManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lfg')
        .setDescription('Create a Looking For Group post in the LFG channel'),

    async execute(interaction) {
        // Just opens the modal, all logic is in lfgManager.handleModalSubmit
        await showLfgModal(interaction);
    },
};
