const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { blockReason, recordInfraction, notifyTarget } = require('../../utils/moderationManager');
const { parseDuration, clampTimeout, humanizeDuration } = require('../../utils/duration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Temporarily mute a member (Discord timeout)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false)
        .addUserOption(o => o.setName('target').setDescription('Member to time out').setRequired(true))
        .addStringOption(o => o.setName('duration').setDescription('e.g. 10m, 1h, 1d (max 28d)').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');
        const member = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!member) return interaction.reply({ content: 'That user is not in this server.', flags: MessageFlags.Ephemeral });

        const block = blockReason(interaction, member);
        if (block) return interaction.reply({ content: block, flags: MessageFlags.Ephemeral });

        const parsed = parseDuration(interaction.options.getString('duration'));
        if (!parsed) return interaction.reply({ content: 'Invalid duration. Try `10m`, `1h`, or `1d`.', flags: MessageFlags.Ephemeral });
        const durationMs = clampTimeout(parsed);

        try {
            await member.timeout(durationMs, `${interaction.user.tag}: ${reason}`);
        } catch (err) {
            return interaction.reply({ content: `Failed to time out that member: ${err.message}`, flags: MessageFlags.Ephemeral });
        }

        await recordInfraction({ guild: interaction.guild, targetUser, moderator: interaction.user, type: 'timeout', reason, durationMs });
        await notifyTarget(targetUser, interaction.guild.name, 'timeout', reason, durationMs);

        return interaction.reply({ content: `🔇 Timed out <@${targetUser.id}> for **${humanizeDuration(durationMs)}** — ${reason}` });
    },
};
