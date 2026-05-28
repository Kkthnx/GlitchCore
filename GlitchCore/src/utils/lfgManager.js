const {
    ModalBuilder, TextInputBuilder, TextInputStyle,
    ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const LfgSession = require('../database/LfgSchema');
const config = require('../../config.json');

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
// Embed builder — reconstructs the terminal embed from a session document
// ---------------------------------------------------------------------------
function buildLfgEmbed(session) {
    const isLocked = session.status === 'LOCKED';
    const color    = isLocked ? NEON_RED : NEON_GREEN;
    const filled   = session.roster.length;

    // Terminal status header inside an ANSI code block
    const statusText = isLocked
        ? `${R}[ LOCKED ]${RST}`
        : `${G}[ OPEN   ]${RST}`;

    const header = [
        '```ansi',
        `${G}ACTIVITY${RST} : ${session.activity}`,
        `${G}STATUS  ${RST} : ${statusText}`,
        `${G}SLOTS   ${RST} : ${filled} / ${session.totalSlots}`,
        '```',
    ].join('\n');

    // Roster lines — mentions work outside code blocks
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

    return new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: '⚡ SYSTEM.LFG_OVERRIDE' })
        .setTitle(`> INITIATING_LOBBY: ${session.game}`)
        .setDescription(header + rosterLines.join('\n'))
        .setFooter({ text: 'GLITCH_HAVEN // SYSTEM_ACTIVE_' })
        .setTimestamp();
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
    );
}

// ---------------------------------------------------------------------------
// Show the creation modal — called by the /lfg slash command
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
// Modal submit — validates, posts embed, saves to DB
// ---------------------------------------------------------------------------
async function handleModalSubmit(interaction) {
    const game       = interaction.fields.getTextInputValue('lfg_game').trim();
    const activity   = interaction.fields.getTextInputValue('lfg_activity').trim();
    const totalSlots = parseInt(interaction.fields.getTextInputValue('lfg_slots').trim(), 10);

    if (isNaN(totalSlots) || totalSlots < 2 || totalSlots > 10) {
        return interaction.reply({
            content: '`ERROR_422` : Slots must be a number between **2** and **10**.',
            ephemeral: true,
        });
    }

    await interaction.deferReply({ ephemeral: true });

    const lfgChannel = interaction.guild.channels.cache.get(config.channels.lfg);
    if (!lfgChannel) {
        return interaction.editReply({ content: '`ERROR_404` : LFG channel not configured. Contact an admin.' });
    }

    // Host auto-fills slot 1 as Leader
    const roster = [{ userId: interaction.user.id, username: interaction.user.username }];

    const sessionData = { hostId: interaction.user.id, game, activity, totalSlots, roster, status: 'OPEN' };
    const embed   = buildLfgEmbed(sessionData);
    const buttons = buildLfgButtons(false);

    try {
        const msg = await lfgChannel.send({ embeds: [embed], components: [buttons] });

        await LfgSession.create({
            messageId: msg.id,
            channelId: lfgChannel.id,
            guildId:   interaction.guild.id,
            ...sessionData,
        });

        await interaction.editReply({
            content: `\`SESSION_ACTIVE\` — LFG is live! **[→ Jump to it](${msg.url})**`,
        });
    } catch (err) {
        console.error('Failed to create LFG session:', err);
        await interaction.editReply({
            content: '`ERROR_500` : Failed to post the LFG. Check that the bot has **Send Messages** permission in the LFG channel.',
        });
    }
}

// ---------------------------------------------------------------------------
// INJECT — add user to roster
// ---------------------------------------------------------------------------
async function handleInject(interaction) {
    const session = await LfgSession.findOne({ messageId: interaction.message.id });
    if (!session) return interaction.reply({ content: '`ERROR_404` : Session not found.', ephemeral: true });
    if (session.status === 'LOCKED') return interaction.reply({ content: '`ERROR_403` : Session is **LOCKED**.', ephemeral: true });

    if (session.roster.some(m => m.userId === interaction.user.id)) {
        return interaction.reply({ content: '`ERROR_409` : You are already injected into this session.', ephemeral: true });
    }
    if (session.roster.length >= session.totalSlots) {
        return interaction.reply({ content: '`ERROR_503` : All slots occupied. Session full.', ephemeral: true });
    }

    session.roster.push({ userId: interaction.user.id, username: interaction.user.username });
    await session.save();

    await interaction.update({ embeds: [buildLfgEmbed(session)], components: [buildLfgButtons(false)] });
}

