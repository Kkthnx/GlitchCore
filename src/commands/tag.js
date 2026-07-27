/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const Tag = require('../database/TagSchema');
const { brandedEmbed, COLORS } = require('../utils/brand');

const NAME_MAX = 32;
const CONTENT_MAX = 1800;

function normalize(name) {
    return String(name || '').trim().toLowerCase().slice(0, NAME_MAX);
}

function canManage(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tag')
        .setDescription('Recall or manage saved canned responses')
        .setDMPermission(false)
        .addSubcommand(s => s.setName('show').setDescription('Post a saved tag')
            .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true)))
        .addSubcommand(s => s.setName('list').setDescription('List all tags'))
        .addSubcommand(s => s.setName('create').setDescription('Create a tag (Manage Messages)')
            .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true))
            .addStringOption(o => o.setName('content').setDescription('What the tag says').setRequired(true)))
        .addSubcommand(s => s.setName('edit').setDescription('Edit a tag (Manage Messages)')
            .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true))
            .addStringOption(o => o.setName('content').setDescription('New content').setRequired(true)))
        .addSubcommand(s => s.setName('delete').setDescription('Delete a tag (Manage Messages)')
            .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'show') {
            const name = normalize(interaction.options.getString('name'));
            const tag = await Tag.findOneAndUpdate({ guildId, name }, { $inc: { uses: 1 } });
            if (!tag) return interaction.reply({ content: `No tag named \`${name}\`.`, flags: MessageFlags.Ephemeral });
            return interaction.reply({ content: tag.content, allowedMentions: { parse: [] } });
        }

        if (sub === 'list') {
            const tags = await Tag.find({ guildId }).sort({ name: 1 }).select('name');
            if (!tags.length) return interaction.reply({ content: 'No tags yet. Create one with `/tag create`.', flags: MessageFlags.Ephemeral });
            const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven, Tags' })
                .setTitle(`Tags (${tags.length})`)
                .setDescription(tags.map(t => `\`${t.name}\``).join(', '));
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // create / edit / delete need Manage Messages.
        if (!canManage(interaction)) {
            return interaction.reply({ content: 'You need the Manage Messages permission to do that.', flags: MessageFlags.Ephemeral });
        }

        const name = normalize(interaction.options.getString('name'));
        if (!name) return interaction.reply({ content: 'That tag name is empty.', flags: MessageFlags.Ephemeral });

        if (sub === 'create') {
            const content = interaction.options.getString('content').slice(0, CONTENT_MAX);
            const exists = await Tag.findOne({ guildId, name });
            if (exists) return interaction.reply({ content: `A tag named \`${name}\` already exists.`, flags: MessageFlags.Ephemeral });
            await Tag.create({ guildId, name, content, authorId: interaction.user.id });
            return interaction.reply({ content: `Created tag \`${name}\`.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'edit') {
            const content = interaction.options.getString('content').slice(0, CONTENT_MAX);
            const updated = await Tag.findOneAndUpdate({ guildId, name }, { content });
            if (!updated) return interaction.reply({ content: `No tag named \`${name}\`.`, flags: MessageFlags.Ephemeral });
            return interaction.reply({ content: `Updated tag \`${name}\`.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'delete') {
            const removed = await Tag.findOneAndDelete({ guildId, name });
            if (!removed) return interaction.reply({ content: `No tag named \`${name}\`.`, flags: MessageFlags.Ephemeral });
            return interaction.reply({ content: `Deleted tag \`${name}\`.`, flags: MessageFlags.Ephemeral });
        }
    },
};
