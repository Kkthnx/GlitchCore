/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, InteractionContextType } = require('discord.js');
const { exportUserData, CONFIRM_ID } = require('../utils/privacyManager');
const { brandedEmbed, COLORS } = require('../utils/brand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forgetme')
        .setDescription('Export or delete the data GlitchCore stores about you')
        .setContexts(InteractionContextType.Guild)
        .addSubcommand(sub => sub.setName('export').setDescription('Download a copy of your stored data'))
        .addSubcommand(sub => sub.setName('delete').setDescription('Erase your profile/XP and remove you from rosters')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'export') {
            const data = await exportUserData(interaction.guild.id, interaction.user.id);
            const file = new AttachmentBuilder(Buffer.from(JSON.stringify(data, null, 2), 'utf8'), { name: 'glitchcore-data.json' });
            return interaction.reply({
                content: '📄 Here\'s everything GlitchCore stores about you in this server.',
                files: [file],
                flags: MessageFlags.Ephemeral,
            });
        }

        // delete, require an explicit confirmation click.
        const embed = brandedEmbed({ color: COLORS.danger, footer: 'Glitch Haven, Privacy' })
            .setTitle('⚠️ Erase your data?')
            .setDescription(
                'This permanently deletes your **profile, XP and level**, your saved **birthday**, and any **reminders** you have pending. ' +
                'It removes you from every event and LFG roster and withdraws you from any open giveaway, and unlinks your account from any tracked Twitch channel.\n\n' +
                'Two things are kept: **moderation records**, as server records, and any **suggestions** you posted, which are published to the channel like a message. ' +
                'A manager can remove an individual suggestion.\n\nThis cannot be undone.'
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(CONFIRM_ID).setLabel('Yes, erase my data').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        );
        return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    },
};
