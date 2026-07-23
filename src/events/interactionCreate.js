const { handleModalSubmit, handleInject, handleAbort, handleExecute, handleCancel } = require('../utils/lfgManager');
const { SELECT_ID, handleSelfRoleSelect } = require('../utils/selfRoleManager');
const { MessageFlags } = require('discord.js');
const logger = require('../utils/logger');

// Safely send an error response. If the interaction already expired or was
// acknowledged, this swallows the secondary failure so it can't bubble up as
// an unhandled rejection.
async function safeErrorReply(interaction, content) {
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        }
    } catch (err) {
        logger.warn(`Failed to deliver error reply for interaction ${interaction.id}: ${err.message}`);
    }
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {

        // ── Slash Commands ───────────────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) {
                logger.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction, client);
            } catch (error) {
                logger.error(`[CMD_ERROR] /${interaction.commandName}:`, error);
                await safeErrorReply(interaction, 'There was an error while executing this command!');
            }
        }

        // ── Modal Submissions ────────────────────────────────────────────────
        else if (interaction.isModalSubmit()) {
            try {
                if (interaction.customId === 'lfg_modal') {
                    await handleModalSubmit(interaction);
                }
            } catch (error) {
                logger.error('Modal submission error:', error);
                await safeErrorReply(interaction, '`ERROR_500` : Something went wrong creating the LFG.');
            }
        }

        // ── String Select Menus ──────────────────────────────────────────────
        else if (interaction.isStringSelectMenu()) {
            try {
                if (interaction.customId === SELECT_ID) {
                    await handleSelfRoleSelect(interaction);
                }
            } catch (error) {
                logger.error('Select menu error:', error);
                await safeErrorReply(interaction, '`ERROR_500` : Something went wrong updating your roles.');
            }
        }

        // ── Button Interactions ──────────────────────────────────────────────
        else if (interaction.isButton()) {
            try {
                if      (interaction.customId === 'lfg_inject')  await handleInject(interaction);
                else if (interaction.customId === 'lfg_abort')   await handleAbort(interaction);
                else if (interaction.customId === 'lfg_execute') await handleExecute(interaction);
                else if (interaction.customId === 'lfg_cancel')  await handleCancel(interaction);
            } catch (error) {
                logger.error('Button interaction error:', error);
                await safeErrorReply(interaction, '`ERROR_500` : Something went wrong.');
            }
        }
    },
};
