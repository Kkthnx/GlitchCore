/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { EmbedBuilder } = require('discord.js');
const levelUpSayings = require('./levelUpSayings');
const { isDoubleXpActive } = require('./isDoubleXp');
const { getGuildConfig } = require('../utils/guildConfigCache');
const { PALETTE } = require('./brand');
const config = require('../../config.json');
const logger = require('./logger');

// Terminal / glitch ANSI helpers (match the LFG and event systems).
const ESC = '\x1b';
const G = `${ESC}[1;32m`;
const Y = `${ESC}[1;33m`;
const RST = `${ESC}[0m`;

/**
 * Generates and sends a stylized level up embed.
 * @param {string} userId - The Discord user ID
 * @param {string} guildId - The Discord guild ID
 * @param {number} newLevel - The user's new level
 * @param {Client} client - The Discord.js client
 */
async function sendLevelUpEmbed(userId, guildId, newLevel, client) {
    let channelId = config.channels.levelUpLog;
    try {
        const guildSettings = await getGuildConfig(guildId) || {};
        channelId = guildSettings.levelUpLogChannelId || channelId;
    } catch (err) {
        logger.warn('Could not load guild settings for level up log channel fallback:', err);
    }

    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    try {
        const guild = client.guilds.cache.get(guildId);
        let member = null;
        let discordUser = null;
        let color = PALETTE.gen; // Default: Glitch Haven teal

        if (guild) {
            // Check cache first (free), only fall back to a REST fetch if not cached
            member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
            if (member) {
                discordUser = member.user;
                // Use the highest role color if they have one set
                if (member.displayHexColor && member.displayHexColor !== '#000000') {
                    color = member.displayHexColor;
                }
            }
        }

        // Fallback to fetching just the user if member fetch failed
        if (!discordUser) {
            discordUser = await client.users.fetch(userId).catch(() => null);
        }

        const name = discordUser ? (discordUser.globalName || discordUser.username) : 'PLAYER';
        const avatar = discordUser ? discordUser.displayAvatarURL({ dynamic: true }) : null;
        const randomSaying = levelUpSayings[Math.floor(Math.random() * levelUpSayings.length)];

        const readout = [
            '```ansi',
            `${G}USER  ${RST} : ${name}`,
            `${G}LEVEL ${RST} : ${Y}${newLevel}${RST}`,
            `${G}STATUS${RST} : ${G}[ RANK INCREASED ]${RST}`,
            '```',
        ].join('\n');

        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({ name: '⚡ SYSTEM.LEVEL_UP', iconURL: avatar })
            .setTitle(`> ${name.toUpperCase()} LEVELED UP`)
            .setDescription(
                `${readout}\n` +
                `<@${userId}> just advanced to **Level ${newLevel}**.\n\n` +
                `_"${randomSaying}"_` +
                (isDoubleXpActive() ? `\n\n🔥 **Double XP Weekend** active, you are earning 2x XP right now.` : '')
            )
            .setThumbnail(discordUser ? discordUser.displayAvatarURL({ dynamic: true, size: 256 }) : null)
            .setFooter({ text: 'GLITCH_HAVEN // LEVELING' })
            .setTimestamp();

        // Send with ping outside the embed so they actually get notified
        await channel.send({ content: `<@${userId}>`, embeds: [embed] });
    } catch (err) {
        logger.error('Failed to send level up embed:', err);
    }
}

module.exports = { sendLevelUpEmbed };
