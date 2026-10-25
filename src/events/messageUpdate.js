/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { getAuditChannel, postAudit } = require('../utils/auditLog');
const { evaluateContentFilter, enforceContentFilter } = require('../utils/autoMod');
const { getGuildConfig } = require('../utils/guildConfigCache');
const logger = require('../utils/logger');

function clip(text) {
    return text || '_(empty)_';
}

// Logs message edits to the guild's mod-log channel for audit trails.
module.exports = {
    name: 'messageUpdate',
    async execute(oldMessage, newMessage) {
        try {
            if (!newMessage.guild) return;
            if (newMessage.author?.bot) return;
            // Skip uncached (partial) originals so we don't log false edits when
            // Discord adds embed unfurls to old messages we never had content for.
            if (oldMessage.partial) return;
            // Only content edits matter here. Embed unfurls fire this too.
            if (oldMessage.content === newMessage.content) return;

            // Run the word filter on the edit. Without this, posting something
            // clean and editing it into a slur walked straight past the filter.
            // The audit entry below still logs the edit, so mods see what it
            // was changed to.
            if (!newMessage.partial && newMessage.author) {
                const guildConfig = await getGuildConfig(newMessage.guild.id) || {};
                const violation = evaluateContentFilter(newMessage, guildConfig);
                if (violation) await enforceContentFilter(newMessage, violation, guildConfig);
            }

            const channel = await getAuditChannel(newMessage.guild);
            if (!channel) return;

            const who = newMessage.author ? `${newMessage.author.tag} (${newMessage.author.id})` : 'Unknown';
            await postAudit(newMessage.guild, {
                title: 'MESSAGE_EDITED',
                color: 'hype',
                description: `In ${newMessage.channel}, [jump](${newMessage.url})`,
                fields: [
                    { name: 'Author', value: who },
                    { name: 'Before', value: clip(oldMessage.content) },
                    { name: 'After', value: clip(newMessage.content) },
                ],
            }, channel);
        } catch (err) {
            logger.error('messageUpdate audit log failed:', err);
        }
    },
};
