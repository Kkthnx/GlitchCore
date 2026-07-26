/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const mongoose = require('mongoose');

// Maps an original message to its posted starboard entry so the count can be
// updated in place and the same message is never starred twice.
const starboardSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    originMessageId: { type: String, required: true, unique: true },
    originChannelId: { type: String, required: true },
    starboardMessageId: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Starboard', starboardSchema);
