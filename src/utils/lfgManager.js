/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const {
    ModalBuilder, TextInputBuilder, TextInputStyle,
    ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const LfgSession = require('../database/LfgSchema');
const { fetchGameBanner } = require('./steamGridClient');
const { getGuildConfig } = require('./guildConfigCache');
const channels = require('./channels');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// Color constants (hex -> decimal for discord.js EmbedBuilder)
// ---------------------------------------------------------------------------
const NEON_GREEN = 0x39FF14;
const NEON_RED   = 0xFF003C;

// ANSI escape helpers (work inside ```ansi code blocks in Discord)
const ESC = '\x1b';
const G   = `${ESC}[1;32m`; // bold green
const R   = `${ESC}[1;31m`; // bold red
const RST = `${ESC}[0m`;    // reset

// ---------------------------------------------------------------------------
// Embed builder, reconstructs the terminal embed from a session document
// ---------------------------------------------------------------------------
function buildLfgEmbed(session) {
    const isLocked   = session.status === 'LOCKED';
    const isCanceled = session.status === 'CANCELLED';
    
    let color = NEON_GREEN;
    if (isLocked) color = NEON_RED;
    if (isCanceled) color = 0x555555; // Gray for canceled

    const filled   = session.roster.length;

    // Terminal status header inside an ANSI code block
    let statusText = `${G}[ OPEN   ]${RST}`;
    if (isLocked) statusText = `${R}[ LOCKED ]${RST}`;
    if (isCanceled) statusText = `${ESC}[1;30m[ CANCELLED ]${RST}`; // Dark gray

    // Calculate expiration (1h after last activity/updatedAt, or now + 1h if new)
    const lastActivity = session.updatedAt ? new Date(session.updatedAt) : new Date();
    const expiresTimestamp = Math.floor((lastActivity.getTime() + 60 * 60 * 1000) / 1000);

    const headerLines = [
        '```ansi',
        `${G}ACTIVITY${RST} : ${session.activity}`,
        `${G}STATUS  ${RST} : ${statusText}`,
        `${G}SLOTS   ${RST} : ${filled} / ${session.totalSlots}`,
        '```'
    ];

    if (!isLocked && !isCanceled) {
        headerLines.push(`**> EXPIRES:** <t:${expiresTimestamp}:R>`);
    }

    const header = headerLines.join('\n');

    // Roster lines, mentions work outside code blocks
    const rosterLines = ['\n**> ROSTER_DATA:**'];
    for (let i = 0; i < session.totalSlots; i++) {
        const member = session.roster[i];
        if (member) {
            const tag = member.userId === session.hostId ? ' **(Leader)**' : '';
            rosterLines.push(`\`[${i + 1}]\` <@${member.userId}>${tag}`);
        } else {
            rosterLines.push(`\`[${i + 1}]\` \`[ ... EMPTY ... ]\``);
        }
    }

    // Waitlist (only shown when someone is queued behind a full roster).
    if (session.waitlist && session.waitlist.length) {
        rosterLines.push('\n**> WAITLIST:**');
        session.waitlist.forEach((member, i) => {
            rosterLines.push(`\`(${i + 1})\` <@${member.userId}>`);
        });
    }

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: '⚡ SYSTEM.LFG_OVERRIDE' })
        .setTitle(`> INITIATING_LOBBY: ${session.game}`)
        .setDescription(header + rosterLines.join('\n'))
        .setFooter({ text: 'GLITCH_HAVEN // SYSTEM_ACTIVE_' })
        .setTimestamp();

    if (session.imgUrl) {
        embed.setImage(session.imgUrl);
    }

    return embed;
}

// ---------------------------------------------------------------------------
// Button row builder
// ---------------------------------------------------------------------------
function buildLfgButtons(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('lfg_inject')
            .setLabel('INJECT')
            .setEmoji('🟩')
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('lfg_abort')
            .setLabel('ABORT')
            .setEmoji('🟥')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('lfg_execute')
            .setLabel('EXECUTE')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('lfg_cancel')
            .setLabel('CANCEL')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
    );
}

