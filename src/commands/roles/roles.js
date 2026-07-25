const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const GuildConfig = require('../../database/GuildConfigSchema');
const { invalidateGuildConfig } = require('../../utils/guildConfigCache');
const { buildSelfRolesRow } = require('../../utils/selfRoleManager');
const { brandedEmbed, COLORS, PALETTE } = require('../../utils/brand');

// Starter packs the bot can create in one command so admins never touch
// Server Settings for the common universal roles.
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
        { name: 'Double XP', emoji: '🔥', description: 'Pinged for Double XP weekends' },
        { name: 'Events', emoji: '📅', description: 'Pinged for game nights' },
        { name: 'Streams', emoji: '📺', description: 'Pinged when members go live' },
        { name: 'Announcements', emoji: '📢' },
    ],
};

async function loadConfig(guildId) {
    let cfg = await GuildConfig.findOne({ guildId });
    if (!cfg) cfg = await GuildConfig.create({ guildId });
    return cfg;
}

// Find a role by name (case-insensitive) or create it, then register it as
// self-assignable on the config (without saving — caller saves once).
function isUnicodeEmoji(str) {
    return Boolean(str) && !/^<a?:\w+:\d+>$/.test(str); // exclude custom <:name:id> emojis
}

async function ensureSelfRole(guild, cfg, { name, emoji = null, color, description = null, label = null }) {
    let role = guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase());
    let created = false;
    if (!role) {
        role = await guild.roles.create({
            name,
            color: color || PALETTE.accent,
            mentionable: false,
            reason: 'Self-assignable role created via /roles',
        });
        created = true;

        // If the server is boosted enough for role icons, set the emoji AS the
        // role icon — no image file needed.
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
        interaction.reply({ content: 'You need the **Manage Roles** permission to do that.', ephemeral: true });
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
            .setName('remove')
            .setDescription('(Admin) Remove a role from the self-assign list')
            .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(true)))
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
            const row = buildSelfRolesRow(cfg?.selfRoles || [], interaction.member.roles.cache.map(r => r.id));
            if (!row) {
                return interaction.reply({ content: 'No self-assignable roles are set up yet.', ephemeral: true });
            }
            const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven • Roles' })
                .setTitle('🎮 Pick Your Roles')
                .setDescription('Select the games you play and the pings you want. Deselect to remove.');
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        // ── Everything below is admin-only ──────────────────────────────────
        if (!requireManageRoles(interaction)) return;

        // Creating roles needs the bot to hold Manage Roles.
        if ((sub === 'create' || sub === 'preset') && !interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: 'I need the **Manage Roles** permission to create roles.', ephemeral: true });
        }

        if (sub === 'create') {
            const name = interaction.options.getString('name').trim();
            const cfg = await loadConfig(guildId);
            if (cfg.selfRoles.length >= 25) {
                return interaction.reply({ content: 'The self-role menu is limited to 25 roles.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            try {
                const { role, created, listed } = await ensureSelfRole(interaction.guild, cfg, {
                    name,
                    emoji: interaction.options.getString('emoji') || null,
                    color: interaction.options.getString('color') || undefined,
                    description: interaction.options.getString('description') || null,
                });
                await cfg.save();
                invalidateGuildConfig(guildId);
                const note = listed ? 'was already in the menu' : (created ? 'created and added to the menu' : 'already existed — added to the menu');
                return interaction.editReply(`✅ ${role} ${note}.`);
            } catch (err) {
                return interaction.editReply(`Couldn't create that role: ${err.message}`);
            }
        }

        if (sub === 'preset') {
            const pack = interaction.options.getString('pack');
            const items = PRESETS[pack] || [];
            const cfg = await loadConfig(guildId);
            await interaction.deferReply({ ephemeral: true });

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

            const embed = brandedEmbed({ color: COLORS.success, footer: 'Glitch Haven • Roles' })
                .setTitle(`✅ Starter pack: ${pack}`)
                .setDescription(`${results.join('\n')}\n\nPost the picker with \`/roles post\` when you're ready.`);
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'add') {
            const role = interaction.options.getRole('role');
            if (role.managed || role.id === guildId) {
                return interaction.reply({ content: 'That role is managed by an integration and cannot be self-assigned.', ephemeral: true });
            }
            if (interaction.guild.members.me.roles.highest.comparePositionTo(role) <= 0) {
                return interaction.reply({ content: `My highest role must be **above** ${role} for me to assign it. Move my role up.`, ephemeral: true });
            }

            const cfg = await loadConfig(guildId);
            if (cfg.selfRoles.some(r => r.roleId === role.id)) {
                return interaction.reply({ content: `${role} is already self-assignable.`, ephemeral: true });
            }
            if (cfg.selfRoles.length >= 25) {
                return interaction.reply({ content: 'The self-role menu is limited to 25 roles.', ephemeral: true });
            }

            cfg.selfRoles.push({
                roleId: role.id,
                label: (interaction.options.getString('label') || role.name).slice(0, 80),
                emoji: interaction.options.getString('emoji') || null,
                description: interaction.options.getString('description') || null,
            });
            await cfg.save();
            invalidateGuildConfig(guildId);
            return interaction.reply({ content: `Added ${role} to the self-assign menu.`, ephemeral: true });
        }

        if (sub === 'remove') {
            const role = interaction.options.getRole('role');
            const cfg = await loadConfig(guildId);
            const before = cfg.selfRoles.length;
            cfg.selfRoles = cfg.selfRoles.filter(r => r.roleId !== role.id);
            if (cfg.selfRoles.length === before) {
                return interaction.reply({ content: `${role} wasn't in the self-assign list.`, ephemeral: true });
            }
            await cfg.save();
            invalidateGuildConfig(guildId);
            return interaction.reply({ content: `Removed ${role} from the self-assign menu.`, ephemeral: true });
        }

        if (sub === 'list') {
            const cfg = await GuildConfig.findOne({ guildId });
            const roles = cfg?.selfRoles || [];
            const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven • Roles' })
                .setTitle('Self-Assignable Roles')
                .setDescription(roles.length
                    ? roles.map(r => `${r.emoji ? r.emoji + ' ' : ''}<@&${r.roleId}> — ${r.label}${r.description ? ` *(${r.description})*` : ''}`).join('\n')
                    : 'None configured. Add some with `/roles add`.');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'post') {
            const cfg = await GuildConfig.findOne({ guildId });
            const row = buildSelfRolesRow(cfg?.selfRoles || []);
            if (!row) {
                return interaction.reply({ content: 'Add roles with `/roles add` before posting a panel.', ephemeral: true });
            }
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven • Roles' })
                .setTitle(interaction.options.getString('title') || '🎮 Pick Your Roles')
                .setDescription(interaction.options.getString('description')
                    || 'Use the menu below to choose the games you play and the pings you want. Deselect to remove a role.');

            await channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: `Posted the role panel in ${channel}.`, ephemeral: true });
        }
    },
};
