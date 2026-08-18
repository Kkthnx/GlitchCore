/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const Birthday = require('../database/BirthdaySchema');
const { brandedEmbed, COLORS } = require('../utils/brand');
const { localMonthDay } = require('../utils/birthdayManager');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Max day per month, allowing Feb 29 since we store no year.
const MAX_DAY = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function fmt(month, day) {
    return `${MONTHS[month - 1]} ${day}`;
}

// Days from today (local) until the next occurrence of month/day. The day-of-
// year basis uses MAX_DAY, which sums to 366 (Feb counted as 29), so the
// wrap-around must add that same 366 to stay consistent and avoid an off-by-one.
const YEAR_DAYS = MAX_DAY.reduce((a, b) => a + b, 0); // 366
function daysUntil(month, day, today) {
    const dayOfYear = (m, d) => MAX_DAY.slice(0, m - 1).reduce((a, b) => a + b, 0) + d;
    let diff = dayOfYear(month, day) - dayOfYear(today.month, today.day);
    if (diff < 0) diff += YEAR_DAYS;
    return diff;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Set or view birthdays for the shoutout')
        .setDMPermission(false)
        .addSubcommand(s => s.setName('set').setDescription('Save your birthday (no year needed)')
            .addIntegerOption(o => o.setName('month').setDescription('Month (1-12)').setMinValue(1).setMaxValue(12).setRequired(true))
            .addIntegerOption(o => o.setName('day').setDescription('Day (1-31)').setMinValue(1).setMaxValue(31).setRequired(true)))
        .addSubcommand(s => s.setName('remove').setDescription('Delete your saved birthday'))
        .addSubcommand(s => s.setName('next').setDescription('Show the next upcoming birthdays'))
        .addSubcommand(s => s.setName('list').setDescription('List birthdays in a given month')
            .addIntegerOption(o => o.setName('month').setDescription('Month (1-12)').setMinValue(1).setMaxValue(12).setRequired(false))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'set') {
            const month = interaction.options.getInteger('month');
            const day = interaction.options.getInteger('day');
            if (day > MAX_DAY[month - 1]) {
                return interaction.reply({ content: `${MONTHS[month - 1]} only has ${MAX_DAY[month - 1]} days.`, flags: MessageFlags.Ephemeral });
            }
            await Birthday.findOneAndUpdate(
                { guildId, userId: interaction.user.id },
                { month, day },
                { upsert: true },
            );
            return interaction.reply({ content: `🎂 Saved your birthday as **${fmt(month, day)}**.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'remove') {
            const removed = await Birthday.findOneAndDelete({ guildId, userId: interaction.user.id });
            return interaction.reply({ content: removed ? 'Removed your birthday.' : 'You had no birthday saved.', flags: MessageFlags.Ephemeral });
        }

        if (sub === 'next') {
            const today = localMonthDay();
            const all = await Birthday.find({ guildId });
            if (!all.length) return interaction.reply({ content: 'No birthdays saved yet. Set yours with `/birthday set`.', flags: MessageFlags.Ephemeral });

            const upcoming = all
                .map(b => ({ b, in: daysUntil(b.month, b.day, today) }))
                .sort((a, z) => a.in - z.in)
                .slice(0, 10)
                .map(({ b, in: days }) => `**${fmt(b.month, b.day)}** — <@${b.userId}> ${days === 0 ? '(today! 🎉)' : `(in ${days}d)`}`);

            const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven, Birthdays' })
                .setTitle('Upcoming birthdays')
                .setDescription(upcoming.join('\n'));
            return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
        }

        if (sub === 'list') {
            const month = interaction.options.getInteger('month') || localMonthDay().month;
            const rows = await Birthday.find({ guildId, month }).sort({ day: 1 });
            const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven, Birthdays' })
                .setTitle(`Birthdays in ${MONTHS[month - 1]}`)
                .setDescription(rows.length ? rows.map(b => `**${b.day}** — <@${b.userId}>`).join('\n') : 'Nobody has a birthday saved this month.');
            return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
        }
    },
};
