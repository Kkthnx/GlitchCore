/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, MessageFlags, InteractionContextType } = require('discord.js');
const User = require('../../database/UserSchema');
const { queueXp } = require('../../utils/xpCache');
const { getLocalDateString, msUntilNextLocalMidnight, previousLocalDate } = require('../../utils/time');
const { brandedEmbed, COLORS } = require('../../utils/brand');

const BASE_XP = 50;
const PER_STREAK_XP = 10;
const STREAK_CAP = 20; // bonus stops growing after 20 days

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily XP bonus and build a streak')
        .setContexts(InteractionContextType.Guild),

    async execute(interaction) {
        const { id: userId } = interaction.user;
        const guildId = interaction.guild.id;
        const today = getLocalDateString();

        // Claim the day atomically. Reading first and then writing let two
        // rapid invocations both pass the "already claimed" check and both
        // collect the reward, so the claim has to BE the check: only the caller
        // whose update actually matches gets past this point.
        //
        // The filter is deliberately paired with upsert, which gives us the
        // three outcomes we need in one round trip:
        //   a document back -> we claimed it, and it holds the previous streak
        //   null            -> the upsert inserted, so this is a first-ever claim
        //   duplicate key   -> a document exists but already has today's date
        let previous;
        try {
            previous = await User.findOneAndUpdate(
                { userId, guildId, lastDailyDate: { $ne: today } },
                { $set: { lastDailyDate: today } },
                { new: false, upsert: true, setDefaultsOnInsert: true },
            ).lean();
        } catch (err) {
            if (err?.code === 11000) {
                const next = Math.floor((Date.now() + msUntilNextLocalMidnight()) / 1000);
                return interaction.reply({ content: `🕓 You've already claimed today. Come back <t:${next}:R>.`, flags: MessageFlags.Ephemeral });
            }
            throw err;
        }

        const yesterday = previousLocalDate(today);
        const streak = previous?.lastDailyDate === yesterday ? (previous.dailyStreak || 0) + 1 : 1;
        const reward = BASE_XP + Math.min(streak, STREAK_CAP) * PER_STREAK_XP;

        // Only the winner of the claim above reaches this, so no race here.
        await User.updateOne({ userId, guildId }, { $set: { dailyStreak: streak } });

        // Route the reward through the XP buffer so level-ups/rewards still fire.
        queueXp(userId, guildId, reward, interaction.channel?.id ?? null, { isMessage: false });

        const next = Math.floor((Date.now() + msUntilNextLocalMidnight()) / 1000);
        const embed = brandedEmbed({ color: COLORS.hype, footer: 'Glitch Haven, Daily' })
            .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
            .setTitle('🎁 Daily claimed!')
            .setDescription(
                `**+${reward} XP**\n` +
                `🔥 Streak: **${streak}** day${streak === 1 ? '' : 's'}` +
                (streak >= STREAK_CAP ? ' (max bonus!)' : `, +${PER_STREAK_XP} XP tomorrow`) +
                `\n\nCome back <t:${next}:R> to keep your streak alive.`
            );
        return interaction.reply({ embeds: [embed] });
    },
};
