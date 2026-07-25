const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock a previously locked channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false)
        .addChannelOption(o => o.setName('channel').setDescription('Channel (defaults to here)').addChannelTypes(ChannelType.GuildText).setRequired(false)),

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        try {
            // Reset the override so the role's normal permission applies again.
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null }, { reason: `Unlocked by ${interaction.user.tag}` });
            return interaction.reply({ content: `🔓 Unlocked ${channel} — members can send messages again.`, flags: MessageFlags.Ephemeral });
        } catch (err) {
            return interaction.reply({ content: `Failed to unlock: ${err.message}`, flags: MessageFlags.Ephemeral });
        }
    },
};
