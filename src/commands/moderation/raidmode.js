/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const { isRaidMode, setRaidMode, heldCount, AUTO_DURATION_MS } = require('../../utils/raidMode');
const { releaseHeldMembers } = require('../../utils/raidRelease');
const { logModAction } = require('../../utils/moderationManager');
const { humanizeDuration } = require('../../utils/duration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('raidmode')
        .setDescription('Hold new joins during a raid (no auto-role, no welcomes)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setContexts(InteractionContextType.Guild)
        .addSubcommand(s => s.setName('on').setDescription('Turn raid mode on')
            .addIntegerOption(o => o.setName('minutes').setDescription('How long (default 10)').setMinValue(1).setMaxValue(180).setRequired(false)))
        .addSubcommand(s => s.setName('off').setDescription('Turn raid mode off'))
        .addSubcommand(s => s.setName('release').setDescription('Give the member role to everyone held during raid mode who is still here'))
        .addSubcommand(s => s.setName('status').setDescription('Check whether raid mode is active')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'status') {
            const active = isRaidMode(guildId);
            const waiting = heldCount(guildId);
            const heldNote = waiting ? ` ${waiting} held member(s) are waiting, use \`/raidmode release\` once the raiders are dealt with.` : '';
            return interaction.reply({
                content: (active ? '🚨 Raid mode is **on**, new joins are being held.' : 'Raid mode is off.') + heldNote,
                flags: MessageFlags.Ephemeral,
            });
        }

        if (sub === 'release') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const result = await releaseHeldMembers(interaction.guild);
            if (result.noRole) {
                return interaction.editReply({ content: `There's no member role configured in this server to hand out, so nothing was released. ${result.waiting} held member(s) are still waiting.` });
            }
            await logModAction({
                guild: interaction.guild,
                moderator: interaction.user,
                title: 'Raid hold released',
                fields: [
                    { name: 'Released', value: `${result.released}`, inline: true },
                    { name: 'Already gone', value: `${result.gone}`, inline: true },
                    { name: 'Failed', value: `${result.failed}`, inline: true },
                ],
            });
            return interaction.editReply({ content: `Released **${result.released}** held member(s). ${result.gone} had already left or been banned, ${result.failed} failed.` });
        }

        if (sub === 'off') {
            setRaidMode(guildId, false);
            await logModAction({
                guild: interaction.guild,
                moderator: interaction.user,
                title: 'Raid mode disabled',
                fields: [],
            });
            return interaction.reply({ content: 'Raid mode is off, joins are back to normal.', flags: MessageFlags.Ephemeral });
        }

        const minutes = interaction.options.getInteger('minutes') ?? Math.round(AUTO_DURATION_MS / 60000);
        setRaidMode(guildId, true, minutes * 60 * 1000, false);
        await logModAction({
            guild: interaction.guild,
            moderator: interaction.user,
            title: 'Raid mode enabled',
            fields: [{ name: 'Duration', value: humanizeDuration(minutes * 60 * 1000), inline: true }],
        });
        return interaction.reply({ content: `🚨 Raid mode is **on** for ${humanizeDuration(minutes * 60 * 1000)}. New joins get no role, no DM, no welcome post until it ends.`, flags: MessageFlags.Ephemeral });
    },
};
