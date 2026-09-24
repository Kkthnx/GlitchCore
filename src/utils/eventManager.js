/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const Event = require('../database/EventSchema');
const { applyRsvp } = require('./eventRsvp');
const { addWeeksKeepingLocalTime } = require('./time');
const { bannerAttachment } = require('./eventBanners');
const { startPolling } = require('./scheduler');
const logger = require('./logger');

const BTN = { going: 'event:going', maybe: 'event:maybe', decline: 'event:decline', cancel: 'event:cancel' };

// Terminal / glitch palette (matches the LFG system's aesthetic).
const NEON_GREEN = 0x39ff14;
const NEON_AMBER = 0xffb300;
const GREY = 0x555555;
const ESC = '\x1b';
const G = `${ESC}[1;32m`;  // green
const R = `${ESC}[1;31m`;  // red
const Y = `${ESC}[1;33m`;  // amber
const D = `${ESC}[1;30m`;  // dark grey
const RST = `${ESC}[0m`;

// How long after start time an event is considered concluded and swept away.
const CONCLUDE_GRACE_MS = 2 * 60 * 60 * 1000; // 2 hours

// How long a recurring event's "starting now" heads-up stays before it self-
// deletes, so weekly reminders never pile up in the channel.
const REMINDER_PING_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// A clean, sign-up-free reminder card used for recurring events. No roster,
// slots, or buttons, just a good-looking heads-up that repeats each week.
function buildReminderEmbed(ev) {
    const started = ev.status === 'STARTED';
    const unix = Math.floor(new Date(ev.startsAt).getTime() / 1000);
    const statusText = started ? `${Y}[ LIVE NOW ]${RST}` : `${G}[ UPCOMING ]${RST}`;

    const body = [
        '```ansi',
        `${G}GAME  ${RST} : ${ev.game}`,
        `${G}STATUS${RST} : ${statusText}`,
        `${G}REPEAT${RST} : 🔁 Every week`,
        '```',
        `**> ${started ? 'STARTED' : 'STARTS'}:** <t:${unix}:F> (<t:${unix}:R>)`,
    ];
    if (ev.pingRoleId) body.push(`**> WHO:** <@&${ev.pingRoleId}>`);
    if (ev.description) body.push(`\n${ev.description}`);

    const embed = new EmbedBuilder()
        .setColor(started ? NEON_AMBER : NEON_GREEN)
        .setAuthor({ name: '⚡ SYSTEM.EVENT_REMINDER' })
        .setTitle(`> ${ev.title}`)
        .setDescription(body.join('\n'))
        .setFooter({ text: 'GLITCH_HAVEN // EVENT_SYSTEM' })
        .setTimestamp();

    // A bundled banner file is attached at send time, so reference it by name.
    if (ev.bannerFile) embed.setImage(`attachment://${ev.bannerFile}`);
    else if (ev.imgUrl) embed.setImage(ev.imgUrl);
    return embed;
}

