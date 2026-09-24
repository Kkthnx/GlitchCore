/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, MessageFlags, InteractionContextType } = require('discord.js');
const Reminder = require('../database/ReminderSchema');
const { parseDuration, humanizeDuration } = require('../utils/duration');
const { brandedEmbed, COLORS } = require('../utils/brand');

const MAX_MS = 365 * 24 * 60 * 60 * 1000; // 1 year cap
// Each reminder is a row the poller reads every 30 seconds, so one member can't
// be allowed to queue an unbounded number of them.
const MAX_PER_USER = 25;
const CHOICE_LIMIT = 25;
const LABEL_MAX = 60;

// A one-line label for a reminder, short enough for an autocomplete choice.
function describe(reminder) {
    const text = reminder.message.length > LABEL_MAX
        ? `${reminder.message.slice(0, LABEL_MAX - 1)}…`
        : reminder.message;
    return text;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set, review, or cancel your reminders')
        .setContexts(InteractionContextType.Guild)
        .addSubcommand(s => s.setName('set').setDescription('Set a reminder')
            .addStringOption(o => o.setName('when').setDescription('In how long, e.g. 10m, 2h, 1d').setRequired(true))
            .addStringOption(o => o.setName('message').setDescription('What to remind you about').setRequired(true).setMaxLength(500)))
        .addSubcommand(s => s.setName('list').setDescription('Show your pending reminders'))
        .addSubcommand(s => s.setName('cancel').setDescription('Cancel one of your pending reminders')
            .addStringOption(o => o.setName('reminder').setDescription('Which reminder to cancel').setRequired(true).setAutocomplete(true))),

    /** Offers the member's own pending reminders, soonest first. */
    async autocomplete(interaction) {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== 'reminder') return interaction.respond([]);

        const pending = await Reminder.find(
            { guildId: interaction.guild.id, userId: interaction.user.id },
            { message: 1, remindAt: 1 },
        ).sort({ remindAt: 1 }).limit(CHOICE_LIMIT).lean();

        const query = String(focused.value || '').toLowerCase();
        const choices = pending
            .filter(r => !query || r.message.toLowerCase().includes(query))
            // The id is the value, so cancelling can't hit the wrong row when two
            // reminders share the same text.
            .map(r => ({ name: describe(r), value: String(r._id) }));

        return interaction.respond(choices);
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        if (sub === 'list') {
            const pending = await Reminder.find(
                { guildId, userId },
                { message: 1, remindAt: 1 },
            ).sort({ remindAt: 1 }).lean();

            if (!pending.length) {
                return interaction.reply({ content: 'You have no reminders pending. Set one with `/remind set`.', flags: MessageFlags.Ephemeral });
            }

            const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven, Reminders' })
                .setTitle(`⏰ Your reminders (${pending.length}/${MAX_PER_USER})`)
                .setDescription(pending
                    .map(r => `<t:${Math.floor(new Date(r.remindAt).getTime() / 1000)}:R>, ${describe(r)}`)
                    .join('\n'));
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (sub === 'cancel') {
            const id = interaction.options.getString('reminder');
            // Scope the delete to the caller so an id from anywhere else can't
            // cancel somebody else's reminder.
            const removed = await Reminder.findOneAndDelete({ _id: id, guildId, userId })
                .lean()
                .catch(() => null); // a malformed id is just "not found"

            if (!removed) {
                return interaction.reply({ content: 'I couldn\'t find that reminder. It may have already fired.', flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ content: `🗑️ Cancelled: **${describe(removed)}**`, flags: MessageFlags.Ephemeral });
        }

        // set
        const ms = parseDuration(interaction.options.getString('when'));
        if (!ms) {
            return interaction.reply({ content: 'Invalid time. Try `10m`, `2h`, or `1d`.', flags: MessageFlags.Ephemeral });
        }
        if (ms > MAX_MS) {
            return interaction.reply({ content: 'That\'s too far out, max is 1 year.', flags: MessageFlags.Ephemeral });
        }

        const existing = await Reminder.countDocuments({ guildId, userId });
        if (existing >= MAX_PER_USER) {
            return interaction.reply({
                content: `You already have ${MAX_PER_USER} reminders pending. Cancel one with \`/remind cancel\` first.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const remindAt = new Date(Date.now() + ms);
        await Reminder.create({
            userId,
            guildId,
            channelId: interaction.channel.id,
            message: interaction.options.getString('message'),
            remindAt,
        });

        return interaction.reply({
            content: `⏰ Got it, I'll remind you in **${humanizeDuration(ms)}** (<t:${Math.floor(remindAt.getTime() / 1000)}:R>).`,
            flags: MessageFlags.Ephemeral,
        });
    },

    // Exported for unit tests.
    describe,
    MAX_PER_USER,
};
