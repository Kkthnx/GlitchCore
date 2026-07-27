/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const mongoose = require('mongoose');

// One emoji-to-role pairing on a reaction-role message.
const pairSchema = new mongoose.Schema({
    emoji: { type: String, required: true },   // unicode char or custom emoji id
    label: { type: String, required: true },   // how it renders in the menu embed
    roleId: { type: String, required: true },
}, { _id: false });

// A message members react to for self-assignable roles.
const reactionRoleSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    title: { type: String, default: 'Reaction Roles' },
    description: { type: String, default: null },
    pairs: { type: [pairSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('ReactionRole', reactionRoleSchema);