function buildEventEmbed(ev) {
    // Recurring events are simple reminders, not RSVP events.
    if (ev.recurrence === 'weekly') return buildReminderEmbed(ev);

    const started = ev.status === 'STARTED';
    const cancelled = ev.status === 'CANCELLED';

    let color = NEON_GREEN;
    if (started) color = NEON_AMBER;
    if (cancelled) color = GREY;

    let statusText = `${G}[ SCHEDULED ]${RST}`;
    if (started) statusText = `${Y}[ LIVE NOW ]${RST}`;
    if (cancelled) statusText = `${D}[ CANCELLED ]${RST}`;

    const unix = Math.floor(new Date(ev.startsAt).getTime() / 1000);
    const cap = ev.capacity > 0 ? String(ev.capacity) : '∞';

    const header = [
        '```ansi',
        `${G}GAME  ${RST} : ${ev.game}`,
        `${G}STATUS${RST} : ${statusText}`,
        `${G}SLOTS ${RST} : ${ev.going.length} / ${cap}`,
        '```',
        `**> ${started ? 'STARTED' : 'STARTS'}:** <t:${unix}:F> (<t:${unix}:R>)`,
        `**> HOST:** <@${ev.hostId}>` + (ev.pingRoleId ? `, **> PING:** <@&${ev.pingRoleId}>` : ''),
    ];
    if (ev.description) header.push(`\n${ev.description}`);

    // Roster in a terminal slot layout.
    const roster = ['\n**> ROSTER_DATA:**'];
    if (ev.capacity > 0) {
        for (let i = 0; i < ev.capacity; i++) {
            const m = ev.going[i];
            const slot = `\`[${String(i + 1).padStart(2, '0')}]\``;
            roster.push(m ? `${slot} <@${m.userId}>${m.userId === ev.hostId ? ' **(Host)**' : ''}` : `${slot} \`[ ... OPEN ... ]\``);
        }
    } else if (ev.going.length) {
        ev.going.forEach((m, i) => roster.push(`\`[${String(i + 1).padStart(2, '0')}]\` <@${m.userId}>${m.userId === ev.hostId ? ' **(Host)**' : ''}`));
    } else {
        roster.push('`[ ... no attendees yet ... ]`');
    }
    if (ev.maybe.length) roster.push(`\n**> MAYBE:** ${ev.maybe.map(m => `<@${m.userId}>`).join(', ')}`);
    if (ev.waitlist.length) roster.push(`**> WAITLIST:** ${ev.waitlist.map(m => `<@${m.userId}>`).join(', ')}`);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `⚡ SYSTEM.EVENT_${ev.status}` })
        .setTitle(`> ${ev.title}`)
        .setDescription(header.join('\n') + '\n' + roster.join('\n'))
        .setFooter({ text: 'GLITCH_HAVEN // EVENT_SYSTEM' })
        .setTimestamp();

    if (ev.imgUrl) embed.setImage(ev.imgUrl);
    return embed;
}

function buildEventButtons(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(BTN.going).setLabel('JOIN').setEmoji('🟩').setStyle(ButtonStyle.Success).setDisabled(disabled),
        new ButtonBuilder().setCustomId(BTN.maybe).setLabel('MAYBE').setEmoji('🟨').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId(BTN.decline).setLabel('DROP').setEmoji('🟥').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId(BTN.cancel).setLabel('ABORT').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    );
}

// How many times to retry an RSVP that lost a race. Three is plenty: each
// retry only loses to a write that landed in the microseconds since our read.
const RSVP_ATTEMPTS = 3;

/**
 * Applies an RSVP and persists it without losing a concurrent one.
 *
 * Everyone RSVPs to the same message, so this is the most contended write in
 * the bot. Reading the rosters, computing new ones and saving the whole
 * document back means two members clicking at the same moment both build their
 * arrays from the same snapshot, and whoever saves second erases the first.
 *
 * The roster maths stays in the pure, unit-tested applyRsvp (capacity limits
 * and waitlist promotion are too entangled to express as field operators), so
 * the write is guarded instead: it only lands if the document's version is
 * still the one we read. If it isn't, we read again and redo the maths.
 *
 * @returns {{ event?, result?, reason?: 'missing'|'closed'|'contended' }}
 */
async function commitRsvp(messageId, member, choice, attempts = RSVP_ATTEMPTS) {
    for (let attempt = 0; attempt < attempts; attempt++) {
        const ev = await Event.findOne({ messageId }).lean();
        if (!ev) return { reason: 'missing' };
        if (ev.status !== 'SCHEDULED') return { reason: 'closed' };

        const result = applyRsvp(ev, member, choice, ev.capacity);

        // The compare half of compare-and-swap: no match means someone else
        // wrote first, so our computed rosters are stale and get discarded.
        // Mongoose stamps __v on everything it creates, but "still has no
        // version" is just as valid a thing to compare against as "still at
        // version N", and $inc will set it to 1. Matching on a literal 0 would
        // never match such a document, wedging its RSVPs permanently.
        const versionGuard = ev.__v === undefined ? { __v: { $exists: false } } : { __v: ev.__v };

        const event = await Event.findOneAndUpdate(
            { _id: ev._id, ...versionGuard },
            {
                $set: { going: result.going, maybe: result.maybe, waitlist: result.waitlist },
                $inc: { __v: 1 },
            },
            { new: true },
        ).lean();

        if (event) return { event, result };
    }

    return { reason: 'contended' };
}

