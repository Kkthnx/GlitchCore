/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { AttachmentBuilder } = require('discord.js');
const buildWelcomeImage = require('../utils/generateWelcomeImage');
const { brandedEmbed, COLORS } = require('../utils/brand');
const config = require('../../config.json');
const logger = require('../utils/logger');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        // 1. Auto-Role Assignment
        try {
            const memberRole = member.guild.roles.cache.get(config.roles.member);
            if (memberRole) {
                await member.roles.add(memberRole);
            } else {
                logger.warn('Member role ID is invalid or missing in config.json');
            }
        } catch (err) {
            logger.error(`Failed to assign role to ${member.user.tag}:`, err);
        }

        // 2. Private Message the User
        try {
            const dmEmbed = brandedEmbed({ color: COLORS.primary })
                .setTitle('Welcome to Glitch Haven!')
                .setDescription(`Hey ${member.user.username}, thanks for joining! Head over to the chat channels to level up, or use our LFG channels to squad up.`);

            await member.send({ embeds: [dmEmbed] });
        } catch (err) {
            // This triggers if the user has their DMs locked/disabled
            logger.info(`Could not send DM to ${member.user.tag}.`);
        }

        // 3. Generate and Send Welcome Banner
        try {
            const welcomeChannel = member.guild.channels.cache.get(config.channels.welcome);
            if (!welcomeChannel) return logger.warn('Welcome channel ID is invalid or missing.');

            // Generate the image buffer from our canvas utility
            const imageBuffer = await buildWelcomeImage(member.user);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'welcome-image.png' });

            const welcomeEmbed = brandedEmbed({ color: COLORS.success })
                .setTitle('A new gamer has arrived!')
                .setDescription(`Welcome to the server, ${member}! You are member **#${member.guild.memberCount}**.`)
                .setImage('attachment://welcome-image.png');

            await welcomeChannel.send({ embeds: [welcomeEmbed], files: [attachment] });
        } catch (err) {
            logger.error('Failed to send welcome message:', err);
        }
    }
};