// ---------------------------------------------------------------------------
// ABORT — remove user from roster
// ---------------------------------------------------------------------------
async function handleAbort(interaction) {
    const session = await LfgSession.findOne({ messageId: interaction.message.id });
    if (!session) return interaction.reply({ content: '`ERROR_404` : Session not found.', ephemeral: true });
    if (session.status === 'LOCKED') return interaction.reply({ content: '`ERROR_403` : Cannot abort a **LOCKED** session.', ephemeral: true });

    if (interaction.user.id === session.hostId) {
        return interaction.reply({
            content: '`ERROR_403` : Leaders cannot abort. Use 🔒 **EXECUTE** to lock and end the session.',
            ephemeral: true,
        });
    }
    if (!session.roster.some(m => m.userId === interaction.user.id)) {
        return interaction.reply({ content: '`ERROR_404` : You are not in this session.', ephemeral: true });
    }

    session.roster = session.roster.filter(m => m.userId !== interaction.user.id);
    await session.save();

    await interaction.update({ embeds: [buildLfgEmbed(session)], components: [buildLfgButtons(false)] });
}

// ---------------------------------------------------------------------------
// EXECUTE — host locks the session, pings the full roster
// ---------------------------------------------------------------------------
async function handleExecute(interaction) {
    const session = await LfgSession.findOne({ messageId: interaction.message.id });
    if (!session) return interaction.reply({ content: '`ERROR_404` : Session not found.', ephemeral: true });

    if (interaction.user.id !== session.hostId) {
        return interaction.reply({ content: '`ERROR_403` : Only the **Leader** can EXECUTE the lock.', ephemeral: true });
    }
    if (session.status === 'LOCKED') {
        return interaction.reply({ content: '`ERROR_409` : Session is already **LOCKED**.', ephemeral: true });
    }

    session.status = 'LOCKED';
    await session.save();

    // Update embed to red/locked state with disabled buttons
    await interaction.update({ embeds: [buildLfgEmbed(session)], components: [buildLfgButtons(true)] });

    // Ping all roster members in a follow-up message
    const mentions = session.roster.map(m => `<@${m.userId}>`).join(' ');
    await interaction.channel.send({
        content: [
            `🔒 **SESSION LOCKED** — ${mentions}`,
            `\`\`\`ansi`,
            `${R}> GROUP_FORMED — RALLY UP. GLITCH_HAVEN AWAITS.${RST}`,
            `\`\`\``,
            ].join('\n'),
    });
}

// ---------------------------------------------------------------------------
// Auto-cleanup stale OPEN LFG sessions (older than 24 hours)
// ---------------------------------------------------------------------------
async function cleanUpStaleLfgSessions(client) {
    const thresholdDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    try {
        const staleSessions = await LfgSession.find({
            status: 'OPEN',
            createdAt: { $lt: thresholdDate }
        });

        if (staleSessions.length === 0) return;

        console.log(`🧹 Found ${staleSessions.length} stale LFG session(s) to auto-lock.`);

        for (const session of staleSessions) {
            session.status = 'LOCKED';
            await session.save();

            const guild = client.guilds.cache.get(session.guildId);
            if (!guild) continue;

            const channel = guild.channels.cache.get(session.channelId);
            if (!channel) continue;

            try {
                const message = await channel.messages.fetch(session.messageId);
                if (message) {
                    // Rebuild embed in locked state, and disable buttons
                    const embed = buildLfgEmbed(session);
                    const buttons = buildLfgButtons(true);
                    await message.edit({ embeds: [embed], components: [buttons] });
                    
                    // Send an expiration message
                    await channel.send({
                        content: `⚠️ **LOBBY EXPIRED** — The LFG session hosted by <@${session.hostId}> has reached the 24-hour limit and has been automatically closed.`
                    });
                }
            } catch (err) {
                console.warn(`Could not update stale LFG message ${session.messageId}:`, err.message);
            }
        }
    } catch (err) {
        console.error('Error during stale LFG cleanup:', err);
    }
}

module.exports = {
    showLfgModal,
    handleModalSubmit,
    handleInject,
    handleAbort,
    handleExecute,
    cleanUpStaleLfgSessions
};

