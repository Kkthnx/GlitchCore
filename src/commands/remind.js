/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const Reminder = require('../database/ReminderSchema');
const { parseDuration, humanizeDuration } = require('../utils/duration');

const MAX_MS = 365 * 24 * 60 * 60 * 1000; // 1 year cap

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a reminder')
        .setDMPermission(false)
        .addStringOption(o => o.setName('when').setDescription('In how long, e.g. 10m, 2h, 1d').setRequired(true))
        .addStringOption(o => o.setName('message').setDescription('What to remind you about').setRequired(true).setMaxLength(500)),

    async execute(interaction) {
        const ms = parseDuration(interaction.options.getString('when'));
        if (!ms) {
            return interaction.reply({ content: 'Invalid time. Try `10m`, `2h`, or `1d`.', flags: MessageFlags.Ephemeral });
        }
        if (ms > MAX_MS) {
            return interaction.reply({ content: 'That\'s too far out, max is 1 year.', flags: MessageFlags.Ephemeral });
        }

        const remindAt = new Date(Date.now() + ms);
        await Reminder.create({
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
            message: interaction.options.getString('message'),
            remindAt,
        });

        return interaction.reply({
            content: `⏰ Got it, I'll remind you in **${humanizeDuration(ms)}** (<t:${Math.floor(remindAt.getTime() / 1000)}:R>).`,
            flags: MessageFlags.Ephemeral,
        });
    },
};
