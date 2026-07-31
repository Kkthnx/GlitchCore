/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { brandedEmbed, COLORS } = require('../utils/brand');

// Admin-only commands are grouped separately so they don't clutter the
// member-facing list. Everything else is auto-discovered from the loaded
// command collection, so this never drifts out of sync with reality.
const ADMIN_COMMANDS = new Set(['settings', 'levelrewards', 'giveaway', 'streamers', 'reactionrole', 'warn', 'timeout', 'kick', 'ban', 'infractions', 'purge', 'slowmode', 'lock', 'unlock']);

const FIELD_LIMIT = 1024;

// Adds a group as one or more embed fields, never exceeding Discord's 1024-char
// field limit. Continuation fields use a zero-width name so it reads as one
// section. Without this, /help throws once enough commands are registered.
function addGroup(embed, name, list) {
    const lines = list.map(c => `\`/${c.data.name}\`, ${c.data.description}`);
    if (!lines.length) {
        embed.addFields({ name, value: '*None available.*' });
        return;
    }

    let buf = '';
    let first = true;
    for (const line of lines) {
        if (buf && buf.length + 1 + line.length > FIELD_LIMIT) {
            embed.addFields({ name: first ? name : '​', value: buf });
            buf = '';
            first = false;
        }
        buf = buf ? `${buf}\n${line}` : line;
    }
    if (buf) embed.addFields({ name: first ? name : '​', value: buf });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show help information for GlitchCore commands'),

    async execute(interaction) {
        const commands = [...interaction.client.commands.values()]
            .sort((a, b) => a.data.name.localeCompare(b.data.name));

        const member = commands.filter(c => !ADMIN_COMMANDS.has(c.data.name));
        const admin = commands.filter(c => ADMIN_COMMANDS.has(c.data.name));

        const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven, GlitchCore' })
            .setTitle('GlitchCore, Command Guide')
            .setDescription('Earn XP by chatting and hanging in voice, climb the leaderboard, squad up with LFG, and join game-night events.');

        addGroup(embed, '🎮 Members', member);
        if (admin.length) addGroup(embed, '🛠️ Server Admins', admin);

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
