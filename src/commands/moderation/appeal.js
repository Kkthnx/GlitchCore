/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, InteractionContextType } = require('discord.js');
const { APPEAL_MODAL_ID, APPEAL_USER_ID_INPUT, APPEAL_STATEMENT_INPUT } = require('../../utils/appealManager');

module.exports = {
    // Anyone can run this and it posts into the mod-log, so it is rate limited
    // per member to keep one account from flooding the mods' channel.
    cooldown: 120,

    data: new SlashCommandBuilder()
        .setName('appeal')
        .setDescription('File an appeal for a ban, timeout, or warn')
        .setContexts(InteractionContextType.Guild),

    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId(APPEAL_MODAL_ID)
            .setTitle('File an appeal');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(APPEAL_USER_ID_INPUT)
                    .setLabel('User ID being appealed for')
                    .setPlaceholder('Their Discord user ID (or your own)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(24),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(APPEAL_STATEMENT_INPUT)
                    .setLabel('Why should it be lifted?')
                    .setPlaceholder('Keep it honest and short')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000),
            ),
        );

        await interaction.showModal(modal);
    },
};
