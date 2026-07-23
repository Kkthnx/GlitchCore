const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const GuildConfig = require('../../database/GuildConfigSchema');
const { invalidateGuildConfig } = require('../../utils/guildConfigCache');
const { buildSelfRolesRow, parseEmoji } = require('../../utils/selfRoleManager');
const { brandedEmbed, COLORS } = require('../../utils/brand');

async function loadConfig(guildId) {
    let cfg = await GuildConfig.findOne({ guildId });
    if (!cfg) cfg = await GuildConfig.create({ guildId });
    return cfg;
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
