/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const Giveaway = require('../database/GiveawaySchema');
const { parseDuration, clampTimeout, humanizeDuration } = require('../utils/duration');
const { buildGiveawayEmbed, buildGiveawayButton, pickWinners } = require('../utils/giveawayManager');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Run a giveaway')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setContexts(InteractionContextType.Guild)
        .addSubcommand(sub => sub
            .setName('start')
            .setDescription('Start a giveaway')
            .addStringOption(o => o.setName('prize').setDescription('What are you giving away?').setRequired(true).setMaxLength(200))
            .addStringOption(o => o.setName('duration').setDescription('How long, e.g. 1h, 2d, 30m').setRequired(true))
            .addIntegerOption(o => o.setName('winners').setDescription('Number of winners (default 1)').setMinValue(1).setMaxValue(50).setRequired(false)))
        .addSubcommand(sub => sub
            .setName('reroll')
            .setDescription('Reroll winners for an ended giveaway')
            .addStringOption(o => o.setName('message_id').setDescription('Which giveaway to reroll').setRequired(true).setAutocomplete(true))),

    /** Offers this guild's ended giveaways, most recent first. */
    async autocomplete(interaction) {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== 'message_id') return interaction.respond([]);

        const ended = await Giveaway.find(
            { guildId: interaction.guild.id, ended: true },
            { prize: 1, messageId: 1, endsAt: 1 },
        ).sort({ endsAt: -1 }).limit(25).lean();

        const query = String(focused.value || '').toLowerCase();
        return interaction.respond(ended
            .filter(g => !query || g.prize.toLowerCase().includes(query))
            .map(g => ({
                name: g.prize.length > 90 ? `${g.prize.slice(0, 89)}…` : g.prize,
                value: g.messageId,
            })));
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'start') {
            const prize = interaction.options.getString('prize').trim();
            const winnerCount = interaction.options.getInteger('winners') ?? 1;
            const ms = parseDuration(interaction.options.getString('duration'));
            if (!ms) {
                return interaction.reply({ content: 'Invalid duration. Try `30m`, `1h`, or `2d`.', flags: MessageFlags.Ephemeral });
            }
            const endsAt = new Date(Date.now() + clampTimeout(ms));

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const data = { guildId: interaction.guild.id, channelId: interaction.channel.id, hostId: interaction.user.id, prize, winnerCount, endsAt, entries: [], ended: false };

            try {
                const msg = await interaction.channel.send({ embeds: [buildGiveawayEmbed(data)], components: [buildGiveawayButton(false, 0)] });
                await Giveaway.create({ messageId: msg.id, ...data });
                return interaction.editReply({ content: `🎉 Giveaway started for **${prize}**, ends in ${humanizeDuration(clampTimeout(ms))}. [jump](${msg.url})` });
            } catch (err) {
                logger.error('Failed to start giveaway:', err);
                return interaction.editReply({ content: 'Failed to post the giveaway. Do I have permission to send messages here?' });
            }
        }

        // reroll
        const messageId = interaction.options.getString('message_id').trim();
        const existing = await Giveaway.findOne({ guildId: interaction.guild.id, messageId }).lean();
        if (!existing) return interaction.reply({ content: 'No giveaway found for that message ID.', flags: MessageFlags.Ephemeral });
        if (!existing.ended) return interaction.reply({ content: 'That giveaway hasn\'t ended yet.', flags: MessageFlags.Ephemeral });
        if (!existing.entries.length) return interaction.reply({ content: 'That giveaway had no entries to reroll.', flags: MessageFlags.Ephemeral });

        const winners = pickWinners(existing.entries, existing.winnerCount);
        const g = await Giveaway.findOneAndUpdate(
            { _id: existing._id },
            { $set: { winners } },
            { new: true },
        ).lean();

        // Keep the giveaway post honest: it announced the old winners, so
        // leaving it alone means two different answers to who won.
        const channel = interaction.guild.channels.cache.get(g.channelId);
        if (channel) {
            await channel.messages.fetch(g.messageId)
                .then(msg => msg.edit({ embeds: [buildGiveawayEmbed(g)], components: [buildGiveawayButton(true)] }))
                .catch(() => { /* post deleted, the reply below still stands */ });
        }

        const link = `https://discord.com/channels/${g.guildId}/${g.channelId}/${g.messageId}`;
        return interaction.reply({
            content: `🔁 Rerolled **${g.prize}**, new winner${winners.length === 1 ? '' : 's'}: ${winners.map(id => `<@${id}>`).join(', ')} [giveaway](${link})`,
            allowedMentions: { users: winners },
        });
    },
};
