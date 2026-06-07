const { EmbedBuilder } = require('discord.js');
const levelUpSayings = require('./levelUpSayings');
const { isDoubleXpActive } = require('./isDoubleXp');
const config = require('../../config.json');
const logger = require('./logger');

/**
 * Generates and sends a stylized level up embed.
 * @param {string} userId - The Discord user ID
 * @param {string} guildId - The Discord guild ID
 * @param {number} newLevel - The user's new level
 * @param {Client} client - The Discord.js client
 */
async function sendLevelUpEmbed(userId, guildId, newLevel, client) {
    const channel = client.channels.cache.get(config.channels.levelUpLog);
    if (!channel) return;

    try {
        const guild = client.guilds.cache.get(guildId);
        let member = null;
        let discordUser = null;
        let color = config.theme.silver; // Default fallback color

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

        const randomSaying = levelUpSayings[Math.floor(Math.random() * levelUpSayings.length)];
        
        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({ 
                name: `Level Up! - ${discordUser ? discordUser.username : 'User'}`, 
                iconURL: discordUser ? discordUser.displayAvatarURL({ dynamic: true }) : null 
            })
            .setDescription(
                `🎉 **Congratulations <@${userId}>!**\n\n` +
                `You have advanced to **Level ${newLevel}**!\n\n` +
                `*"${randomSaying}"*` +
                (isDoubleXpActive() ? '\n\n🔥 **Double XP Weekend** — you\'re earning 2× XP today!' : '')
            )
            .setThumbnail(discordUser ? discordUser.displayAvatarURL({ dynamic: true, size: 256 }) : null)
            .setFooter({ text: 'GlitchCore Leveling System' })
            .setTimestamp();

        // Send with ping outside the embed so they actually get notified
        await channel.send({ content: `<@${userId}>`, embeds: [embed] });
    } catch (err) {
        logger.error('Failed to send level up embed:', err);
    }
}

module.exports = { sendLevelUpEmbed };
