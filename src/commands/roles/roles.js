/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const GuildConfig = require('../../database/GuildConfigSchema');
const { getOrCreateGuildConfig, invalidateGuildConfig } = require('../../utils/guildConfigCache');
const { buildSelfRolesRow, buildPanelButton } = require('../../utils/selfRoleManager');
const { smartColor } = require('../../utils/roleColors');
const { brandedEmbed, COLORS } = require('../../utils/brand');

// A spread of on-brand colors so auto-created roles aren't all the same hue.
const COLOR_POOL = ['#5cc8ff', '#34d3b4', '#f0b429', '#b483ff', '#ff6b6b', '#2fe07a', '#ff5fd0', '#ff7a3c'];
function randomColor() {
    return COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)];
}

// Starter packs the bot can create in one command so admins never touch
// Server Settings for the common universal roles. Each gets its own color.
// Colors come from the curated map (utils/roleColors.js) via ensureSelfRole.
const PRESETS = {
    platforms: [
        { name: 'PC', emoji: '🖥️' },
        { name: 'Xbox', emoji: '🎮' },
        { name: 'PlayStation', emoji: '🎮' },
        { name: 'Switch', emoji: '🎮' },
    ],
    regions: [
        { name: 'NA', emoji: '🌎' },
        { name: 'EU', emoji: '🌍' },
        { name: 'OCE', emoji: '🌏' },
        { name: 'Asia', emoji: '🗺️' },
    ],
    pings: [
        { name: 'LFG', emoji: '🎮', description: 'Pinged when someone posts an LFG' },
        { name: 'Double XP', emoji: '🔥', description: 'Pinged for Double XP weekends' },
        { name: 'Events', emoji: '📅', description: 'Pinged for game nights' },
        { name: 'Streams', emoji: '📺', description: 'Pinged when members go live' },
        { name: 'Announcements', emoji: '📢' },
    ],
};

// Drop self-roles whose Discord role no longer exists (e.g. deleted in Server
// Settings), persisting the cleanup. Returns how many were pruned.
async function pruneStale(guild, cfg) {
    if (!cfg?.selfRoles?.length) return 0;
    const before = cfg.selfRoles.length;
    cfg.selfRoles = cfg.selfRoles.filter(r => guild.roles.cache.has(r.roleId));
    const removed = before - cfg.selfRoles.length;
    if (removed) { await cfg.save(); invalidateGuildConfig(guild.id); }
    return removed;
}

// Find a role by name (case-insensitive) or create it, then register it as
// self-assignable on the config (without saving, caller saves once).
function isUnicodeEmoji(str) {
    return Boolean(str) && !/^<a?:\w+:\d+>$/.test(str); // exclude custom <:name:id> emojis
}

async function ensureSelfRole(guild, cfg, { name, emoji = null, color, description = null, label = null }) {
    let role = guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase());
    let created = false;
    if (!role) {
        role = await guild.roles.create({
            name,
            // Explicit color wins; else the game/platform's real color; else varied.
            colors: { primaryColor: color || smartColor(name) || randomColor() },
            mentionable: false,
            reason: 'Self-assignable role created via /roles',
        });
        created = true;

        // If the server is boosted enough for role icons, set the emoji AS the
        // role icon, no image file needed.
        if (emoji && isUnicodeEmoji(emoji) && guild.features.includes('ROLE_ICONS')) {
            await role.setUnicodeEmoji(emoji).catch(() => {});
        }
    }
    const listed = cfg.selfRoles.some(r => r.roleId === role.id);
    if (!listed) {
        cfg.selfRoles.push({ roleId: role.id, label: (label || name).slice(0, 80), emoji, description });
    }
    return { role, created, listed };
}

