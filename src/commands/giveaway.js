/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const Giveaway = require('../database/GiveawaySchema');
const { parseDuration, clampTimeout, humanizeDuration } = require('../utils/duration');
const { buildGiveawayEmbed, buildGiveawayButton, pickWinners } = require('../utils/giveawayManager');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Run a giveaway')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(sub => sub
            .setName('start')
            .setDescription('Start a giveaway')
            .addStringOption(o => o.setName('prize').setDescription('What are you giving away?').setRequired(true).setMaxLength(200))
            .addStringOption(o => o.setName('duration').setDescription('How long, e.g. 1h, 2d, 30m').setRequired(true))
            .addIntegerOption(o => o.setName('winners').setDescription('Number of winners (default 1)').setMinValue(1).setMaxValue(50).setRequired(false)))
        .addSubcommand(sub => sub
            .setName('reroll')
            .setDescription('Reroll winners for an ended giveaway')
            .addStringOption(o => o.setName('message_id').setDescription('The giveaway message ID').setRequired(true))),

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
                return interaction.editReply({ content: `🎉 Giveaway started for **${prize}** — ends in ${humanizeDuration(clampTimeout(ms))}. [→ jump](${msg.url})` });
            } catch (err) {
                logger.error('Failed to start giveaway:', err);
                return interaction.editReply({ content: 'Failed to post the giveaway. Do I have permission to send messages here?' });
            }
        }

        // reroll
        const messageId = interaction.options.getString('message_id').trim();
        const g = await Giveaway.findOne({ guildId: interaction.guild.id, messageId });
        if (!g) return interaction.reply({ content: 'No giveaway found for that message ID.', flags: MessageFlags.Ephemeral });
        if (!g.ended) return interaction.reply({ content: 'That giveaway hasn\'t ended yet.', flags: MessageFlags.Ephemeral });
        if (!g.entries.length) return interaction.reply({ content: 'That giveaway had no entries to reroll.', flags: MessageFlags.Ephemeral });

        const winners = pickWinners(g.entries, g.winnerCount);
        g.winners = winners;
        await g.save();

        const link = `https://discord.com/channels/${g.guildId}/${g.channelId}/${g.messageId}`;
        return interaction.reply({
            content: `🔁 Rerolled **${g.prize}** — new winner${winners.length === 1 ? '' : 's'}: ${winners.map(id => `<@${id}>`).join(', ')} [→ giveaway](${link})`,
            allowedMentions: { users: winners },
        });
    },
};