// ── RSVP button ──────────────────────────────────────────────────────────────
async function handleEventRsvp(interaction, choice) {
    const member = { userId: interaction.user.id, username: interaction.user.username };
    const { event: ev, result, reason } = await commitRsvp(interaction.message.id, member, choice);

    if (reason === 'missing') return interaction.reply({ content: 'This event no longer exists.', flags: MessageFlags.Ephemeral });
    if (reason === 'closed') return interaction.reply({ content: 'This event is closed for RSVPs.', flags: MessageFlags.Ephemeral });
    if (reason === 'contended') {
        // Nothing was written, so nothing was lost: they can just click again.
        return interaction.reply({ content: 'A few people RSVP\'d at once, give that another click.', flags: MessageFlags.Ephemeral });
    }

    await interaction.update({ embeds: [buildEventEmbed(ev)], components: [buildEventButtons(false)] });

    const messages = {
        going: '✅ You\'re in, see you there!',
        maybe: '❔ Marked as *maybe*.',
        waitlisted: '⏳ The event is full, you\'re on the **waitlist** and will be promoted automatically if a spot opens.',
        maybe_removed: 'You\'ve been removed from the event.',
        removed: 'You\'ve been removed from the event.',
    };
    await interaction.followUp({ content: messages[result.status] || 'Updated.', flags: MessageFlags.Ephemeral }).catch(() => {});

    // Tell anyone auto-promoted off the waitlist.
    for (const userId of result.promoted) {
        if (userId === interaction.user.id) continue;
        interaction.guild.members.fetch(userId)
            .then(m => m.send(`⏳➡️✅ A spot opened up, you're now **going** to **${ev.title}** in ${interaction.guild.name}!`))
            .catch(() => {});
    }
}

// ── Cancel button ────────────────────────────────────────────────────────────
async function handleEventCancel(interaction) {
    const ev = await Event.findOne({ messageId: interaction.message.id }, { hostId: 1, status: 1 }).lean();
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

    // Targeted update: the event is about to be scrubbed, but writing the whole
    // document back would still clobber an RSVP made since the read above, and
    // the roster below is what gets notified.
    const cancelled = await Event.findOneAndUpdate(
        { _id: ev._id, status: { $ne: 'CANCELLED' } },
        { $set: { status: 'CANCELLED' } },
        { new: true },
    ).lean();
    if (!cancelled) {
        return interaction.reply({ content: 'This event is already cancelled.', flags: MessageFlags.Ephemeral });
    }

    // Show a glitchy self-destruct state, notify the roster, then scrub it.
    const embed = buildEventEmbed(cancelled);
    embed.setDescription(`${embed.data.description}\n\`\`\`ansi\n${R}[ EVENT ABORTED, PURGING IN T-MINUS 8s ]${RST}\n\`\`\``);
    await interaction.update({ embeds: [embed], components: [buildEventButtons(true)] });

    const going = cancelled.going.map(m => m.userId);
    if (going.length) {
        interaction.channel.send({
            content: `❌ **${cancelled.title}** was aborted by the host. ${going.map(id => `<@${id}>`).join(' ')}`,
            allowedMentions: { users: going },
        }).catch(() => {});
    }

    // Self-destruct: delete the message + record so the channel stays clean.
    setTimeout(async () => {
        await interaction.message.delete().catch(() => {});
        await Event.deleteOne({ _id: ev._id }).catch(() => {});
    }, 8000);
}