function requireManageRoles(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        interaction.reply({ content: 'You need the **Manage Roles** permission to do that.', flags: MessageFlags.Ephemeral });
        return false;
    }
    return true;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roles')
        .setDescription('Self-assign roles for the games you play and pings you want')
        .addSubcommand(sub => sub
            .setName('menu')
            .setDescription('Open your personal role picker'))
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('(Admin) Add a role to the self-assign list')
            .addRoleOption(o => o.setName('role').setDescription('Role members can self-assign').setRequired(true))
            .addStringOption(o => o.setName('label').setDescription('Menu label (defaults to role name)').setRequired(false))
            .addStringOption(o => o.setName('emoji').setDescription('Emoji shown in the menu').setRequired(false))
            .addStringOption(o => o.setName('description').setDescription('Short description shown in the menu').setRequired(false)))
        .addSubcommand(sub => sub
            .setName('create')
            .setDescription('(Admin) Create a brand-new role AND add it to the menu in one step')
            .addStringOption(o => o.setName('name').setDescription('Role name, e.g. Valorant').setRequired(true).setMaxLength(80))
            .addStringOption(o => o.setName('emoji').setDescription('Emoji for the menu (and role icon if boosted)').setRequired(false))
            .addStringOption(o => o.setName('color').setDescription('Hex color, e.g. #5cc8ff').setRequired(false))
            .addStringOption(o => o.setName('description').setDescription('Short description shown in the menu').setRequired(false)))
        .addSubcommand(sub => sub
            .setName('preset')
            .setDescription('(Admin) Auto-create a starter pack of roles + add them to the menu')
            .addStringOption(o => o.setName('pack').setDescription('Which starter pack').setRequired(true)
                .addChoices(
                    { name: 'platforms (PC, Xbox, PlayStation, Switch)', value: 'platforms' },
                    { name: 'regions (NA, EU, OCE, Asia)', value: 'regions' },
                    { name: 'pings (Double XP, Events, Streams, Announcements)', value: 'pings' },
                )))
        .addSubcommand(sub => sub
            .setName('recolor')
            .setDescription('(Admin) Give every self-assign role a fresh spread of colors'))
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('(Admin) Remove a role from the self-assign list')
            .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(true))
            .addBooleanOption(o => o.setName('delete_role').setDescription('Also delete the Discord role entirely (default: no)').setRequired(false)))
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('(Admin) Show the configured self-assign roles'))
        .addSubcommand(sub => sub
            .setName('post')
            .setDescription('(Admin) Post a persistent role picker panel')
            .addChannelOption(o => o.setName('channel').setDescription('Channel to post in (defaults to here)').addChannelTypes(ChannelType.GuildText).setRequired(false))
            .addStringOption(o => o.setName('title').setDescription('Panel title').setRequired(false))
            .addStringOption(o => o.setName('description').setDescription('Panel description').setRequired(false))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        // ── Member: open personal picker ────────────────────────────────────
        if (sub === 'menu') {
            const cfg = await GuildConfig.findOne({ guildId });
            if (cfg) await pruneStale(interaction.guild, cfg);
            const row = buildSelfRolesRow(cfg?.selfRoles || [], interaction.member.roles.cache.map(r => r.id), interaction.guild);
            if (!row) {
                return interaction.reply({ content: 'No self-assignable roles are set up yet.', flags: MessageFlags.Ephemeral });
            }
            const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven, Roles' })
                .setTitle('🎮 Pick Your Roles')
                .setDescription('Select the games you play and the pings you want. Deselect to remove.');
            return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
        }

        // ── Everything below is admin-only ──────────────────────────────────
        if (!requireManageRoles(interaction)) return;

        // Creating/editing roles needs the bot to hold Manage Roles.
        if ((sub === 'create' || sub === 'preset' || sub === 'recolor') && !interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: 'I need the **Manage Roles** permission to create or edit roles.', flags: MessageFlags.Ephemeral });
        }

        if (sub === 'recolor') {
            const cfg = await GuildConfig.findOne({ guildId });
            const roles = cfg?.selfRoles || [];
            if (!roles.length) {
                return interaction.reply({ content: 'No self-assign roles to recolor yet. Create some with `/roles create` or `/roles preset`.', flags: MessageFlags.Ephemeral });
            }
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Known games/platforms get their real color; the rest spread across
            // a shuffled palette so nothing repeats needlessly.
            const pool = [...COLOR_POOL].sort(() => Math.random() - 0.5);
            let recolored = 0, skipped = 0, i = 0;
            for (const sr of roles) {
                const role = interaction.guild.roles.cache.get(sr.roleId);
                if (!role) { skipped++; continue; }
                const color = smartColor(role.name) || pool[i % pool.length];
                try {
                    await role.setColors({ primaryColor: color }, 'Recolor via /roles recolor');
                    recolored++; i++;
                } catch { skipped++; }
            }
            return interaction.editReply(`🎨 Recolored **${recolored}** role(s), known games/platforms got their signature color${skipped ? `, skipped ${skipped} (my role must be **above** them).` : '.'}`);
        }

        if (sub === 'create') {
            const name = interaction.options.getString('name').trim();
            const cfg = await getOrCreateGuildConfig(guildId);
            if (cfg.selfRoles.length >= 25) {
                return interaction.reply({ content: 'The self-role menu is limited to 25 roles.', flags: MessageFlags.Ephemeral });
            }
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                const { role, created, listed } = await ensureSelfRole(interaction.guild, cfg, {
                    name,
                    emoji: interaction.options.getString('emoji') || null,
                    color: interaction.options.getString('color') || undefined,
                    description: interaction.options.getString('description') || null,
                });
                await cfg.save();
                invalidateGuildConfig(guildId);
                const note = listed ? 'was already in the menu' : (created ? 'created and added to the menu' : 'already existed, added to the menu');
                return interaction.editReply(`✅ ${role} ${note}.`);
            } catch (err) {
                return interaction.editReply(`Couldn't create that role: ${err.message}`);
            }
        }

        if (sub === 'preset') {
            const pack = interaction.options.getString('pack');
            const items = PRESETS[pack] || [];
            const cfg = await getOrCreateGuildConfig(guildId);
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const results = [];
            for (const item of items) {
                if (cfg.selfRoles.length >= 25) break;
                try {
                    const { role, created } = await ensureSelfRole(interaction.guild, cfg, item);
                    results.push(`${created ? '🆕' : '↩️'} ${role}`);
                } catch (err) {
                    results.push(`⚠️ ${item.name}: ${err.message}`);
                }
            }
            await cfg.save();
            invalidateGuildConfig(guildId);

            const embed = brandedEmbed({ color: COLORS.success, footer: 'Glitch Haven, Roles' })
                .setTitle(`✅ Starter pack: ${pack}`)
                .setDescription(`${results.join('\n')}\n\nPost the picker with \`/roles post\` when you're ready.`);
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'add') {
            const role = interaction.options.getRole('role');
            if (role.managed || role.id === guildId) {
                return interaction.reply({ content: 'That role is managed by an integration and cannot be self-assigned.', flags: MessageFlags.Ephemeral });
            }
            if (interaction.guild.members.me.roles.highest.comparePositionTo(role) <= 0) {
                return interaction.reply({ content: `My highest role must be **above** ${role} for me to assign it. Move my role up.`, flags: MessageFlags.Ephemeral });
            }

            const cfg = await getOrCreateGuildConfig(guildId);
            if (cfg.selfRoles.some(r => r.roleId === role.id)) {
                return interaction.reply({ content: `${role} is already self-assignable.`, flags: MessageFlags.Ephemeral });
            }
            if (cfg.selfRoles.length >= 25) {
                return interaction.reply({ content: 'The self-role menu is limited to 25 roles.', flags: MessageFlags.Ephemeral });
            }

            cfg.selfRoles.push({
                roleId: role.id,
                label: (interaction.options.getString('label') || role.name).slice(0, 80),
                emoji: interaction.options.getString('emoji') || null,
                description: interaction.options.getString('description') || null,
            });
            await cfg.save();
            invalidateGuildConfig(guildId);
            return interaction.reply({ content: `Added ${role} to the self-assign menu.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'remove') {
            const role = interaction.options.getRole('role');
            const deleteRole = interaction.options.getBoolean('delete_role') ?? false;
            const roleName = role.name;

            const cfg = await getOrCreateGuildConfig(guildId);
            const before = cfg.selfRoles.length;
            cfg.selfRoles = cfg.selfRoles.filter(r => r.roleId !== role.id);
            const wasListed = cfg.selfRoles.length !== before;
            if (wasListed) {
                await cfg.save();
                invalidateGuildConfig(guildId);
            }

            if (deleteRole) {
                if (role.id === guildId) {
                    return interaction.reply({ content: 'I can\'t delete the @everyone role.', flags: MessageFlags.Ephemeral });
                }
                if (!role.deletable) {
                    return interaction.reply({ content: `Removed from the menu, but I can't delete **${roleName}**, it's above my role or managed by an integration.`, flags: MessageFlags.Ephemeral });
                }
                try {
                    await role.delete('Deleted via /roles remove');
                    return interaction.reply({ content: `🗑️ Deleted the **${roleName}** role${wasListed ? ' and removed it from the menu' : ''}.`, flags: MessageFlags.Ephemeral });
                } catch (err) {
                    return interaction.reply({ content: `Removed from the menu, but couldn't delete the role: ${err.message}`, flags: MessageFlags.Ephemeral });
                }
            }

            if (!wasListed) {
                return interaction.reply({ content: `${role} wasn't in the self-assign list.`, flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ content: `Removed ${role} from the self-assign menu (the role itself still exists).`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'list') {
            const cfg = await GuildConfig.findOne({ guildId });
            const pruned = cfg ? await pruneStale(interaction.guild, cfg) : 0;
            const roles = cfg?.selfRoles || [];
            const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven, Roles' })
                .setTitle('Self-Assignable Roles')
                .setDescription(roles.length
                    ? roles.map(r => `${r.emoji ? r.emoji + ' ' : ''}<@&${r.roleId}>, ${r.label}${r.description ? ` *(${r.description})*` : ''}`).join('\n')
                    : 'None configured. Add some with `/roles add`.');
            if (pruned) embed.setFooter({ text: `Glitch Haven, Roles, cleaned up ${pruned} deleted role(s)` });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (sub === 'post') {
            const cfg = await GuildConfig.findOne({ guildId });
            if (cfg) await pruneStale(interaction.guild, cfg);
            // Validate there's at least one live role to offer.
            const hasRoles = buildSelfRolesRow(cfg?.selfRoles || [], null, interaction.guild);
            if (!hasRoles) {
                return interaction.reply({ content: 'Add roles with `/roles add` before posting a panel.', flags: MessageFlags.Ephemeral });
            }
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven, Roles' })
                .setTitle(interaction.options.getString('title') || '🎮 Pick Your Roles')
                .setDescription(interaction.options.getString('description')
                    || 'Click the button below to open your personal role picker. Your menu is always up to date.');

            // Post a button (not a static select) so the picker is rebuilt live
            // on every click, deleted roles never linger on the panel.
            await channel.send({ embeds: [embed], components: [buildPanelButton()] });
            return interaction.reply({ content: `Posted the role panel in ${channel}.`, flags: MessageFlags.Ephemeral });
        }
    },
};
