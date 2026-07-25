const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const User = require('../../database/UserSchema');
const { queueXp } = require('../../utils/xpCache');
const { getLocalDateString, msUntilNextLocalMidnight } = require('../../utils/time');
const { brandedEmbed, COLORS } = require('../../utils/brand');

const BASE_XP = 50;
const PER_STREAK_XP = 10;
const STREAK_CAP = 20; // bonus stops growing after 20 days

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily XP bonus and build a streak')
        .setDMPermission(false),

    async execute(interaction) {
        const { id: userId } = interaction.user;
        const guildId = interaction.guild.id;
        const today = getLocalDateString();

        const user = await User.findOne({ userId, guildId });

        if (user?.lastDailyDate === today) {
            const next = Math.floor((Date.now() + msUntilNextLocalMidnight()) / 1000);
            return interaction.reply({ content: `🕓 You've already claimed today. Come back <t:${next}:R>.`, flags: MessageFlags.Ephemeral });
        }

        const yesterday = getLocalDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
        const streak = user?.lastDailyDate === yesterday ? (user.dailyStreak || 0) + 1 : 1;
        const reward = BASE_XP + Math.min(streak, STREAK_CAP) * PER_STREAK_XP;

        await User.updateOne(
            { userId, guildId },
            { $set: { dailyStreak: streak, lastDailyDate: today } },
            { upsert: true },
        );
        // Route the reward through the XP buffer so level-ups/rewards still fire.
        queueXp(userId, guildId, reward, interaction.channel.id, { isMessage: false });

        const next = Math.floor((Date.now() + msUntilNextLocalMidnight()) / 1000);
        const embed = brandedEmbed({ color: COLORS.hype, footer: 'Glitch Haven • Daily' })
            .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
            .setTitle('🎁 Daily claimed!')
            .setDescription(
                `**+${reward} XP**\n` +
                `🔥 Streak: **${streak}** day${streak === 1 ? '' : 's'}` +
                (streak >= STREAK_CAP ? ' (max bonus!)' : ` — +${PER_STREAK_XP} XP tomorrow`) +
                `\n\nCome back <t:${next}:R> to keep your streak alive.`
            );
        return interaction.reply({ embeds: [embed] });
    },
};
