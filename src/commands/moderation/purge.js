/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const { logModAction } = require('../../utils/moderationManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Bulk-delete recent messages in this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setContexts(InteractionContextType.Guild)
        .addIntegerOption(o => o.setName('amount').setDescription('How many messages (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
        .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user').setRequired(false)),

    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');
        const user = interaction.options.getUser('user');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            let deleted;
            if (user) {
                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                const mine = [...messages.values()].filter(m => m.author.id === user.id).slice(0, amount);
                deleted = await interaction.channel.bulkDelete(mine, true);
            } else {
                deleted = await interaction.channel.bulkDelete(amount, true);
            }
            // Leave an audit trail. The ephemeral reply below is only seen by
            // the mod who ran it, and Discord's own audit log doesn't record who
            // asked the bot to do this.
            await logModAction({
                guild: interaction.guild,
                moderator: interaction.user,
                title: 'Messages purged',
                fields: [
                    { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
                    { name: 'Deleted', value: `${deleted.size}`, inline: true },
                    ...(user ? [{ name: 'Only from', value: `<@${user.id}> \`${user.tag}\``, inline: false }] : []),
                ],
            });

            // Fewer than asked for means Discord skipped some: either they were
            // over 14 days old, or the user filter simply matched fewer.
            const shortfall = deleted.size < amount
                ? user
                    ? ' (That\'s all I could find from them in the last 100 messages, ignoring any over 14 days old.)'
                    : ' (Some were older than 14 days and skipped.)'
                : '';
            return interaction.editReply(`🧹 Deleted **${deleted.size}** message(s)${user ? ` from <@${user.id}>` : ''}.${shortfall}`);
        } catch (err) {
            return interaction.editReply(`Failed to purge: ${err.message}`);
        }
    },
};
