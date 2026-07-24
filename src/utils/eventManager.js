const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const Event = require('../database/EventSchema');
const { applyRsvp } = require('./eventRsvp');
const { brandedEmbed, COLORS } = require('./brand');
const logger = require('./logger');

const BTN = { going: 'event:going', maybe: 'event:maybe', decline: 'event:decline', cancel: 'event:cancel' };

function rosterText(list) {
    return list.length ? list.map(m => `<@${m.userId}>`).join(', ') : '—';
}

function buildEventEmbed(ev) {
    let color = COLORS.primary;
    if (ev.status === 'STARTED') color = COLORS.success;
    if (ev.status === 'CANCELLED') color = COLORS.neutral;

    const unix = Math.floor(new Date(ev.startsAt).getTime() / 1000);
    const goingLabel = ev.capacity > 0 ? `✅ Going (${ev.going.length}/${ev.capacity})` : `✅ Going (${ev.going.length})`;

    const statusTag = ev.status === 'CANCELLED' ? ' — ❌ CANCELLED'
        : ev.status === 'STARTED' ? ' — 🟢 STARTED' : '';

    const embed = brandedEmbed({ color, footer: 'Glitch Haven • Events' })
        .setAuthor({ name: `🎮 ${ev.game}` })
        .setTitle(`${ev.title}${statusTag}`)
        .setDescription(
            (ev.description ? `${ev.description}\n\n` : '') +
            `🕒 **When:** <t:${unix}:F> (<t:${unix}:R>)\n` +
            `👑 **Host:** <@${ev.hostId}>` +
            (ev.pingRoleId ? `\n🔔 **Pinging:** <@&${ev.pingRoleId}>` : '')
        )
        .addFields(
            { name: goingLabel, value: rosterText(ev.going), inline: false },
            { name: `❔ Maybe (${ev.maybe.length})`, value: rosterText(ev.maybe), inline: false },
        );

    if (ev.capacity > 0 && ev.waitlist.length) {
        embed.addFields({ name: `⏳ Waitlist (${ev.waitlist.length})`, value: rosterText(ev.waitlist), inline: false });
    }
    return embed;
}

function buildEventButtons(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(BTN.going).setLabel('Going').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(disabled),
        new ButtonBuilder().setCustomId(BTN.maybe).setLabel('Maybe').setEmoji('❔').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId(BTN.decline).setLabel('Can\'t make it').setEmoji('❌').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId(BTN.cancel).setLabel('Cancel event').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    );
}

// ── RSVP button ──────────────────────────────────────────────────────────────
async function handleEventRsvp(interaction, choice) {
    const ev = await Event.findOne({ messageId: interaction.message.id });
    if (!ev) return interaction.reply({ content: 'This event no longer exists.', flags: MessageFlags.Ephemeral });
    if (ev.status !== 'SCHEDULED') {
        return interaction.reply({ content: 'This event is closed for RSVPs.', flags: MessageFlags.Ephemeral });
    }

    const member = { userId: interaction.user.id, username: interaction.user.username };
    const result = applyRsvp(ev, member, choice, ev.capacity);

    ev.going = result.going;
    ev.maybe = result.maybe;
    ev.waitlist = result.waitlist;
    await ev.save();

    await interaction.update({ embeds: [buildEventEmbed(ev)], components: [buildEventButtons(false)] });

    const messages = {
        going: '✅ You\'re in — see you there!',
        maybe: '❔ Marked as *maybe*.',
        waitlisted: '⏳ The event is full — you\'re on the **waitlist** and will be promoted automatically if a spot opens.',
        maybe_removed: 'You\'ve been removed from the event.',
        removed: 'You\'ve been removed from the event.',
    };
    await interaction.followUp({ content: messages[result.status] || 'Updated.', flags: MessageFlags.Ephemeral }).catch(() => {});

    // Tell anyone auto-promoted off the waitlist.
    for (const userId of result.promoted) {
        if (userId === interaction.user.id) continue;
        interaction.guild.members.fetch(userId)
            .then(m => m.send(`⏳➡️✅ A spot opened up — you're now **going** to **${ev.title}** in ${interaction.guild.name}!`))
            .catch(() => {});
    }
}

// ── Cancel button ────────────────────────────────────────────────────────────
async function handleEventCancel(interaction) {
    const ev = await Event.findOne({ messageId: interaction.message.id });
    if (!ev) return interaction.reply({ content: 'This event no longer exists.', flags: MessageFlags.Ephemeral });

    const isHost = interaction.user.id === ev.hostId;
    const canManage = interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)
        || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
    if (!isHost && !canManage) {
        return interaction.reply({ content: 'Only the host or a server manager can cancel this event.', flags: MessageFlags.Ephemeral });
    }
    if (ev.status === 'CANCELLED') {
        return interaction.reply({ content: 'This event is already cancelled.', flags: MessageFlags.Ephemeral });
    }

    ev.status = 'CANCELLED';
    await ev.save();
    await interaction.update({ embeds: [buildEventEmbed(ev)], components: [buildEventButtons(true)] });

    const mentions = ev.going.map(m => `<@${m.userId}>`).join(' ');
    if (mentions) {
        await interaction.channel.send({
            content: `❌ **${ev.title}** was cancelled by the host. ${mentions}`,
            allowedMentions: { users: ev.going.map(m => m.userId) },
        }).catch(() => {});
    }
}

// ── Scheduler: ping rosters for events whose start time has arrived ───────────
async function processStartingEvents(client) {
    const now = new Date();
    let due;
    try {
        due = await Event.find({ status: 'SCHEDULED', startNotified: false, startsAt: { $lte: now } });
    } catch (err) {
        return logger.error('[EVENTS] Failed to query due events:', err);
    }

    for (const ev of due) {
        ev.startNotified = true;
        ev.status = 'STARTED';
        await ev.save().catch(() => {});

        const guild = client.guilds.cache.get(ev.guildId);
        const channel = guild?.channels.cache.get(ev.channelId);
        if (!channel) continue;

        // Refresh the original message to the STARTED state, buttons disabled.
        channel.messages.fetch(ev.messageId)
            .then(msg => msg.edit({ embeds: [buildEventEmbed(ev)], components: [buildEventButtons(true)] }))
            .catch(() => {});

        const roster = ev.going.map(m => `<@${m.userId}>`).join(' ');
        const rolePing = ev.pingRoleId ? `<@&${ev.pingRoleId}> ` : '';
        channel.send({
            content: `🎮 **It's game time — ${ev.title}!** ${rolePing}\n${roster || '*No one RSVP\'d, but the lobby is open.*'}`,
            allowedMentions: { users: ev.going.map(m => m.userId), roles: ev.pingRoleId ? [ev.pingRoleId] : [] },
        }).catch(err => logger.warn(`[EVENTS] Start ping failed for ${ev._id}: ${err.message}`));

        logger.info(`[EVENTS] Started event "${ev.title}" (${ev.going.length} going).`);
    }
}

function startEventScheduler(client) {
    // Check once a minute — cheap indexed query, at-most-once start ping.
    setInterval(() => processStartingEvents(client).catch(err => logger.error('[EVENTS] Scheduler tick failed:', err)), 60 * 1000);
}

module.exports = {
    BTN,
    buildEventEmbed,
    buildEventButtons,
    handleEventRsvp,
    handleEventCancel,
    processStartingEvents,
    startEventScheduler,
};
