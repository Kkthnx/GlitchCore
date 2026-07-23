const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { blockReason, recordInfraction, notifyTarget } = require('../../utils/moderationManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member from the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .setDMPermission(false)
        .addUserOption(o => o.setName('target').setDescription('Member to kick').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');
        const member = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!member) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });

        const block = blockReason(interaction, member);
        if (block) return interaction.reply({ content: block, ephemeral: true });

        // DM before removing them — once kicked we can't message via the guild.
        await notifyTarget(targetUser, interaction.guild.name, 'kick', reason);

        try {
            await member.kick(`${interaction.user.tag}: ${reason}`);
        } catch (err) {
            return interaction.reply({ content: `Failed to kick that member: ${err.message}`, ephemeral: true });
        }

        await recordInfraction({ guild: interaction.guild, targetUser, moderator: interaction.user, type: 'kick', reason });
        return interaction.reply({ content: `👢 Kicked <@${targetUser.id}> — ${reason}` });
    },
};
