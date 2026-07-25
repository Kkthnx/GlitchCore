const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Bulk-delete recent messages in this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false)
        .addIntegerOption(o => o.setName('amount').setDescription('How many messages (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
        .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user').setRequired(false)),

    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');
        const user = interaction.options.getUser('user');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            let deleted;
            if (user) {
                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                const mine = [...messages.values()].filter(m => m.author.id === user.id).slice(0, amount);
                deleted = await interaction.channel.bulkDelete(mine, true);
            } else {
                deleted = await interaction.channel.bulkDelete(amount, true);
            }
            return interaction.editReply(`🧹 Deleted **${deleted.size}** message(s)${user ? ` from <@${user.id}>` : ''}.${deleted.size < amount ? ' (Some were older than 14 days and skipped.)' : ''}`);
        } catch (err) {
            return interaction.editReply(`Failed to purge: ${err.message}`);
        }
    },
};