// ---------------------------------------------------------------------------
// Show the creation modal, called by the /lfg slash command
// ---------------------------------------------------------------------------
async function showLfgModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('lfg_modal')
        .setTitle('// LFG_SYSTEM.CREATE');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('lfg_game')
                .setLabel('GAME')
                .setPlaceholder('e.g. World of Warcraft, Valorant, Elden Ring')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(50),
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('lfg_activity')
                .setLabel('ACTIVITY / MODE')
                .setPlaceholder('e.g. Mythic+, Ranked, Chill / Casual')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(50),
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('lfg_slots')
                .setLabel('PLAYER SLOTS (2-10)')
                .setPlaceholder('e.g. 5')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(2),
        ),
    );

    await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Modal submit, validates, posts embed, saves to DB
// ---------------------------------------------------------------------------
async function handleModalSubmit(interaction) {
    const game       = interaction.fields.getTextInputValue('lfg_game').trim();
    const activity   = interaction.fields.getTextInputValue('lfg_activity').trim();
    const totalSlots = parseInt(interaction.fields.getTextInputValue('lfg_slots').trim(), 10);

    if (isNaN(totalSlots) || totalSlots < 2 || totalSlots > 10) {
        return interaction.reply({
            content: '`ERROR_422` : Slots must be a number between **2** and **10**.',
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const lfgChannel = interaction.guild.channels.cache.get(channels.lfg);
    if (!lfgChannel) {
        return interaction.editReply({ content: '`ERROR_404` : LFG channel not configured. Contact an admin.' });
    }

    // Try to fetch a banner from SteamGridDB
    const imgUrl = await fetchGameBanner(game);

    // Host auto-fills slot 1 as Leader
    const roster = [{ userId: interaction.user.id, username: interaction.user.username }];

    const sessionData = { hostId: interaction.user.id, game, activity, totalSlots, roster, status: 'OPEN', imgUrl };
    const embed   = buildLfgEmbed(sessionData);
    const buttons = buildLfgButtons(false);

    // Ping the opt-in LFG role so interested members get alerted.
    const guildCfg = await getGuildConfig(interaction.guild.id) || {};
    const pingRoleId = guildCfg.lfgPingRoleId;

    try {
        const msg = await lfgChannel.send({
            content: pingRoleId ? `<@&${pingRoleId}> a new LFG just dropped for **${game}**` : undefined,
            embeds: [embed],
            components: [buttons],
            allowedMentions: { roles: pingRoleId ? [pingRoleId] : [] },
        });

        await LfgSession.create({
            messageId: msg.id,
            channelId: lfgChannel.id,
            guildId:   interaction.guild.id,
            ...sessionData,
        });

        await interaction.editReply({
            content: `\`SESSION_ACTIVE\`, LFG is live! **[Jump to it](${msg.url})**`,
        });
    } catch (err) {
        logger.error('Failed to create LFG session:', err);
        await interaction.editReply({
            content: '`ERROR_500` : Failed to post the LFG. Check that the bot has **Send Messages** permission in the LFG channel.',
        });
    }
}

// ---------------------------------------------------------------------------
// INJECT, add user to roster
// ---------------------------------------------------------------------------
async function handleInject(interaction) {
    const userId = interaction.user.id;

    const member = { userId, username: interaction.user.username };

    // 1. Atomic roster add, enforces OPEN, not already in roster/waitlist, and
    // a free slot in a single operation (closes the overfill race).
    const joined = await LfgSession.findOneAndUpdate(
        {
            messageId: interaction.message.id,
            status: 'OPEN',
            'roster.userId': { $ne: userId },
            'waitlist.userId': { $ne: userId },
            $expr: { $lt: [{ $size: '$roster' }, '$totalSlots'] },
        },
        { $push: { roster: member } },
        { new: true }
    );

    if (joined) {
        return interaction.update({ embeds: [buildLfgEmbed(joined)], components: [buildLfgButtons(false)] });
    }

    // 2. Roster full, atomically join the waitlist instead.
    const waitlisted = await LfgSession.findOneAndUpdate(
        {
            messageId: interaction.message.id,
            status: 'OPEN',
            'roster.userId': { $ne: userId },
            'waitlist.userId': { $ne: userId },
            $expr: { $gte: [{ $size: '$roster' }, '$totalSlots'] },
        },
        { $push: { waitlist: member } },
        { new: true }
    );

    if (waitlisted) {
        await interaction.update({ embeds: [buildLfgEmbed(waitlisted)], components: [buildLfgButtons(false)] });
        return interaction.followUp({ content: '`QUEUED` : Roster is full, you\'re on the **waitlist** and will be pulled in automatically if a slot opens.', flags: MessageFlags.Ephemeral });
    }

    // 3. Nothing matched, re-read to give a precise reason.
    const session = await LfgSession.findOne({ messageId: interaction.message.id });
    if (!session) return interaction.reply({ content: '`ERROR_404` : Session not found.', flags: MessageFlags.Ephemeral });
    if (session.status === 'LOCKED') return interaction.reply({ content: '`ERROR_403` : Session is **LOCKED**.', flags: MessageFlags.Ephemeral });
    if (session.status === 'CANCELLED') return interaction.reply({ content: '`ERROR_410` : Session has been cancelled.', flags: MessageFlags.Ephemeral });
    if (session.waitlist.some(m => m.userId === userId)) {
        return interaction.reply({ content: '`ERROR_409` : You are already on the **waitlist**.', flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: '`ERROR_409` : You are already injected into this session.', flags: MessageFlags.Ephemeral });
}

// ---------------------------------------------------------------------------
// ABORT, remove user from roster
// ---------------------------------------------------------------------------
async function handleAbort(interaction) {
    const userId = interaction.user.id;
    const session = await LfgSession.findOne({ messageId: interaction.message.id });
    if (!session) return interaction.reply({ content: '`ERROR_404` : Session not found.', flags: MessageFlags.Ephemeral });
    if (session.status === 'LOCKED') return interaction.reply({ content: '`ERROR_403` : Cannot abort a **LOCKED** session.', flags: MessageFlags.Ephemeral });

    if (userId === session.hostId) {
        return interaction.reply({
            content: '`ERROR_403` : Leaders cannot abort. Use 🔒 **EXECUTE** to lock and end the session.',
            flags: MessageFlags.Ephemeral,
        });
    }

    // Atomic removal from the roster (guarded so a concurrent LOCK can't be clobbered).
    let updated = await LfgSession.findOneAndUpdate(
        { messageId: interaction.message.id, status: { $ne: 'LOCKED' }, 'roster.userId': userId },
        { $pull: { roster: { userId } } },
        { new: true }
    );

    if (updated) {
        // A roster slot freed up, atomically promote the first waitlister.
        const next = updated.waitlist[0];
        if (next) {
            const promoted = await LfgSession.findOneAndUpdate(
                {
                    messageId: interaction.message.id,
                    status: { $ne: 'LOCKED' },
                    'waitlist.userId': next.userId,
                    $expr: { $lt: [{ $size: '$roster' }, '$totalSlots'] },
                },
                { $pull: { waitlist: { userId: next.userId } }, $push: { roster: { userId: next.userId, username: next.username } } },
                { new: true }
            );
            if (promoted) {
                updated = promoted;
                interaction.client.users.fetch(next.userId)
                    .then(u => u.send(`⏳➡️✅ A slot opened in the **${promoted.game}** LFG, you've been pulled off the waitlist! ${interaction.message.url}`))
                    .catch(() => {});
            }
        }
        return interaction.update({ embeds: [buildLfgEmbed(updated)], components: [buildLfgButtons(false)] });
    }

    // Not in the roster, try removing them from the waitlist instead.
    const leftWaitlist = await LfgSession.findOneAndUpdate(
        { messageId: interaction.message.id, status: { $ne: 'LOCKED' }, 'waitlist.userId': userId },
        { $pull: { waitlist: { userId } } },
        { new: true }
    );

    if (!leftWaitlist) {
        return interaction.reply({ content: '`ERROR_404` : You are not in this session.', flags: MessageFlags.Ephemeral });
    }

    await interaction.update({ embeds: [buildLfgEmbed(leftWaitlist)], components: [buildLfgButtons(false)] });
}

// ---------------------------------------------------------------------------
// EXECUTE, host locks the session, pings the full roster
// ---------------------------------------------------------------------------
async function handleExecute(interaction) {
    const session = await LfgSession.findOne({ messageId: interaction.message.id });
    if (!session) return interaction.reply({ content: '`ERROR_404` : Session not found.', flags: MessageFlags.Ephemeral });

    if (interaction.user.id !== session.hostId) {
        return interaction.reply({ content: '`ERROR_403` : Only the **Leader** can EXECUTE the lock.', flags: MessageFlags.Ephemeral });
    }
    if (session.status === 'LOCKED') {
        return interaction.reply({ content: '`ERROR_409` : Session is already **LOCKED**.', flags: MessageFlags.Ephemeral });
    }

    session.status = 'LOCKED';
    await session.save();

    // Update embed to red/locked state with disabled buttons
    await interaction.update({ embeds: [buildLfgEmbed(session)], components: [buildLfgButtons(true)] });

    // Ping all roster members in a follow-up message
    const mentions = session.roster.map(m => `<@${m.userId}>`).join(' ');
    await interaction.channel.send({
        content: [
            `🔒 **SESSION LOCKED**, ${mentions}`,
            `\`\`\`ansi`,
            `${R}> GROUP_FORMED, RALLY UP. GLITCH_HAVEN AWAITS.${RST}`,
            `\`\`\``,
            ].join('\n'),
    });
}

// ---------------------------------------------------------------------------
// CANCEL, host deletes the session
// ---------------------------------------------------------------------------
async function handleCancel(interaction) {
    try {
        const session = await LfgSession.findOne({ messageId: interaction.message.id });
        if (!session) return interaction.reply({ content: '`ERROR_404` : Session not found.', flags: MessageFlags.Ephemeral });

        if (interaction.user.id !== session.hostId) {
            return interaction.reply({ content: '`ERROR_403` : Only the **Leader** can CANCEL the session.', flags: MessageFlags.Ephemeral });
        }
        
        if (session.status === 'CANCELLED') {
            return interaction.reply({ content: '`ERROR_409` : Session is already cancelling.', flags: MessageFlags.Ephemeral });
        }

        session.status = 'CANCELLED';
        await session.save();

        const embed = buildLfgEmbed(session);
        // Append destruct warning
        embed.setDescription(embed.data.description + `\n\n\`\`\`ansi\n${R}[ DESTRUCT SEQUENCE INITIATED... T-MINUS 5 SECONDS ]${RST}\n\`\`\``);

        // Acknowledge interaction, update embed, and disable all buttons
        await interaction.update({ embeds: [embed], components: [buildLfgButtons(true)] });

        // Non-blocking 5-second wait
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Delete the message if it still exists
        try {
            await interaction.message.delete();
        } catch (err) {
            logger.warn(`Could not delete LFG message ${interaction.message.id}: ${err.message}`);
        }

        // Scrub from DB
        await LfgSession.deleteOne({ messageId: interaction.message.id });
    } catch (err) {
        logger.error('Error during LFG cancel:', err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '`ERROR_500` : Failed to cancel session.', flags: MessageFlags.Ephemeral });
        }
    }
}

// ---------------------------------------------------------------------------
// Auto-cleanup stale OPEN LFG sessions (inactive for 1 hour)
// ---------------------------------------------------------------------------
async function cleanUpStaleLfgSessions(client) {
    // Only this shard's guilds, so a shard never deletes another shard's data.
    const guildIds = [...client.guilds.cache.keys()];
    if (!guildIds.length) return;

    const thresholdDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    try {
        const staleSessions = await LfgSession.find({
            guildId: { $in: guildIds },
            status: 'OPEN',
            updatedAt: { $lt: thresholdDate }
        });

        if (staleSessions.length === 0) return;

        logger.info(`Found ${staleSessions.length} inactive LFG session(s) to self-destruct.`);

        for (const session of staleSessions) {
            const guild = client.guilds.cache.get(session.guildId);
            if (!guild) {
                await LfgSession.deleteOne({ _id: session._id });
                continue;
            }

            const channel = guild.channels.cache.get(session.channelId);
            if (!channel) {
                await LfgSession.deleteOne({ _id: session._id });
                continue;
            }

            try {
                const message = await channel.messages.fetch(session.messageId);
                if (message) {
                    await message.delete();
                }
            } catch (err) {
                logger.warn(`Could not delete stale LFG message ${session.messageId}: ${err.message}`);
            }

            // Scrub from DB
            await LfgSession.deleteOne({ _id: session._id });
        }
    } catch (err) {
        logger.error('Error during stale LFG cleanup:', err);
    }
}

module.exports = {
    showLfgModal,
    handleModalSubmit,
    handleInject,
    handleAbort,
    handleExecute,
    handleCancel,
    cleanUpStaleLfgSessions
};

