/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { handleModalSubmit, handleInject, handleAbort, handleExecute, handleCancel } = require('../utils/lfgManager');
const { SELECT_ID, OPEN_ID, handleSelfRoleSelect, handleOpenPicker } = require('../utils/selfRoleManager');
const { BTN: EVENT_BTN, handleEventRsvp, handleEventCancel } = require('../utils/eventManager');
const { CONFIRM_ID: FORGET_CONFIRM_ID, handleForgetConfirm } = require('../utils/privacyManager');
const { ENTER_ID: GIVEAWAY_ENTER_ID, handleGiveawayEntry } = require('../utils/giveawayManager');
const { handleSuggestionButton } = require('../utils/suggestionManager');
const { MessageFlags } = require('discord.js');
const { consume } = require('../utils/commandCooldowns');
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

            // Commands that render images or run aggregates declare a cooldown
            // so one member can't pin the shard's event loop by holding enter.
            const { allowed, retryAfterMs } = consume(command.data.name, interaction.user.id, command.cooldown);
            if (!allowed) {
                const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
                return safeErrorReply(interaction, `⏳ Slow down, try \`/${command.data.name}\` again in ${seconds}s.`);
            }

            try {
                await command.execute(interaction, client);
            } catch (error) {
                logger.error(`[CMD_ERROR] /${interaction.commandName}:`, error);
                await safeErrorReply(interaction, 'There was an error while executing this command!');
            }
        }

        // ── Autocomplete ─────────────────────────────────────────────────────
        // Discord gives this 3 seconds and it cannot be deferred, so a failure
        // just means an empty list: never an error reply, which would be invalid
        // for this interaction type anyway.
        else if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (!command?.autocomplete) return;

            try {
                await command.autocomplete(interaction, client);
            } catch (error) {
                logger.warn(`[AUTOCOMPLETE] /${interaction.commandName} failed: ${error.message}`);
                if (!interaction.responded) await interaction.respond([]).catch(() => {});
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
                else if (interaction.customId === EVENT_BTN.going)   await handleEventRsvp(interaction, 'going');
                else if (interaction.customId === EVENT_BTN.maybe)   await handleEventRsvp(interaction, 'maybe');
                else if (interaction.customId === EVENT_BTN.decline) await handleEventRsvp(interaction, 'decline');
                else if (interaction.customId === EVENT_BTN.cancel)  await handleEventCancel(interaction);
                else if (interaction.customId === FORGET_CONFIRM_ID) await handleForgetConfirm(interaction);
                else if (interaction.customId === OPEN_ID)           await handleOpenPicker(interaction);
                else if (interaction.customId === GIVEAWAY_ENTER_ID)  await handleGiveawayEntry(interaction);
                else if (interaction.customId.startsWith('suggest:')) await handleSuggestionButton(interaction);
            } catch (error) {
                logger.error('Button interaction error:', error);
                await safeErrorReply(interaction, '`ERROR_500` : Something went wrong.');
            }
        }
    },
};
