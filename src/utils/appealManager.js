/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { MessageFlags } = require('discord.js');
const Infraction = require('../database/InfractionSchema');
const { brandedEmbed, COLORS } = require('./brand');
const { getModLogChannel } = require('./auditLog');
const { isSnowflake } = require('./snowflake');
const logger = require('./logger');

// Ban appeals. Banned members can't run guild commands, so this covers appeals
// filed on someone's behalf (or for a warn/timeout): the statement plus the
// target's ban record land in the mod-log channel for the mods to review.

const APPEAL_MODAL_ID = 'appeal_modal';
const APPEAL_USER_ID_INPUT = 'appeal_user_id';
const APPEAL_STATEMENT_INPUT = 'appeal_statement';

async function handleAppealSubmit(interaction) {
    const targetId = interaction.fields.getTextInputValue(APPEAL_USER_ID_INPUT).trim();
    const statement = interaction.fields.getTextInputValue(APPEAL_STATEMENT_INPUT).trim();

    if (!isSnowflake(targetId)) {
        return interaction.reply({ content: "That doesn't look like a user ID.", flags: MessageFlags.Ephemeral });
    }

    const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
    const history = await Infraction.find({ guildId: interaction.guild.id, userId: targetId })
        .sort({ createdAt: -1 })
        .limit(10)
        .catch(() => []);

    const historyLines = history.length
        ? history.map(i => `• ${i.type} by <@${i.moderatorId}> on <t:${Math.floor(i.createdAt.getTime() / 1000)}:d>: ${i.reason}`)
        : ['No infractions on record.'];

    try {
        const channel = await getModLogChannel(interaction.guild);
        if (!channel) {
            return interaction.reply({ content: 'No mod-log channel is configured, so there is nowhere to send this.', flags: MessageFlags.Ephemeral });
        }

        const embed = brandedEmbed({ color: COLORS.accent, footer: 'Glitch Haven, Appeals' })
            .setTitle('Ban appeal submitted')
            .addFields(
                { name: 'Appealing for', value: targetUser ? `<@${targetUser.id}> \`${targetUser.tag}\`` : `\`${targetId}\``, inline: true },
                { name: 'Filed by', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Statement', value: statement.slice(0, 1000), inline: false },
                { name: 'Record (latest 10)', value: historyLines.join('\n').slice(0, 1000), inline: false },
            );
        await channel.send({ embeds: [embed] });
    } catch (err) {
        logger.error('Failed to post appeal:', err);
        return interaction.reply({ content: 'Failed to file the appeal, try again.', flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({ content: 'Appeal filed. The mods will review it.', flags: MessageFlags.Ephemeral });
}

module.exports = { APPEAL_MODAL_ID, APPEAL_USER_ID_INPUT, APPEAL_STATEMENT_INPUT, handleAppealSubmit };
