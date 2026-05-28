const { handleModalSubmit, handleInject, handleAbort, handleExecute } = require('../utils/lfgManager');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {

        // ── Slash Commands ───────────────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction, client);
            } catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
                }
            }
        }

        // ── Modal Submissions ────────────────────────────────────────────────
        else if (interaction.isModalSubmit()) {
            try {
                if (interaction.customId === 'lfg_modal') {
                    await handleModalSubmit(interaction);
                }
            } catch (error) {
                console.error('Modal submission error:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '`ERROR_500` : Something went wrong creating the LFG.', ephemeral: true });
                }
            }
        }

        // ── Button Interactions ──────────────────────────────────────────────
        else if (interaction.isButton()) {
            try {
                if      (interaction.customId === 'lfg_inject')  await handleInject(interaction);
                else if (interaction.customId === 'lfg_abort')   await handleAbort(interaction);
                else if (interaction.customId === 'lfg_execute') await handleExecute(interaction);
            } catch (error) {
                console.error('Button interaction error:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '`ERROR_500` : Something went wrong.', ephemeral: true });
                }
            }
        }
    },
};