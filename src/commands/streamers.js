/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const Streamer = require('../database/StreamerSchema');
const { isConfigured, getUser, normalizeLogin } = require('../utils/twitchClient');
const { getGuildConfig } = require('../utils/guildConfigCache');
const { brandedEmbed, COLORS } = require('../utils/brand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('streamers')
        .setDescription('Manage Twitch go-live announcements')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Track a Twitch streamer')
            .addStringOption(o => o.setName('twitch').setDescription('Twitch username or URL').setRequired(true))
            .addUserOption(o => o.setName('member').setDescription('Link to a Discord member (optional)').setRequired(false)))
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Stop tracking a Twitch streamer')
            .addStringOption(o => o.setName('twitch').setDescription('Twitch username').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('List tracked streamers')),

    async execute(interaction) {
        if (!isConfigured()) {
            return interaction.reply({ content: 'Twitch isn\'t configured. Add `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` to the bot\'s `.env`.', flags: MessageFlags.Ephemeral });
        }

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'add') {
            const login = normalizeLogin(interaction.options.getString('twitch'));
            if (!login) return interaction.reply({ content: 'That doesn\'t look like a valid Twitch name.', flags: MessageFlags.Ephemeral });

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            let user;
            try {
                user = await getUser(login);
            } catch {
                return interaction.editReply('Couldn\'t reach Twitch right now — try again in a moment.');
            }
            if (!user) return interaction.editReply(`No Twitch user found for **${login}**.`);

            if (await Streamer.findOne({ guildId, twitchLogin: user.login })) {
                return interaction.editReply(`**${user.display_name}** is already being tracked.`);
            }

            await Streamer.create({
                guildId,
                twitchLogin: user.login,
                twitchDisplayName: user.display_name,
                discordUserId: interaction.options.getUser('member')?.id || null,
            });

            const cfg = await getGuildConfig(guildId) || {};
            const hint = cfg.streamerChannelId
                ? ''
                : '\n\n⚠️ No announcement channel set yet — run `/settings set key:streamer_channel_id value:<channel-id>` so go-live posts have somewhere to go.';
            return interaction.editReply(`✅ Now tracking **${user.display_name}** (twitch.tv/${user.login}).${hint}`);
        }

        if (sub === 'remove') {
            const login = normalizeLogin(interaction.options.getString('twitch'));
            const res = await Streamer.deleteOne({ guildId, twitchLogin: login });
            if (!res.deletedCount) return interaction.reply({ content: `**${login}** wasn't being tracked.`, flags: MessageFlags.Ephemeral });
            return interaction.reply({ content: `Stopped tracking **${login}**.`, flags: MessageFlags.Ephemeral });
        }

        // list
        const streamers = await Streamer.find({ guildId }).sort({ twitchLogin: 1 });
        const embed = brandedEmbed({ color: COLORS.accent, footer: 'Glitch Haven • Twitch' })
            .setTitle('📺 Tracked Streamers')
            .setDescription(streamers.length
                ? streamers.map(s => `${s.isLive ? '🔴' : '⚫'} [${s.twitchDisplayName}](https://twitch.tv/${s.twitchLogin})${s.discordUserId ? ` — <@${s.discordUserId}>` : ''}`).join('\n')
                : 'None yet. Add one with `/streamers add`.');
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