// ── Cleanup: sweep away concluded events (started + grace) and stray cancels ──
async function cleanUpFinishedEvents(client) {
    const guildIds = [...client.guilds.cache.keys()];
    if (!guildIds.length) return;

    const now = Date.now();
    let stale;
    try {
        stale = await Event.find({
            guildId: { $in: guildIds },
            $or: [
                { status: 'STARTED', startsAt: { $lt: new Date(now - CONCLUDE_GRACE_MS) } },
                { status: 'CANCELLED' },
            ],
        });
    } catch (err) {
        return logger.error('[EVENTS] Cleanup query failed:', err);
    }

    for (const ev of stale) {
        const guild = client.guilds.cache.get(ev.guildId);
        const channel = guild?.channels.cache.get(ev.channelId);
        if (channel) {
            await channel.messages.fetch(ev.messageId).then(m => m.delete()).catch(() => {});
        }
        await Event.deleteOne({ _id: ev._id }).catch(() => {});
    }
    if (stale.length) logger.info(`[EVENTS] Cleaned up ${stale.length} finished/cancelled event(s).`);
}

// ── Recurrence: post next week's copy of a weekly event ──────────────────────
async function spawnNextOccurrence(client, ev) {
    const guild = client.guilds.cache.get(ev.guildId);
    const channel = guild?.channels.cache.get(ev.channelId);
    if (!channel) return;

    // Advance a full week, and keep advancing if the bot was down long enough
    // that "next week" is itself already past, so we never post a backlog of
    // stale reminders, only the next real occurrence.
    let nextStartsAt = addWeeksKeepingLocalTime(ev.startsAt, 1);
    while (nextStartsAt.getTime() <= Date.now()) {
        nextStartsAt = addWeeksKeepingLocalTime(nextStartsAt, 1);
    }

    const evData = {
        guildId: ev.guildId,
        channelId: ev.channelId,
        hostId: ev.hostId,
        game: ev.game,
        title: ev.title,
        description: ev.description,
        startsAt: nextStartsAt,
        capacity: ev.capacity,
        imgUrl: ev.imgUrl,
        pingRoleId: ev.pingRoleId,
        bannerFile: ev.bannerFile,
        // Reminder-style, no sign-ups, so no roster is tracked.
        going: [], maybe: [], waitlist: [],
        status: 'SCHEDULED', startNotified: false,
        recurrence: 'weekly', spawnedNext: false,
    };

    try {
        const banner = bannerAttachment(evData.bannerFile);
        const msg = await channel.send({
            embeds: [buildEventEmbed(evData)],
            files: banner ? [banner] : [],
            allowedMentions: { parse: [] },
        });
        await Event.create({ messageId: msg.id, ...evData });
        logger.info(`[EVENTS] Spawned next weekly "${ev.title}" for ${nextStartsAt.toISOString()}.`);
    } catch (err) {
        logger.error(`[EVENTS] Failed to spawn next occurrence of "${ev.title}":`, err);
    }
}

