const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { brandedEmbed, COLORS } = require('../../utils/brand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Show info about this server')
        .setDMPermission(false),

    async execute(interaction) {
        const g = interaction.guild;
        const channels = g.channels.cache;
        const text = channels.filter(c => c.type === ChannelType.GuildText).size;
        const voice = channels.filter(c => c.type === ChannelType.GuildVoice).size;

        const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven' })
            .setTitle(g.name)
            .setThumbnail(g.iconURL({ dynamic: true, size: 256 }) || null)
            .addFields(
                { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
                { name: 'Members', value: `${g.memberCount.toLocaleString()}`, inline: true },
                { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'Channels', value: `💬 ${text} · 🔊 ${voice}`, inline: true },
                { name: 'Roles', value: `${g.roles.cache.size}`, inline: true },
                { name: 'Boosts', value: `${g.premiumSubscriptionCount || 0} (Tier ${g.premiumTier})`, inline: true },
            );
        if (g.bannerURL()) embed.setImage(g.bannerURL({ size: 1024 }));

        return interaction.reply({ embeds: [embed] });
    },
};
