/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const Event = require('../database/EventSchema');
const GuildConfig = require('../database/GuildConfigSchema');
const { buildEventEmbed, buildEventButtons } = require('../utils/eventManager');
const { parseStartTime } = require('../utils/eventRsvp');
const { fetchGameBanner } = require('../utils/steamGridClient');
const { brandedEmbed, COLORS } = require('../utils/brand');
const logger = require('../utils/logger');

// Try to auto-match the game name to a configured self-role so the right
// players get pinged without the host needing to know the role.
async function resolveGamePingRole(interaction, game, explicitRole) {
    if (explicitRole) return explicitRole.id;
    const cfg = await GuildConfig.findOne({ guildId: interaction.guild.id });
    const wanted = game.trim().toLowerCase();
    const match = (cfg?.selfRoles || []).find(r =>
        r.label.toLowerCase() === wanted ||
        interaction.guild.roles.cache.get(r.roleId)?.name.toLowerCase() === wanted);
    return match ? match.roleId : null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('event')
        .setDescription('Schedule and manage game-night events')
        .setDMPermission(false)
        .addSubcommand(sub => sub
            .setName('create')
            .setDescription('Schedule a game night with RSVP buttons')
            .addStringOption(o => o.setName('game').setDescription('Game being played').setRequired(true).setMaxLength(60))
            .addStringOption(o => o.setName('title').setDescription('Event title, e.g. "Ranked grind night"').setRequired(true).setMaxLength(100))
            .addStringOption(o => o.setName('when').setDescription('Start time: a delay like 2h / 1d, or "2026-07-25 20:00" (ET)').setRequired(true))
            .addIntegerOption(o => o.setName('capacity').setDescription('Max going before waitlist (0 = unlimited)').setMinValue(0).setMaxValue(100).setRequired(false))
            .addStringOption(o => o.setName('description').setDescription('Extra details').setRequired(false).setMaxLength(500))
            .addRoleOption(o => o.setName('ping_role').setDescription('Role to ping (defaults to the matching game self-role)').setRequired(false))
            .addBooleanOption(o => o.setName('repeat_weekly').setDescription('Re-post this event every week at the same time').setRequired(false)))
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('Show upcoming events in this server')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            const events = await Event.find({ guildId: interaction.guild.id, status: 'SCHEDULED', startsAt: { $gte: new Date() } })
                .sort({ startsAt: 1 }).limit(10);

            const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven, Events' })
                .setTitle('📅 Upcoming Events');

            if (!events.length) {
                embed.setDescription('No events scheduled. Host one with `/event create`!');
            } else {
                embed.setDescription(events.map(ev => {
                    const unix = Math.floor(new Date(ev.startsAt).getTime() / 1000);
                    const link = `https://discord.com/channels/${ev.guildId}/${ev.channelId}/${ev.messageId}`;
                    return `**[${ev.title}](${link})**, ${ev.game}\n🕒 <t:${unix}:F>, ✅ ${ev.going.length} going`;
                }).join('\n\n'));
            }
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // create
        const game = interaction.options.getString('game').trim();
        const title = interaction.options.getString('title').trim();
        const when = interaction.options.getString('when');
        const capacity = interaction.options.getInteger('capacity') ?? 0;
        const description = interaction.options.getString('description');
        const recurrence = interaction.options.getBoolean('repeat_weekly') ? 'weekly' : 'none';

        const startsAt = parseStartTime(when);
        if (!startsAt) {
            return interaction.reply({ content: 'I couldn\'t read that time. Use a delay like `2h` / `1d`, or an absolute `2026-07-25 20:00` (Eastern).', flags: MessageFlags.Ephemeral });
        }
        if (startsAt.getTime() <= Date.now()) {
            return interaction.reply({ content: 'That start time is in the past, pick a future time.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const pingRoleId = await resolveGamePingRole(interaction, game, interaction.options.getRole('ping_role'));
        // Pull a widescreen banner for the game (same source as LFG). Null if unavailable.
        const imgUrl = await fetchGameBanner(game);

        const evData = {
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
            hostId: interaction.user.id,
            game, title, description, startsAt, capacity, pingRoleId, imgUrl,
            going: [{ userId: interaction.user.id, username: interaction.user.username }], // host attends by default
            maybe: [], waitlist: [],
            status: 'SCHEDULED', startNotified: false,
            recurrence, spawnedNext: false,
        };

        try {
            const msg = await interaction.channel.send({
                content: pingRoleId ? `<@&${pingRoleId}>` : undefined,
                embeds: [buildEventEmbed(evData)],
                components: [buildEventButtons(false)],
                allowedMentions: { roles: pingRoleId ? [pingRoleId] : [] },
            });
            await Event.create({ messageId: msg.id, ...evData });
            const repeatNote = recurrence === 'weekly' ? ' It will repeat every week at this time.' : '';
            return interaction.editReply({ content: `📅 Event created! **[Jump to it](${msg.url})**${repeatNote}` });
        } catch (err) {
            logger.error('Failed to create event:', err);
            return interaction.editReply({ content: 'Failed to post the event. Do I have permission to send messages here?' });
        }
    },
};