// ── Scheduler: ping rosters for events whose start time has arrived ───────────
async function processStartingEvents(client) {
    const guildIds = [...client.guilds.cache.keys()];
    if (!guildIds.length) return;

    const now = new Date();
    let due;
    try {
        due = await Event.find({ guildId: { $in: guildIds }, status: 'SCHEDULED', startNotified: false, startsAt: { $lte: now } });
    } catch (err) {
        return logger.error('[EVENTS] Failed to query due events:', err);
    }

    for (const pending of due) {
        // Claim the event before doing anything visible. Flipping startNotified
        // as the filter makes this at-most-once: a slow tick that overlaps the
        // next one, or a second shard that sees the same row, finds nothing to
        // claim and moves on instead of pinging the roster twice.
        //
        // It also hands back the current document, so the roster we ping is the
        // one as of now rather than the snapshot from the top of the tick. The
        // old code saved that whole snapshot back, dropping anyone who RSVP'd
        // while the tick was running.
        const ev = await Event.findOneAndUpdate(
            { _id: pending._id, startNotified: false },
            { $set: { startNotified: true, status: 'STARTED' } },
            { new: true },
        ).lean().catch(err => {
            logger.error(`[EVENTS] Could not claim ${pending._id}:`, err);
            return null;
        });
        if (!ev) continue; // already handled elsewhere

        const weekly = ev.recurrence === 'weekly';

        // Post next week's copy once so a weekly event is always up in the
        // channel. The claim above already makes this run once, and spawnedNext
        // keeps that true across a restart mid-tick.
        if (weekly && !ev.spawnedNext) {
            await Event.updateOne({ _id: ev._id }, { $set: { spawnedNext: true } }).catch(() => {});
            await spawnNextOccurrence(client, ev);
        }

        const guild = client.guilds.cache.get(ev.guildId);
        const channel = guild?.channels.cache.get(ev.channelId);
        if (!channel) continue; // already marked STARTED by the claim

        if (weekly) {
            // Simple "starting now" heads-up, no roster since there are no
            // sign-ups. Ping the role if one is set. The heads-up self-deletes
            // after a grace window so weekly reminders never pile up.
            const rolePing = ev.pingRoleId ? `<@&${ev.pingRoleId}> ` : '';
            channel.send({
                content: `🎮 **${ev.title}** is starting now! ${rolePing}`.trim(),
                allowedMentions: { roles: ev.pingRoleId ? [ev.pingRoleId] : [] },
            }).then(ping => {
                setTimeout(() => ping.delete().catch(() => {}), REMINDER_PING_TTL_MS);
            }).catch(err => logger.warn(`[EVENTS] Start ping failed for ${ev._id}: ${err.message}`));

            // Replace itself: delete the old card so the channel only shows the
            // upcoming one, not a pile of finished reminders.
            await channel.messages.fetch(ev.messageId).then(m => m.delete()).catch(() => {});
            await Event.deleteOne({ _id: ev._id }).catch(() => {});
        } else {
            // Ping the RSVP roster that it's game time.
            const roster = ev.going.map(m => `<@${m.userId}>`).join(' ');
            const rolePing = ev.pingRoleId ? `<@&${ev.pingRoleId}> ` : '';
            channel.send({
                content: `🎮 **It's game time, ${ev.title}!** ${rolePing}\n${roster || '*No one RSVP\'d, but the lobby is open.*'}`,
                allowedMentions: { users: ev.going.map(m => m.userId), roles: ev.pingRoleId ? [ev.pingRoleId] : [] },
            }).catch(err => logger.warn(`[EVENTS] Start ping failed for ${ev._id}: ${err.message}`));

            // Already marked STARTED by the claim; the 2h cleanup sweeps it later.
            channel.messages.fetch(ev.messageId)
                .then(msg => msg.edit({ embeds: [buildEventEmbed(ev)], components: [buildEventButtons(true)] }))
                .catch(() => {});
        }

        logger.info(`[EVENTS] Started event "${ev.title}" (${ev.going.length} going).`);
    }
}

function startEventScheduler(client) {
    // Start-time pings: check once a minute (cheap indexed query, at-most-once).
    startPolling({
        name: 'EVENTS',
        task: () => processStartingEvents(client),
        intervalMs: 60 * 1000,
    });

    // Cleanup: sweep concluded/cancelled events every 15 minutes (+ once on boot).
    startPolling({
        name: 'EVENTS_CLEANUP',
        task: () => cleanUpFinishedEvents(client),
        intervalMs: 15 * 60 * 1000,
        immediate: true,
    });
}

module.exports = {
    BTN,
    commitRsvp,
    buildEventEmbed,
    buildEventButtons,
    handleEventRsvp,
    handleEventCancel,
    processStartingEvents,
    cleanUpFinishedEvents,
    startEventScheduler,
};
