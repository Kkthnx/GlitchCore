const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getGuildConfig, invalidateGuildConfig } = require('./guildConfigCache');
const { brandedEmbed, COLORS } = require('./brand');
const logger = require('./logger');

const SELECT_ID = 'roles:self';

/** Parse a stored emoji string into the shape discord.js components expect. */
function parseEmoji(raw) {
    if (!raw) return undefined;
    const custom = String(raw).match(/^<(a?):(\w+):(\d+)>$/);
    if (custom) return { animated: Boolean(custom[1]), name: custom[2], id: custom[3] };
    return raw; // assume a unicode emoji
}

/**
 * Builds the self-role select menu. When `memberRoleIds` is provided, the
 * member's current roles are pre-selected (used for the ephemeral /roles menu).
 * @returns {ActionRowBuilder|null} null if there are no roles configured.
 */
function buildSelfRolesRow(selfRoles, memberRoleIds = null) {
    if (!selfRoles || selfRoles.length === 0) return null;

    const options = selfRoles.slice(0, 25).map(r => {
        const opt = { label: r.label, value: r.roleId };
        if (r.description) opt.description = r.description.slice(0, 100);
        const emoji = parseEmoji(r.emoji);
        if (emoji) opt.emoji = emoji;
        if (memberRoleIds) opt.default = memberRoleIds.includes(r.roleId);
        return opt;
    });

    const menu = new StringSelectMenuBuilder()
        .setCustomId(SELECT_ID)
        .setPlaceholder('Select the roles you want — deselect to remove')
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options);

    return new ActionRowBuilder().addComponents(menu);
}

/**
 * Handles a member's self-role select submission: adds newly selected managed
 * roles and removes managed roles they deselected. Replies ephemerally.
 */
async function handleSelfRoleSelect(interaction) {
    const cfg = await getGuildConfig(interaction.guild.id) || {};
    const managed = (cfg.selfRoles || []).map(r => r.roleId);
    if (managed.length === 0) {
        return interaction.reply({ content: 'Self-roles are not set up on this server.', ephemeral: true });
    }

    const selected = interaction.values.filter(id => managed.includes(id));
    const member = interaction.member;

    const toAdd = selected.filter(id => !member.roles.cache.has(id));
    const toRemove = managed.filter(id => !selected.includes(id) && member.roles.cache.has(id));

    const failed = [];
    for (const id of toAdd) {
        await member.roles.add(id).catch(err => { failed.push(id); logger.warn(`Self-role add failed (${id}): ${err.message}`); });
    }
    for (const id of toRemove) {
        await member.roles.remove(id).catch(err => { failed.push(id); logger.warn(`Self-role remove failed (${id}): ${err.message}`); });
    }

    const summary = [];
    if (toAdd.length) summary.push(`**Added:** ${toAdd.filter(id => !failed.includes(id)).map(id => `<@&${id}>`).join(', ') || '—'}`);
    if (toRemove.length) summary.push(`**Removed:** ${toRemove.filter(id => !failed.includes(id)).map(id => `<@&${id}>`).join(', ') || '—'}`);
    if (!summary.length) summary.push('No changes — your roles are already up to date.');
    if (failed.length) summary.push(`\n⚠️ Couldn't update ${failed.length} role(s). My role may be below them in the list.`);

    const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven • Roles' })
        .setDescription(summary.join('\n'));

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { SELECT_ID, buildSelfRolesRow, handleSelfRoleSelect, parseEmoji, invalidateGuildConfig };
