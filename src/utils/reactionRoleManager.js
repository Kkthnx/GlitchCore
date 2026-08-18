/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { EmbedBuilder } = require('discord.js');
const ReactionRole = require('../database/ReactionRoleSchema');
const { PALETTE } = require('./brand');
const logger = require('./logger');

// In-memory set of message IDs that are reaction-role menus. Reactions fire a
// lot, so this lets the handler skip a DB lookup for the vast majority of
// reactions that aren't on a menu. Loaded once on startup, kept in sync as
// menus are created.
const menuMessageIds = new Set();

async function loadMenuCache() {
    try {
        const docs = await ReactionRole.find({}, { messageId: 1 });
        menuMessageIds.clear();
        for (const d of docs) menuMessageIds.add(d.messageId);
        logger.info(`[REACTIONROLE] Cached ${menuMessageIds.size} menu message(s).`);
    } catch (err) {
        logger.error('[REACTIONROLE] Failed to load menu cache:', err);
    }
}

function trackMenu(messageId) {
    menuMessageIds.add(messageId);
}

// The stable identity of an emoji: the custom-emoji id if present, else the
// unicode character. Used both to store pairs and to match live reactions.
function emojiKeyFromReaction(emoji) {
    return emoji.id || emoji.name;
}

// Parse a slash-command emoji string into { key, display }. Accepts a unicode
// emoji or a custom emoji like <:name:123> / <a:name:123>.
function parseEmojiInput(input) {
    const custom = String(input).trim().match(/^<(a)?:(\w+):(\d+)>$/);
    if (custom) {
        return { key: custom[3], display: input.trim(), reactable: input.trim() };
    }
    const char = String(input).trim();
    return { key: char, display: char, reactable: char };
}

function buildMenuEmbed(doc) {
    const lines = doc.pairs.length
        ? doc.pairs.map(p => `${p.display} for <@&${p.roleId}>`).join('\n')
        : '_No roles yet. A manager can add some with /reactionrole add._';
    return new EmbedBuilder()
        .setColor(PALETTE.accent)
        .setTitle(doc.title)
        .setDescription(`${doc.description ? `${doc.description}\n\n` : ''}${lines}`)
        .setFooter({ text: 'Glitch Haven, React to get a role' });
}

// Adds or removes the mapped role when a member reacts on a menu message.
async function handleReactionRole(reaction, user, add) {
    try {
        const message = reaction.message;
        // Fast path: skip anything that isn't a known menu without touching
        // the DB. Partial messages still carry their id, so this is safe.
        if (!menuMessageIds.has(message.id)) return;

        if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
        if (!message?.guild) return;

        const doc = await ReactionRole.findOne({ messageId: message.id });
        if (!doc) return;

        const key = emojiKeyFromReaction(reaction.emoji);
        const pair = doc.pairs.find(p => p.emoji === key);
        if (!pair) return;

        const member = await message.guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        const role = message.guild.roles.cache.get(pair.roleId);
        if (!role) return;
        // Can't hand out a role above the bot's own highest role.
        if (role.position >= message.guild.members.me.roles.highest.position) return;

        if (add) await member.roles.add(role).catch(() => {});
        else await member.roles.remove(role).catch(() => {});
    } catch (err) {
        logger.error('[REACTIONROLE] handler failed:', err);
    }
}

module.exports = {
    handleReactionRole,
    buildMenuEmbed,
    parseEmojiInput,
    emojiKeyFromReaction,
    loadMenuCache,
    trackMenu,
};
