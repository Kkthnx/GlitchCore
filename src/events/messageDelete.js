/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { getAuditChannel, postAudit } = require('../utils/auditLog');
const { removeForDeletedOrigins } = require('../utils/starboardManager');
const logger = require('../utils/logger');

// What was in the message, including files and stickers. A deleted image used
// to log as "no text", which told a moderator nothing about what was removed.
function describeBody(message) {
    const parts = [];
    if (message.content) parts.push(message.content);

    const files = [...(message.attachments?.values() ?? [])].map(a => a.name).filter(Boolean);
    if (files.length) parts.push(`Attachments, ${files.join(', ')}`);

    const stickers = [...(message.stickers?.values() ?? [])].map(s => s.name).filter(Boolean);
    if (stickers.length) parts.push(`Stickers, ${stickers.join(', ')}`);

    return parts.length ? parts.join('\n') : '_(no text, likely an embed)_';
}

// Logs deleted messages to the guild's mod-log channel for audit trails.
module.exports = {
    name: 'messageDelete',
    async execute(message) {
        try {
            if (!message.guild) return;

            // Runs for partial deletes too: a starred message that has aged out
            // of cache still leaves its copy in the highlights channel, so the
            // teardown must not be gated on having the content.
            await removeForDeletedOrigins(message.guild, [message.id])
                .catch(err => logger.error('[STARBOARD] Teardown on delete failed:', err));

            // Uncached (partial) deletes carry no author or content, so an entry
            // for one is pure noise. It also catches the bot's own self-deleted
            // messages (event cards, expired pings, starboard cleanup) once they
            // age out of cache. Only log deletes we actually have data for.
            if (message.partial) return;
            if (message.author?.bot) return;

            const channel = await getAuditChannel(message.guild);
            if (!channel) return;

            const who = message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown (uncached)';
            await postAudit(message.guild, {
                title: 'MESSAGE_DELETED',
                color: 'danger',
                description: `In ${message.channel}`,
                fields: [
                    { name: 'Author', value: who },
                    { name: 'Content', value: describeBody(message) },
                ],
            }, channel);
        } catch (err) {
            logger.error('messageDelete audit log failed:', err);
        }
    },
};
