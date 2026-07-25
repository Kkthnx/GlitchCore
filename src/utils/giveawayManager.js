/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const Giveaway = require('../database/GiveawaySchema');
const { brandedEmbed, COLORS } = require('./brand');
const logger = require('./logger');

const ENTER_ID = 'giveaway:enter';

/**
 * Pick up to `count` unique random winners from a pool of user IDs.
 * Pure + deterministic-friendly (inject rng for tests).
 */
function pickWinners(entries, count, rng = Math.random) {
    const pool = [...new Set(entries)];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.max(0, count));
}

function buildGiveawayEmbed(g) {
    const unix = Math.floor(new Date(g.endsAt).getTime() / 1000);
    if (g.ended) {
        const winners = g.winners.length ? g.winners.map(id => `<@${id}>`).join(', ') : 'No valid entries 😢';
        return brandedEmbed({ color: COLORS.neutral, footer: 'Glitch Haven • Giveaway ended' })
            .setTitle(`🎉 ${g.prize}`)
            .setDescription(`**Winner${g.winners.length === 1 ? '' : 's'}:** ${winners}\n\nEnded <t:${unix}:R> · ${g.entries.length} entr${g.entries.length === 1 ? 'y' : 'ies'}`);
    }
    return brandedEmbed({ color: COLORS.hype, footer: 'Glitch Haven • Giveaway' })
        .setTitle(`🎉 ${g.prize}`)
        .setDescription(
            `Click **Enter** below to join!\n\n` +
            `🏆 **Winners:** ${g.winnerCount}\n` +
            `⏰ **Ends:** <t:${unix}:F> (<t:${unix}:R>)\n` +
            `👑 **Host:** <@${g.hostId}>\n` +
            `🎟️ **Entries:** ${g.entries.length}`
        );
}

function buildGiveawayButton(disabled = false, entries = 0) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(ENTER_ID)
            .setLabel(disabled ? 'Giveaway ended' : `Enter${entries ? ` (${entries})` : ''}`)
            .setEmoji('🎉')
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
    );
}

// ── Enter/leave button ────────────────────────────────────────────────────────
async function handleGiveawayEntry(interaction) {
    const userId = interaction.user.id;

    // Atomic join: only if live and not already entered.
    const joined = await Giveaway.findOneAndUpdate(
        { messageId: interaction.message.id, ended: false, entries: { $ne: userId } },
        { $addToSet: { entries: userId } },
        { new: true },
    );

    if (joined) {
        await interaction.update({ embeds: [buildGiveawayEmbed(joined)], components: [buildGiveawayButton(false, joined.entries.length)] });
        return interaction.followUp({ content: '🎉 You\'re entered — good luck!', flags: MessageFlags.Ephemeral });
    }

    // Not joined: either it ended, or they're already in (so this toggles them out).
    const left = await Giveaway.findOneAndUpdate(
        { messageId: interaction.message.id, ended: false, entries: userId },
        { $pull: { entries: userId } },
        { new: true },
    );

    if (left) {
        await interaction.update({ embeds: [buildGiveawayEmbed(left)], components: [buildGiveawayButton(false, left.entries.length)] });
        return interaction.followUp({ content: 'You left the giveaway.', flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({ content: 'This giveaway has ended.', flags: MessageFlags.Ephemeral });
}

// ── Ending + rerolling ────────────────────────────────────────────────────────
async function endGiveaway(client, g) {
    g.ended = true;
    g.winners = pickWinners(g.entries, g.winnerCount);
    await g.save();

    const channel = client.channels.cache.get(g.channelId);
    if (!channel) return;

    channel.messages.fetch(g.messageId)
        .then(msg => msg.edit({ embeds: [buildGiveawayEmbed(g)], components: [buildGiveawayButton(true)] }))
        .catch(() => {});

    const link = `https://discord.com/channels/${g.guildId}/${g.channelId}/${g.messageId}`;
    if (g.winners.length) {
        channel.send({
            content: `🎉 Congratulations ${g.winners.map(id => `<@${id}>`).join(', ')} — you won **${g.prize}**! [→ giveaway](${link})`,
            allowedMentions: { users: g.winners },
        }).catch(() => {});
    } else {
        channel.send(`The giveaway for **${g.prize}** ended with no valid entries.`).catch(() => {});
    }
    logger.info(`[GIVEAWAY] Ended "${g.prize}" — ${g.winners.length} winner(s) from ${g.entries.length} entries.`);
}

async function processEndedGiveaways(client) {
    // Only this shard's guilds, so multiple shards never draw the same giveaway.
    const guildIds = [...client.guilds.cache.keys()];
    if (!guildIds.length) return;

    let due;
    try {
        due = await Giveaway.find({ guildId: { $in: guildIds }, ended: false, endsAt: { $lte: new Date() } });
    } catch (err) {
        return logger.error('[GIVEAWAY] Failed to query due giveaways:', err);
    }
    for (const g of due) await endGiveaway(client, g).catch(err => logger.error('[GIVEAWAY] End failed:', err));
}

function startGiveawayScheduler(client) {
    setInterval(() => processEndedGiveaways(client).catch(err => logger.error('[GIVEAWAY] Scheduler tick failed:', err)), 30 * 1000);
}

module.exports = {
    ENTER_ID,
    pickWinners,
    buildGiveawayEmbed,
    buildGiveawayButton,
    handleGiveawayEntry,
    endGiveaway,
    processEndedGiveaways,
    startGiveawayScheduler,
};
