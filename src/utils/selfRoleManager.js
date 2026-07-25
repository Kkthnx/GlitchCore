const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getGuildConfig, invalidateGuildConfig } = require('./guildConfigCache');
const { brandedEmbed, COLORS } = require('./brand');
const logger = require('./logger');

const SELECT_ID = 'roles:self';
const OPEN_ID = 'roles:open';

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
function buildSelfRolesRow(selfRoles, memberRoleIds = null, guild = null) {
    // Drop any roles whose Discord role no longer exists so deleted roles can
    // never appear in the menu (even before the config is pruned).
    let roles = selfRoles || [];
    if (guild) roles = roles.filter(r => guild.roles.cache.has(r.roleId));
    if (roles.length === 0) return null;

    const options = roles.slice(0, 25).map(r => {
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

/** A persistent panel: an embed + a button that opens a fresh, live picker. */
function buildPanelButton() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(OPEN_ID).setLabel('Pick Your Roles').setEmoji('🎮').setStyle(ButtonStyle.Primary),
    );
}

/**
 * Opens the personal picker as an ephemeral, freshly-built menu (from the
 * button on a posted panel). Because it's rebuilt on every click, deleted roles
 * never appear and the member's current roles are pre-selected.
 */
async function handleOpenPicker(interaction) {
    const cfg = await getGuildConfig(interaction.guild.id) || {};
    const row = buildSelfRolesRow(cfg.selfRoles || [], interaction.member.roles.cache.map(r => r.id), interaction.guild);
    if (!row) {
        return interaction.reply({ content: 'No self-assignable roles are set up yet.', flags: MessageFlags.Ephemeral });
    }
    const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven • Roles' })
        .setTitle('🎮 Pick Your Roles')
        .setDescription('Select the games you play and the pings you want. Deselect to remove.');
    return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}

/**
 * Handles a member's self-role select submission: adds newly selected managed
 * roles and removes managed roles they deselected. Replies ephemerally.
 */
async function handleSelfRoleSelect(interaction) {
    const cfg = await getGuildConfig(interaction.guild.id) || {};
    // Only act on managed roles that still exist in the guild.
    const managed = (cfg.selfRoles || []).map(r => r.roleId).filter(id => interaction.guild.roles.cache.has(id));
    if (managed.length === 0) {
        return interaction.reply({ content: 'Self-roles are not set up on this server.', flags: MessageFlags.Ephemeral });
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

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { SELECT_ID, OPEN_ID, buildSelfRolesRow, buildPanelButton, handleOpenPicker, handleSelfRoleSelect, parseEmoji, invalidateGuildConfig };
