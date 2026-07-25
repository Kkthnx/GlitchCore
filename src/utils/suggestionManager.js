/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const Suggestion = require('../database/SuggestionSchema');
const { brandedEmbed, COLORS, progressBar } = require('./brand');

const BTN = { up: 'suggest:up', down: 'suggest:down', approve: 'suggest:approve', deny: 'suggest:deny' };

const STATUS = {
    pending: { color: COLORS.neutral, label: '🕓 Pending' },
    approved: { color: COLORS.success, label: '✅ Approved' },
    denied: { color: COLORS.danger, label: '❌ Denied' },
};

/**
 * Toggle a member's vote. Clicking your current vote removes it; clicking the
 * opposite switches sides. Pure and unit-tested.
 */
function applyVote(upvotes, downvotes, userId, dir) {
    const wasUp = upvotes.includes(userId);
    const wasDown = downvotes.includes(userId);
    const up = upvotes.filter(u => u !== userId);
    const down = downvotes.filter(u => u !== userId);
    if (dir === 'up' && !wasUp) up.push(userId);
    if (dir === 'down' && !wasDown) down.push(userId);
    return { up, down };
}

function buildSuggestionEmbed(s, authorTag, authorIcon) {
    const up = s.upvotes.length;
    const down = s.downvotes.length;
    const total = up + down;
    const ratio = total ? up / total : 0;
    const st = STATUS[s.status] || STATUS.pending;

    return brandedEmbed({ color: st.color, footer: 'Glitch Haven • Suggestions' })
        .setAuthor({ name: authorTag || 'Suggestion', iconURL: authorIcon || undefined })
        .setDescription(s.text)
        .addFields(
            { name: 'Status', value: st.label, inline: true },
            { name: 'Votes', value: `👍 ${up} · 👎 ${down}`, inline: true },
            { name: 'Approval', value: `${progressBar(ratio)} ${Math.round(ratio * 100)}%`, inline: false },
        );
}

function buildSuggestionButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(BTN.up).setEmoji('👍').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(BTN.down).setEmoji('👎').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(BTN.approve).setLabel('Approve').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(BTN.deny).setLabel('Deny').setStyle(ButtonStyle.Secondary),
    );
}

async function handleSuggestionButton(interaction) {
    const action = interaction.customId.split(':')[1];
    const s = await Suggestion.findOne({ messageId: interaction.message.id });
    if (!s) return interaction.reply({ content: 'This suggestion no longer exists.', flags: MessageFlags.Ephemeral });

    // Approve / deny — managers only.
    if (action === 'approve' || action === 'deny') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: 'Only managers can approve or deny suggestions.', flags: MessageFlags.Ephemeral });
        }
        s.status = action === 'approve' ? 'approved' : 'denied';
        await s.save();
    } else {
        // Up / down vote — toggle.
        const { up, down } = applyVote(s.upvotes, s.downvotes, interaction.user.id, action);
        s.upvotes = up;
        s.downvotes = down;
        await s.save();
    }

    const author = await interaction.client.users.fetch(s.authorId).catch(() => null);
    const embed = buildSuggestionEmbed(s, author ? author.tag : 'Suggestion', author?.displayAvatarURL());
    return interaction.update({ embeds: [embed], components: [buildSuggestionButtons()] });
}

module.exports = { BTN, applyVote, buildSuggestionEmbed, buildSuggestionButtons, handleSuggestionButton };
