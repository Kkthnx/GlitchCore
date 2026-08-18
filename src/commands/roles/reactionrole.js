/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const ReactionRole = require('../../database/ReactionRoleSchema');
const { buildMenuEmbed, parseEmojiInput, trackMenu } = require('../../utils/reactionRoleManager');

const MAX_PAIRS = 20;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reactionrole')
        .setDescription('Manage self-assign reaction-role menus')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setDMPermission(false)
        .addSubcommand(s => s.setName('create').setDescription('Post a new reaction-role menu here')
            .addStringOption(o => o.setName('title').setDescription('Menu title').setRequired(true))
            .addStringOption(o => o.setName('description').setDescription('Optional blurb').setRequired(false)))
        .addSubcommand(s => s.setName('add').setDescription('Add an emoji-role pair to a menu')
            .addStringOption(o => o.setName('message_id').setDescription('The menu message id').setRequired(true))
            .addStringOption(o => o.setName('emoji').setDescription('Emoji members react with').setRequired(true))
            .addRoleOption(o => o.setName('role').setDescription('Role to grant').setRequired(true)))
        .addSubcommand(s => s.setName('remove').setDescription('Remove a pair from a menu')
            .addStringOption(o => o.setName('message_id').setDescription('The menu message id').setRequired(true))
            .addStringOption(o => o.setName('emoji').setDescription('Emoji to remove').setRequired(true))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'create') {
            const title = interaction.options.getString('title').slice(0, 240);
            const description = interaction.options.getString('description')?.slice(0, 1500) || null;

            const doc = new ReactionRole({
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                messageId: 'pending',
                title,
                description,
                pairs: [],
            });

            const posted = await interaction.channel.send({ embeds: [buildMenuEmbed(doc)] });
            doc.messageId = posted.id;
            await doc.save();
            trackMenu(posted.id);

            return interaction.reply({ content: `Menu created. Add roles with \`/reactionrole add message_id:${posted.id}\`.`, flags: MessageFlags.Ephemeral });
        }

        const messageId = interaction.options.getString('message_id').trim();
        const doc = await ReactionRole.findOne({ guildId: interaction.guild.id, messageId });
        if (!doc) return interaction.reply({ content: 'No reaction-role menu with that message id.', flags: MessageFlags.Ephemeral });

        const channel = interaction.guild.channels.cache.get(doc.channelId);
        const menuMsg = channel && await channel.messages.fetch(doc.messageId).catch(() => null);
        if (!menuMsg) return interaction.reply({ content: 'The menu message seems to be gone. Delete it and make a new one.', flags: MessageFlags.Ephemeral });

        if (sub === 'add') {
            if (doc.pairs.length >= MAX_PAIRS) return interaction.reply({ content: `A menu can hold at most ${MAX_PAIRS} roles.`, flags: MessageFlags.Ephemeral });

            const role = interaction.options.getRole('role');
            if (role.position >= interaction.guild.members.me.roles.highest.position) {
                return interaction.reply({ content: 'That role is above my highest role, so I can not assign it.', flags: MessageFlags.Ephemeral });
            }

            const { key, display, reactable } = parseEmojiInput(interaction.options.getString('emoji'));
            if (doc.pairs.some(p => p.emoji === key)) return interaction.reply({ content: 'That emoji is already used on this menu.', flags: MessageFlags.Ephemeral });
            if (doc.pairs.some(p => p.roleId === role.id)) return interaction.reply({ content: 'That role is already on this menu.', flags: MessageFlags.Ephemeral });

            try {
                await menuMsg.react(reactable);
            } catch {
                return interaction.reply({ content: 'I could not react with that emoji. Use a standard emoji or one from this server.', flags: MessageFlags.Ephemeral });
            }

            doc.pairs.push({ emoji: key, label: display, roleId: role.id });
            await doc.save();
            await menuMsg.edit({ embeds: [buildMenuEmbed(doc)] });
            return interaction.reply({ content: `Added ${display} for <@&${role.id}>.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
        }

        if (sub === 'remove') {
            const { key } = parseEmojiInput(interaction.options.getString('emoji'));
            const before = doc.pairs.length;
            doc.pairs = doc.pairs.filter(p => p.emoji !== key);
            if (doc.pairs.length === before) return interaction.reply({ content: 'That emoji is not on this menu.', flags: MessageFlags.Ephemeral });

            await doc.save();
            await menuMsg.edit({ embeds: [buildMenuEmbed(doc)] });
            await menuMsg.reactions.cache.find(r => (r.emoji.id || r.emoji.name) === key)?.remove().catch(() => {});
            return interaction.reply({ content: 'Removed that pair.', flags: MessageFlags.Ephemeral });
        }
    },
};
