/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, version: djsVersion } = require('discord.js');
const { getVersionInfo } = require('../../utils/version');
const { brandedEmbed, COLORS } = require('../../utils/brand');
const { humanizeDuration } = require('../../utils/duration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('version')
        .setDescription('Show which build the bot is running (to verify deploys)'),

    async execute(interaction) {
        const v = getVersionInfo();
        const ping = Math.max(0, Math.round(interaction.client.ws.ping));
        const uptime = humanizeDuration(process.uptime() * 1000);
        const deployed = v.commitDate
            ? `<t:${Math.floor(new Date(v.commitDate).getTime() / 1000)}:R>`
            : 'unknown';

        const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven, Version' })
            .setTitle('🤖 GlitchCore Build')
            .addFields(
                { name: 'Commit', value: v.commit ? `\`${v.commit}\`${v.branch ? ` (${v.branch})` : ''}` : `v${v.version}`, inline: true },
                { name: 'Built', value: deployed, inline: true },
                { name: 'Uptime', value: `\`${uptime}\``, inline: true },
                { name: 'Latest change', value: v.subject ? `\`${v.subject}\`` : 'none', inline: false },
                { name: 'Latency', value: `\`${ping}ms\``, inline: true },
                { name: 'discord.js', value: `\`v${djsVersion}\``, inline: true },
                { name: 'Node', value: `\`${process.version}\``, inline: true },
            );

        return interaction.reply({ embeds: [embed] });
    },
};
