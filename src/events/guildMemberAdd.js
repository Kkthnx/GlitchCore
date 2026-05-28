const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const buildWelcomeImage = require('../utils/generateWelcomeImage');
const config = require('../../config.json');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member, client) {
        // 1. Auto-Role Assignment
        try {
            const memberRole = member.guild.roles.cache.get(config.roles.member);
            if (memberRole) {
                await member.roles.add(memberRole);
            } else {
                console.warn('Member role ID is invalid or missing in config.json');
            }
        } catch (err) {
            console.error(`Failed to assign role to ${member.user.tag}:`, err);
        }

        // 2. Private Message the User
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('Welcome to GlitchHaven!')
                .setDescription(`Hey ${member.user.username}, thanks for joining! Head over to the chat channels to level up, or use our LFG channels to squad up.`)
                .setColor(config.theme.blue);

            await member.send({ embeds: [dmEmbed] });
        } catch (err) {
            // This triggers if the user has their DMs locked/disabled
            console.log(`Could not send DM to ${member.user.tag}.`);
        }

        // 3. Generate and Send Welcome Banner
        try {
            const welcomeChannel = member.guild.channels.cache.get(config.channels.welcome);
            if (!welcomeChannel) return console.warn('Welcome channel ID is invalid or missing.');

            // Generate the image buffer from our canvas utility
            const imageBuffer = await buildWelcomeImage(member.user);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'welcome-image.png' });

            const welcomeEmbed = new EmbedBuilder()
                .setTitle('A new gamer has arrived!')
                .setDescription(`Welcome to the server, ${member}! You are member **#${member.guild.memberCount}**.`)
                .setColor(config.theme.silver)
                .setImage('attachment://welcome-image.png');

            await welcomeChannel.send({ embeds: [welcomeEmbed], files: [attachment] });
        } catch (err) {
            console.error('Failed to send welcome message:', err);
        }
    }
};