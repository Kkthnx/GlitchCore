const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock a channel so members can\'t send messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false)
        .addChannelOption(o => o.setName('channel').setDescription('Channel (defaults to here)').addChannelTypes(ChannelType.GuildText).setRequired(false)),

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        try {
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }, { reason: `Locked by ${interaction.user.tag}` });
            return interaction.reply({ content: `🔒 Locked ${channel} — members can no longer send messages.`, flags: MessageFlags.Ephemeral });
        } catch (err) {
            return interaction.reply({ content: `Failed to lock: ${err.message}`, flags: MessageFlags.Ephemeral });
        }
    },
};
