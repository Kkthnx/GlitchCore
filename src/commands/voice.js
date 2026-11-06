/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const { checkMessage } = require('../utils/filterManager');
const {
    cleanChannelName,
    consumeRename,
    resolveLobby,
    transferOwner,
} = require('../utils/tempVoiceManager');
const logger = require('../utils/logger');

const STAFF_PERMISSIONS = PermissionFlagsBits.ModerateMembers | PermissionFlagsBits.Administrator;

function reply(interaction, content) {
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('voice')
        .setDescription('Manage your temporary voice lobby')
        .setContexts(InteractionContextType.Guild)
        .addSubcommand(s => s
            .setName('name')
            .setDescription('Rename your lobby')
            .addStringOption(o => o.setName('name').setDescription('New channel name').setRequired(true).setMaxLength(100)))
        .addSubcommand(s => s
            .setName('limit')
            .setDescription('Cap how many people can join (0 removes the cap)')
            .addIntegerOption(o => o.setName('slots').setDescription('Number of slots, 0 for no limit').setRequired(true).setMinValue(0).setMaxValue(99)))
        .addSubcommand(s => s
            .setName('lock')
            .setDescription('Stop new people from joining'))
        .addSubcommand(s => s
            .setName('unlock')
            .setDescription('Let people join again'))
        .addSubcommand(s => s
            .setName('kick')
            .setDescription('Remove someone from your lobby')
            .addUserOption(o => o.setName('user').setDescription('Who to remove').setRequired(true)))
        .addSubcommand(s => s
            .setName('claim')
            .setDescription('Take over a lobby whose owner left')),

    async execute(interaction) {
        const member = interaction.member;
        const sub = interaction.options.getSubcommand();
        const { channel, info, error } = resolveLobby(member);
        if (error) return reply(interaction, error);

        if (sub === 'claim') {
            if (info.ownerId === member.id) return reply(interaction, 'You already own this lobby.');
            if (channel.members.has(info.ownerId)) return reply(interaction, 'The owner is still here.');
            await transferOwner(channel.id, member.id);
            return reply(interaction, 'You own this lobby now.');
        }

        if (info.ownerId !== member.id) {
            return reply(interaction, `Only <@${info.ownerId}> can do that. If they left, use \`/voice claim\`.`);
        }

        if (sub === 'name') {
            const name = cleanChannelName(interaction.options.getString('name'));
            if (!name) return reply(interaction, 'Give the lobby a real name.');
            if (checkMessage(name)) return reply(interaction, 'That name will not fly here, pick another.');
            if (!consumeRename(channel.id)) {
                return reply(interaction, 'Discord only lets a channel be renamed twice every ten minutes. Try again shortly.');
            }
            await channel.setName(name, `Renamed by ${member.user.tag}`);
            return reply(interaction, `Lobby renamed to **${name}**.`);
        }

        if (sub === 'limit') {
            const slots = interaction.options.getInteger('slots');
            await channel.setUserLimit(slots, `Limit set by ${member.user.tag}`);
            return reply(interaction, slots === 0 ? 'Lobby limit removed.' : `Lobby limited to **${slots}** slot(s).`);
        }

        if (sub === 'lock') {
            await channel.setUserLimit(Math.max(1, channel.members.size), `Locked by ${member.user.tag}`);
            return reply(interaction, 'Lobby locked. Nobody new can join until you unlock it.');
        }

        if (sub === 'unlock') {
            await channel.setUserLimit(0, `Unlocked by ${member.user.tag}`);
            return reply(interaction, 'Lobby unlocked.');
        }

        if (sub === 'kick') {
            const target = channel.members.get(interaction.options.getUser('user').id);
            if (!target) return reply(interaction, 'They are not in your lobby.');
            if (target.id === member.id) return reply(interaction, 'You cannot kick yourself, just leave.');
            if (target.permissions.has(STAFF_PERMISSIONS)) return reply(interaction, 'You cannot remove staff from a lobby.');
            try {
                await target.voice.disconnect(`Removed from lobby by ${member.user.tag}`);
            } catch (err) {
                logger.warn(`[TEMPVOICE] Kick failed in ${channel.id}: ${err.message}`);
                return reply(interaction, 'I could not remove them. Check that I have the Move Members permission.');
            }
            return reply(interaction, `Removed <@${target.id}> from your lobby.`);
        }

        return reply(interaction, 'Unknown option.');
    },
};
