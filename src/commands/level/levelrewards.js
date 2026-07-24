const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const GuildConfig = require('../../database/GuildConfigSchema');
const { invalidateGuildConfig } = require('../../utils/guildConfigCache');
const { currentMilestone, roleNameFor } = require('../../utils/levelRoles');
const { brandedEmbed, COLORS } = require('../../utils/brand');
const appConfig = require('../../../config.json');

const HARD_MAX = appConfig.xpSettings.maxLevel || 1000;

async function loadConfig(guildId) {
    let cfg = await GuildConfig.findOne({ guildId });
    if (!cfg) cfg = await GuildConfig.create({ guildId });
    return cfg;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('levelrewards')
        .setDescription('Configure automated milestone level-roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(sub => sub
            .setName('milestones')
            .setDescription('Grant a role at every N levels (roles are auto-created)')
            .addIntegerOption(o => o.setName('interval').setDescription('Levels between rewards, e.g. 10').setMinValue(1).setMaxValue(HARD_MAX).setRequired(true))
            .addIntegerOption(o => o.setName('max').setDescription(`Highest milestone to grant (max ${HARD_MAX})`).setMinValue(1).setMaxValue(HARD_MAX).setRequired(false))
            .addStringOption(o => o.setName('template').setDescription('Role name; use {level}, e.g. "Level {level}"').setRequired(false))
            .addBooleanOption(o => o.setName('stack').setDescription('Keep every milestone role (default: only the highest)').setRequired(false)))
        .addSubcommand(sub => sub
            .setName('disable')
            .setDescription('Turn off automated milestone roles'))
        .addSubcommand(sub => sub
            .setName('preview')
            .setDescription('Show the current milestone configuration')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'milestones') {
            const interval = interaction.options.getInteger('interval');
            const max = Math.min(interaction.options.getInteger('max') ?? HARD_MAX, HARD_MAX);
            const template = interaction.options.getString('template') || 'Level {level}';
            const stack = interaction.options.getBoolean('stack') ?? false;

            if (!/\{level\}/i.test(template)) {
                return interaction.reply({ content: 'Your template must include `{level}` so each role gets a distinct name.', ephemeral: true });
            }
            if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return interaction.reply({ content: 'I need the **Manage Roles** permission to create and assign milestone roles.', ephemeral: true });
            }

            const cfg = await loadConfig(guildId);
            cfg.levelRoleInterval = interval;
            cfg.levelRoleMax = max;
            cfg.levelRoleTemplate = template;
            cfg.levelRoleStack = stack;
            await cfg.save();
            invalidateGuildConfig(guildId);

            const count = Math.floor(max / interval);
            const samples = [interval, interval * 2, max].filter((v, i, a) => a.indexOf(v) === i)
                .map(m => `• Level ${m} → **${roleNameFor(template, m)}**`).join('\n');

            const embed = brandedEmbed({ color: COLORS.success, footer: 'Glitch Haven • Level Rewards' })
                .setTitle('✅ Milestone roles configured')
                .setDescription(
                    `Members now earn a role every **${interval}** levels, up to level **${max}** (**${count}** milestones).\n` +
                    `Mode: **${stack ? 'stacking (keep all)' : 'rank (keep highest only)'}**\n\n` +
                    `${samples}\n\n` +
                    `Roles are created automatically the first time someone reaches each milestone. ` +
                    `Make sure my role sits **above** them so I can assign them.`
                );
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'disable') {
            const cfg = await loadConfig(guildId);
            cfg.levelRoleInterval = 0;
            await cfg.save();
            invalidateGuildConfig(guildId);
            return interaction.reply({ content: 'Automated milestone roles are now **disabled**. Existing roles were left untouched.', ephemeral: true });
        }

        // preview
        const cfg = await GuildConfig.findOne({ guildId });
        const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven • Level Rewards' })
            .setTitle('Milestone Level-Roles');

        if (!cfg?.levelRoleInterval) {
            embed.setDescription('Not configured. Set it up with `/levelrewards milestones interval:10`.');
        } else {
            const { levelRoleInterval: iv, levelRoleMax: mx, levelRoleTemplate: tpl, levelRoleStack: st } = cfg;
            const example = currentMilestone(37, iv, mx); // what a level-37 member would hold
            embed.setDescription(
                `**Interval:** every ${iv} levels\n` +
                `**Up to:** level ${mx}\n` +
                `**Template:** \`${tpl}\`\n` +
                `**Mode:** ${st ? 'stacking (keep all)' : 'rank (highest only)'}\n\n` +
                `Example — a level 37 member holds **${example ? roleNameFor(tpl, example) : 'no milestone yet'}**.`
            );
        }
        return interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
