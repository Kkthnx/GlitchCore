/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { farewells, pick } = require('../utils/welcomeSayings');
const { brandedEmbed, COLORS } = require('../utils/brand');
const config = require('../../config.json');
const logger = require('../utils/logger');

// Posts a sly farewell when a member leaves. Uses the leave channel if set,
// otherwise falls back to the welcome channel.
module.exports = {
    name: 'guildMemberRemove',
    async execute(member) {
        try {
            const channelId = config.channels.leave || config.channels.welcome;
            const channel = member.guild.channels.cache.get(channelId);
            if (!channel) return;

            const name = member.user ? `**${member.user.username}**` : 'A member';
            const count = member.guild.memberCount;

            const embed = brandedEmbed({ color: COLORS.danger, footer: 'GLITCH_HAVEN // USER_DISCONNECTED' })
                .setAuthor({ name: '⚡ SYSTEM.DISCONNECT' })
                .setTitle('> CONNECTION LOST')
                .setDescription(`${name} left Glitch Haven.\n\n_${pick(farewells)}_\n\nPlayers remaining **${count}**.`);

            if (member.user) embed.setThumbnail(member.user.displayAvatarURL());

            await channel.send({ embeds: [embed] });
        } catch (err) {
            logger.error('Failed to send leave message:', err);
        }
    },
};
