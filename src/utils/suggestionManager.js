/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
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

function buildSuggestionEmbed(s, authorTag, authorIcon) {
    const up = s.upvotes.length;
    const down = s.downvotes.length;
    const total = up + down;
    const ratio = total ? up / total : 0;
    const st = STATUS[s.status] || STATUS.pending;

    return brandedEmbed({ color: st.color, footer: 'Glitch Haven, Suggestions' })
        .setAuthor({ name: authorTag || 'Suggestion', iconURL: authorIcon || undefined })
        .setDescription(s.text)
        .addFields(
            { name: 'Status', value: st.label, inline: true },
            { name: 'Votes', value: `👍 ${up}, 👎 ${down}`, inline: true },
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

/**
 * Translates a vote into the atomic update that applies it. Clicking your
 * current vote clears it; clicking the other side moves you across. Pure, so
 * the toggle logic stays unit-testable while the write stays a single op.
 */
function voteUpdate(userId, dir, alreadyVoted) {
    if (dir === 'up') {
        return alreadyVoted
            ? { $pull: { upvotes: userId, downvotes: userId } }
            : { $addToSet: { upvotes: userId }, $pull: { downvotes: userId } };
    }
    return alreadyVoted
        ? { $pull: { downvotes: userId, upvotes: userId } }
        : { $addToSet: { downvotes: userId }, $pull: { upvotes: userId } };
}

async function handleSuggestionButton(interaction) {
    const action = interaction.customId.split(':')[1];
    const messageId = interaction.message.id;
    const userId = interaction.user.id;

    let s;

    // Approve / deny, managers only.
    if (action === 'approve' || action === 'deny') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: 'Only managers can approve or deny suggestions.', flags: MessageFlags.Ephemeral });
        }
        s = await Suggestion.findOneAndUpdate(
            { messageId },
            { $set: { status: action === 'approve' ? 'approved' : 'denied' } },
            { new: true },
        ).lean();
    } else {
        // Up / down vote. Reading the arrays, rewriting them whole and saving
        // loses a vote whenever two members click at once, since the second
        // write is built from a snapshot taken before the first landed. Doing it
        // as $addToSet/$pull lets the server apply both.
        const current = await Suggestion.findOne({ messageId }, { upvotes: 1, downvotes: 1 }).lean();
        if (!current) return interaction.reply({ content: 'This suggestion no longer exists.', flags: MessageFlags.Ephemeral });

        const list = action === 'up' ? current.upvotes : current.downvotes;
        s = await Suggestion.findOneAndUpdate(
            { messageId },
            voteUpdate(userId, action, list.includes(userId)),
            { new: true },
        ).lean();
    }

    if (!s) return interaction.reply({ content: 'This suggestion no longer exists.', flags: MessageFlags.Ephemeral });

    const author = await interaction.client.users.fetch(s.authorId).catch(() => null);
    const embed = buildSuggestionEmbed(s, author ? author.tag : 'Suggestion', author?.displayAvatarURL());
    return interaction.update({ embeds: [embed], components: [buildSuggestionButtons()] });
}

module.exports = { BTN, voteUpdate, buildSuggestionEmbed, buildSuggestionButtons, handleSuggestionButton };
