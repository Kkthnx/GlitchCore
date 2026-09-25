/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const Tag = require('../database/TagSchema');
const { brandedEmbed, COLORS } = require('../utils/brand');
const { fitLines, LIMITS } = require('../utils/embedText');

const NAME_MAX = 32;
const CONTENT_MAX = 1800;
const CHOICE_LIMIT = 25; // Discord's hard cap on autocomplete choices

function normalize(name) {
    return String(name || '').trim().toLowerCase().slice(0, NAME_MAX);
}

// Neutralize regex metacharacters so a typed query is matched literally.
function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function canManage(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tag')
        .setDescription('Recall or manage saved canned responses')
        .setContexts(InteractionContextType.Guild)
        .addSubcommand(s => s.setName('show').setDescription('Post a saved tag')
            .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true).setAutocomplete(true)))
        .addSubcommand(s => s.setName('list').setDescription('List all tags'))
        .addSubcommand(s => s.setName('create').setDescription('Create a tag (Manage Messages)')
            .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true))
            .addStringOption(o => o.setName('content').setDescription('What the tag says').setRequired(true)))
        .addSubcommand(s => s.setName('edit').setDescription('Edit a tag (Manage Messages)')
            .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true).setAutocomplete(true))
            .addStringOption(o => o.setName('content').setDescription('New content').setRequired(true)))
        .addSubcommand(s => s.setName('delete').setDescription('Delete a tag (Manage Messages)')
            .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true).setAutocomplete(true))),

    /**
     * Suggests existing tag names as the member types, so nobody has to
     * remember the exact spelling of a tag someone else created.
     */
    async autocomplete(interaction) {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== 'name') return interaction.respond([]);

        const query = normalize(focused.value);
        const filter = { guildId: interaction.guild.id };
        // Prefix match on the indexed name field. The input is escaped, so a
        // member typing regex metacharacters can't craft a pattern of their own.
        if (query) filter.name = new RegExp(`^${escapeRegex(query)}`);

        const tags = await Tag.find(filter, { name: 1 })
            .sort({ uses: -1, name: 1 })   // most-used first, since those are most likely wanted
            .limit(CHOICE_LIMIT)
            .lean();

        return interaction.respond(tags.map(t => ({ name: t.name, value: t.name })));
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'show') {
            const name = normalize(interaction.options.getString('name'));
            const tag = await Tag.findOneAndUpdate({ guildId, name }, { $inc: { uses: 1 } }).lean();
            if (!tag) return interaction.reply({ content: `No tag named \`${name}\`.`, flags: MessageFlags.Ephemeral });
            return interaction.reply({ content: tag.content, allowedMentions: { parse: [] } });
        }

        if (sub === 'list') {
            const tags = await Tag.find({ guildId }, { name: 1 }).sort({ name: 1 }).lean();
            if (!tags.length) return interaction.reply({ content: 'No tags yet. Create one with `/tag create`.', flags: MessageFlags.Ephemeral });
            const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven, Tags' })
                .setTitle(`Tags (${tags.length})`)
                // A server can accumulate more tags than fit in one embed.
                .setDescription(fitLines(
                    tags.map(t => `\`${t.name}\``),
                    LIMITS.description,
                    { separator: ', ', more: n => `_…and ${n} more, see \`/tag show\`_` },
                ));
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

// Exported for unit tests.
module.exports.escapeRegex = escapeRegex;
module.exports.normalize = normalize;
